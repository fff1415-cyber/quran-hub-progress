<?php
declare(strict_types=1);

/** Projection changes are backed by immutable event copies; unknown legacy links are never inferred. */
function grade_plan_effect(PDO $pdo,int $cid,array $auth,array $effect,string $operation,stdClass $grades):void {
    plans_require_roles($auth,['teacher','assistant','manager']);
    $student=(string)($effect['student_id']??'');$expected=(string)($effect['expected_assignment_id']??'');$task=(string)($effect['task_type']??'');
    $path=grade_cells_path($effect['cell_path']??null);
    $compensation=($effect['action']??'')==='compensation'&&$task==='hifz'&&($path[4]??'')==='compensationFaces';
    if($expected===''||count($path)!==5||$path[0]!==$student||$path[2]!=='days'||(!$compensation&&$path[4]!==$task)||!in_array($task,['hifz','rabt','muraja'],true))throw new RuntimeException('لم تُثبت هوية التعيين المرتبط بهذه الخلية؛ بقيت المسودة دون حفظ جزئي',409);
    $tenants=plans_tenant_enabled($pdo);plans_assert_student_in_complex($pdo,$student,$cid,$tenants);plans_assert_teacher_student_access($pdo,$auth,$student,$tenants);
    grade_plan_assert_cell_date($pdo,$cid,$path,(string)($effect['completed_at']??''));
    $lock=$pdo->prepare('SELECT id FROM students WHERE id=? FOR UPDATE');$lock->execute([$student]);
    $query=$pdo->prepare("SELECT spa.id,spa.plan_id,spa.start_segment_index,spa.start_muraja_segment,spa.assigned_at,ep.track,ep.level_number FROM student_plan_assignments spa JOIN education_plans ep ON ep.id=spa.plan_id WHERE spa.student_id=? AND spa.status IN ('active','frozen') FOR UPDATE");$query->execute([$student]);$assignments=$query->fetchAll();
    if(count($assignments)!==1||$assignments[0]['id']!==$expected)throw new RuntimeException('تغيّر التعيين أو توجد تعيينات ملتبسة؛ لم تُحفظ الدرجة أو الإنجاز',409);
    $assignment=$assignments[0];
    $check=$pdo->prepare('SELECT status FROM student_plan_assignments WHERE id=?');$check->execute([$expected]);if($check->fetchColumn()!=='active')throw new RuntimeException('الخطة مجمدة؛ لم تُحفظ عملية جزئية',409);
    if($compensation){grade_plan_compensation($pdo,$cid,$auth,$effect,$operation,$grades,$assignment);return;}
    $key='grade_plan_cell:'.hash('sha256',grade_cells_json([$expected,$path]));
    $scoped=app_state_tenant_enabled($pdo);$query=$pdo->prepare('SELECT value FROM app_state WHERE '.($scoped?'complex_id=? AND ':'').'`key`=? FOR UPDATE');$query->execute($scoped?[$cid,$key]:[$key]);$raw=$query->fetchColumn();$previous=$raw===false?null:json_decode((string)$raw,true,512,JSON_THROW_ON_ERROR);
    $action=(string)($effect['action']??'');$rows=[];
    if($action==='undo'){
        // A legacy grade can be cleared without guessing which independent
        // completion it came from. Only an active, recorded link authorizes removal.
        if ($previous===null || ($previous['status']??'')==='reversed') return;
        if(!is_array($previous)||($previous['status']??'')!=='active'||($previous['assignment_id']??'')!==$expected)throw new RuntimeException('رابط الإنجاز غير مؤكد؛ لم يُحذف أي إنجاز تاريخي',409);
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
        // Use the same progress as the plan sheet. A legacy completion made
        // during this assignment already occupies its segment and stays intact.
        $done=grade_plan_current_progress($pdo,$student,$assignment);
        $hifz=array_map('intval',array_column(array_filter($done,static fn($r)=>$r['task_type']==='hifz'),'segment_index'));
        $taskDone=array_map('intval',array_column(array_filter($done,static fn($r)=>$r['task_type']===$task),'segment_index'));
        if($task==='hifz')$next=plans_next_hifz_segments_for_tap($assignment['track'],$tap,(int)$assignment['start_segment_index'],$segments,$hifz);
        else{$segment=plans_next_segment_for_task($task,(int)$assignment['start_segment_index'],$assignment['start_muraja_segment']===null?null:(int)$assignment['start_muraja_segment'],(int)$assignment['level_number'],$segments,$hifz,$taskDone);$next=$segment===null?[]:[$segment];}
        if(!$next)throw new RuntimeException('لا توجد مقاطع متاحة؛ لم تُحفظ الدرجة وحدها',409);
        foreach($next as $segment) $rows[]=grade_plan_insert_completion($pdo,$student,$assignment,$segment,$task,$date,$auth);
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

/** A legacy completion recorded during this assignment occupies its original segment. */
function grade_plan_current_progress(PDO $pdo,string $student,array $assignment): array
{
    $q=$pdo->prepare('SELECT segment_index,task_type FROM segment_completions WHERE student_id=? AND plan_id=?
        AND (assignment_id=? OR (assignment_id IS NULL AND created_at>=?))');
    $q->execute([$student,$assignment['plan_id'],$assignment['id'],$assignment['assigned_at']]);
    return $q->fetchAll();
}

function grade_plan_insert_completion(PDO $pdo,string $student,array $assignment,int $segment,string $task,string $date,array $auth): array
{
    $id='gc-'.bin2hex(random_bytes(16));
    // An ordinary insert cannot rebind a historical completion.
    try {
        $pdo->prepare('INSERT INTO segment_completions(id,student_id,plan_id,segment_index,task_type,completed_at,recorded_by,assignment_id) VALUES(?,?,?,?,?,?,?,?)')
            ->execute([$id,$student,$assignment['plan_id'],$segment,$task,$date,(string)($auth['name']??'المعلم'),$assignment['id']]);
    } catch (PDOException $error) {
        if ((int)($error->errorInfo[1]??0)!==1062 ||
            !str_contains((string)($error->errorInfo[2]??''),'uk_completion')) throw $error;
        throw new RuntimeException('المقطع مرتبط بإنجاز سابق لا يخص التعيين الحالي. بقيت الدرجة مسودة والإنجاز السابق محفوظًا.',409,$error);
    }
    $q=$pdo->prepare('SELECT * FROM segment_completions WHERE id=?');
    $q->execute([$id]);
    return $q->fetch();
}

function grade_plan_assert_cell_date(PDO $pdo,int $cid,array $path,string $date):void {
    $calendar=grade_cells_calendar($pdo,$cid,false);$q=$pdo->prepare('SELECT start_date,weeks_count,working_days,excluded_dates FROM semesters WHERE id=?');$q->execute([$calendar['active_semester_id']]);$semester=$q->fetch();
    $keys=['sun','mon','tue','wed','thu','fri','sat'];$offset=array_search($path[3],$keys,true);
    if(!$semester||!ctype_digit($path[1])||(int)$path[1]<1||(int)$path[1]>(int)$semester['weeks_count']||$offset===false)throw new RuntimeException('لا يطابق الإنجاز يومًا مؤكدًا في التقويم',409);
    $start=DateTimeImmutable::createFromFormat('!Y-m-d',(string)$semester['start_date']);if(!$start)throw new RuntimeException('تقويم الفصل غير صالح',409);
    $iso=$start->modify('-'.$start->format('w').' days')->modify('+'.(((int)$path[1]-1)*7+$offset).' days')->format('Y-m-d');
    $working=json_decode((string)$semester['working_days'],true,512,JSON_THROW_ON_ERROR);$holidays=json_decode((string)($semester['excluded_dates']??'[]'),true,512,JSON_THROW_ON_ERROR);
    if($date!==$iso||$iso<$semester['start_date']||!is_array($working)||!in_array($offset,array_map('intval',$working),true))throw new RuntimeException('تاريخ الإنجاز لا يطابق خلية اليوم الدراسي؛ لم تُحفظ عملية جزئية',409);
    foreach($holidays??[]as$holiday)if((is_string($holiday)?$holiday:($holiday['date']??null))===$iso)throw new RuntimeException('اليوم إجازة وفق التقويم المعتمد؛ لم تُحفظ عملية جزئية',409);
}

function grade_plan_compensation(PDO $pdo,int $cid,array $auth,array $effect,string $operation,stdClass $grades,array $assignment):void {
    $student=$effect['student_id'];$path=$effect['cell_path'];$weekPath=[$student,$path[1]];$week=grade_cells_at($grades,$weekPath)['value'];
    $calendar=grade_cells_calendar($pdo,$cid,false);$q=$pdo->prepare('SELECT working_days FROM semesters WHERE id=?');$q->execute([$calendar['active_semester_id']]);$days=json_decode((string)$q->fetchColumn(),true,512,JSON_THROW_ON_ERROR);
    if(!is_array($days)||!$days)throw new RuntimeException('تعذّر تأكيد أيام التعويض؛ لم يُحفظ جزء من العملية',409);
    $keys=['sun','mon','tue','wed','thu','fri','sat'];$total=0.0;
    foreach(array_unique(array_map('intval',$days))as$day){$key=$keys[$day]??null;if($key===null)throw new RuntimeException('تقويم التعويض غير صالح',409);$value=$week->days->{$key}->compensationFaces??0;if(!is_numeric($value)||(float)$value<0||(float)$value>5||abs((float)$value*2-round((float)$value*2))>0.0001)throw new RuntimeException('قيمة التعويض تحتاج مراجعة',409);$total+=(float)$value;}
    if($total>5.0001)throw new RuntimeException('التعويض يتجاوز الحد الأسبوعي المعتمد؛ لم تُحفظ عملية جزئية',409);
    $target=$assignment['track']==='gold'?(int)floor($total):(int)round($total*2);
    $key='grade_plan_cell:'.hash('sha256',grade_cells_json([$assignment['id'],[...$weekPath,'compensationFaces']]));$scoped=app_state_tenant_enabled($pdo);
    $q=$pdo->prepare('SELECT value FROM app_state WHERE '.($scoped?'complex_id=? AND ':'').'`key`=? FOR UPDATE');$q->execute($scoped?[$cid,$key]:[$key]);$raw=$q->fetchColumn();$previous=$raw===false?null:json_decode((string)$raw,true,512,JSON_THROW_ON_ERROR);
    if($previous===null&&(!empty($week->compensationPlanSegments)||(float)($week->compensationFaces??0)>0))throw new RuntimeException('التعويض السابق غير مرتبط بحدث مؤكد؛ لم يُنسب أو يُحذف بالتخمين',409);
    $rows=$previous['rows']??[];$removed=[];
    foreach($rows as$row){$q=$pdo->prepare('SELECT * FROM segment_completions WHERE id=? AND assignment_id=? FOR UPDATE');$q->execute([$row['id'],$assignment['id']]);if(grade_cells_json($q->fetch())!==grade_cells_json($row))throw new RuntimeException('تغيّر إنجاز التعويض؛ بقيت المسودة للمراجعة',409);}
    if($target<count($rows)){$removed=array_splice($rows,$target);foreach($removed as$row)$pdo->prepare('DELETE FROM segment_completions WHERE id=? AND assignment_id=?')->execute([$row['id'],$assignment['id']]);}
    $date=$effect['completed_at']??'';$parts=explode('-',$date);if(!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$date)||!checkdate((int)($parts[1]??0),(int)($parts[2]??0),(int)($parts[0]??0)))throw new RuntimeException('تاريخ التعويض غير صالح',400);
    if(count($rows)<$target){
        $q=$pdo->prepare('SELECT segment_index FROM plan_segments WHERE plan_id=? ORDER BY segment_index');$q->execute([$assignment['plan_id']]);$segments=array_map('intval',$q->fetchAll(PDO::FETCH_COLUMN));
        $progress=grade_plan_current_progress($pdo,$student,$assignment);
        $done=array_map('intval',array_column(array_filter($progress,static fn($r)=>$r['task_type']==='hifz'),'segment_index'));
        while(count($rows)<$target){
            $next=plans_next_hifz_segments_for_tap($assignment['track'],$assignment['track']==='gold'?'one':'half',(int)$assignment['start_segment_index'],$segments,$done);
            if(count($next)!==1)throw new RuntimeException('لا توجد مقاطع كافية للتعويض؛ لم يُحفظ جزء منفرد',409);
            $rows[]=grade_plan_insert_completion($pdo,$student,$assignment,$next[0],'hifz',$date,$auth);
            $done[]=$next[0];
        }
    }
    $event=['operation_id'=>$operation,'assignment_id'=>$assignment['id'],'student_id'=>$student,'plan_id'=>$assignment['plan_id'],'action'=>'compensation','cell_path'=>$path,'rows'=>$rows,'removed_rows'=>$removed,'previous_operation'=>$previous['operation_id']??null];
    app_state_upsert($pdo,'grade_plan_event:'.hash('sha256',$operation),$event,$scoped?$cid:null);app_state_upsert($pdo,$key,$event+['status'=>'active'],$scoped?$cid:null);
    foreach(['compensationFaces'=>$total,'compensationPlanSegments'=>array_map('intval',array_column($rows,'segment_index')),'compensationPlanAssignmentId'=>$assignment['id']]as$field=>$value){$targetPath=[...$weekPath,$field];grade_cells_set($grades,$targetPath,['present'=>true,'value'=>$value]);grade_cells_record_version($pdo,grade_cells_context($pdo,$cid),'grades',$targetPath,$operation);}
}
