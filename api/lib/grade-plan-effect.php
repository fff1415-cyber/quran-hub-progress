<?php
declare(strict_types=1);

/** Projection changes are backed by immutable event copies; unknown legacy links are never inferred. */
function grade_plan_effect(PDO $pdo,int $cid,array $auth,array $effect,string $operation,stdClass $grades):void {
    plans_require_roles($auth,['teacher','assistant','manager']);
    $student=(string)($effect['student_id']??'');$expected=(string)($effect['expected_assignment_id']??'');$task=(string)($effect['task_type']??'');
    $path=grade_cells_path($effect['cell_path']??null);
    if($expected===''||count($path)!==5||$path[0]!==$student||$path[2]!=='days'||$path[4]!==$task||!in_array($task,['hifz','rabt','muraja'],true))throw new RuntimeException('لم تُثبت هوية التعيين المرتبط بهذه الخلية؛ بقيت المسودة دون حفظ جزئي',409);
    $tenants=plans_tenant_enabled($pdo);plans_assert_student_in_complex($pdo,$student,$cid,$tenants);plans_assert_teacher_student_access($pdo,$auth,$student,$tenants);
    $lock=$pdo->prepare('SELECT id FROM students WHERE id=? FOR UPDATE');$lock->execute([$student]);
    $query=$pdo->prepare("SELECT spa.id,spa.plan_id,spa.start_segment_index,spa.start_muraja_segment,ep.track,ep.level_number FROM student_plan_assignments spa JOIN education_plans ep ON ep.id=spa.plan_id WHERE spa.student_id=? AND spa.status IN ('active','frozen') FOR UPDATE");$query->execute([$student]);$assignments=$query->fetchAll();
    if(count($assignments)!==1||$assignments[0]['id']!==$expected)throw new RuntimeException('تغيّر التعيين أو توجد تعيينات ملتبسة؛ لم تُحفظ الدرجة أو الإنجاز',409);
    $assignment=$assignments[0];
    $check=$pdo->prepare('SELECT status FROM student_plan_assignments WHERE id=?');$check->execute([$expected]);if($check->fetchColumn()!=='active')throw new RuntimeException('الخطة مجمدة؛ لم تُحفظ عملية جزئية',409);
    $key='grade_plan_cell:'.hash('sha256',grade_cells_json([$expected,$path]));
    $scoped=app_state_tenant_enabled($pdo);$query=$pdo->prepare('SELECT value FROM app_state WHERE '.($scoped?'complex_id=? AND ':'').'`key`=? FOR UPDATE');$query->execute($scoped?[$cid,$key]:[$key]);$raw=$query->fetchColumn();$previous=$raw===false?null:json_decode((string)$raw,true,512,JSON_THROW_ON_ERROR);
    $action=(string)($effect['action']??'');$rows=[];
    if($action==='undo'){
        if(!is_array($previous)||($previous['status']??'')!=='active'||($previous['assignment_id']??'')!==$expected)throw new RuntimeException('لا يوجد رابط إنجاز مؤكد لهذه الخلية؛ لم يُحذف أي إنجاز تاريخي بالتخمين',409);
        foreach($previous['rows']as$row){
            $find=$pdo->prepare('SELECT * FROM segment_completions WHERE id=? AND student_id=? AND plan_id=? AND assignment_id=? AND task_type=? FOR UPDATE');$find->execute([$row['id'],$student,$assignment['plan_id'],$expected,$task]);$current=$find->fetch();
            if(!$current||grade_cells_json($current)!==grade_cells_json($row))throw new RuntimeException('تغيّر الإنجاز المرتبط؛ لم تُحذف كتابة أخرى',409);
            $rows[]=$current;
        }
        // Full original rows remain permanently in both the creation event and this reversal event.
        foreach($rows as$row)$pdo->prepare('DELETE FROM segment_completions WHERE id=? AND assignment_id=?')->execute([$row['id'],$expected]);
    }elseif($action==='record'){
        if(is_array($previous)&&($previous['status']??'')==='active')throw new RuntimeException('الخلية مرتبطة بإنجاز مؤكد؛ ألغِ تسجيلها قبل استبداله',409);
        $date=(string)($effect['completed_at']??'');$parts=explode('-',$date);
        if(!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$date)||!checkdate((int)($parts[1]??0),(int)($parts[2]??0),(int)($parts[0]??0)))throw new RuntimeException('تاريخ الإنجاز غير صالح',400);
        $tap=(string)($effect['tap']??'');if(!in_array($tap,['half','one','two'],true))throw new RuntimeException('إدخال الإنجاز غير صالح',400);
        $q=$pdo->prepare('SELECT segment_index FROM plan_segments WHERE plan_id=? ORDER BY segment_index');$q->execute([$assignment['plan_id']]);$segments=array_map('intval',$q->fetchAll(PDO::FETCH_COLUMN));
        $q=$pdo->prepare('SELECT segment_index,task_type FROM segment_completions WHERE student_id=? AND plan_id=? AND assignment_id=?');$q->execute([$student,$assignment['plan_id'],$expected]);$done=$q->fetchAll();
        $hifz=array_map('intval',array_column(array_filter($done,static fn($r)=>$r['task_type']==='hifz'),'segment_index'));
        $taskDone=array_map('intval',array_column(array_filter($done,static fn($r)=>$r['task_type']===$task),'segment_index'));
        if($task==='hifz')$next=plans_next_hifz_segments_for_tap($assignment['track'],$tap,(int)$assignment['start_segment_index'],$segments,$hifz);
        else{$segment=plans_next_segment_for_task($task,(int)$assignment['start_segment_index'],$assignment['start_muraja_segment']===null?null:(int)$assignment['start_muraja_segment'],(int)$assignment['level_number'],$segments,$hifz,$taskDone);$next=$segment===null?[]:[$segment];}
        if(!$next)throw new RuntimeException('لا توجد مقاطع متاحة؛ لم تُحفظ الدرجة وحدها',409);
        foreach($next as$segment){
            $id='gc-'.bin2hex(random_bytes(16));
            // Ordinary INSERT never rebinds a historical row through ON DUPLICATE KEY UPDATE.
            $pdo->prepare('INSERT INTO segment_completions(id,student_id,plan_id,segment_index,task_type,completed_at,recorded_by,assignment_id) VALUES(?,?,?,?,?,?,?,?)')->execute([$id,$student,$assignment['plan_id'],$segment,$task,$date,(string)($auth['name']??'المعلم'),$expected]);
            $q=$pdo->prepare('SELECT * FROM segment_completions WHERE id=?');$q->execute([$id]);$rows[]=$q->fetch();
        }
    }else throw new RuntimeException('إجراء الإنجاز غير صالح',400);
    $event=['operation_id'=>$operation,'assignment_id'=>$expected,'student_id'=>$student,'plan_id'=>$assignment['plan_id'],'task_type'=>$task,'cell_path'=>$path,'action'=>$action,'rows'=>$rows,'previous_operation'=>$previous['operation_id']??null];
    $eventKey='grade_plan_event:'.hash('sha256',$operation);
    app_state_upsert($pdo,$eventKey,$event,$scoped?$cid:null);
    app_state_upsert($pdo,$key,$event+['status'=>$action==='record'?'active':'reversed'],$scoped?$cid:null);
    if($task==='hifz'){
        $base=array_slice($path,0,-1);grade_cells_set($grades,[...$base,'hifzPlanSegments'],['present'=>true,'value'=>$action==='record'?array_map('intval',array_column($rows,'segment_index')):[]]);
        grade_cells_set($grades,[...$base,'hifzPlanAssignmentId'],['present'=>true,'value'=>$expected]);
        grade_cells_record_version($pdo,grade_cells_context($pdo,$cid),'grades',[...$base,'hifzPlanSegments'],$operation);
        grade_cells_record_version($pdo,grade_cells_context($pdo,$cid),'grades',[...$base,'hifzPlanAssignmentId'],$operation);
    }
}
