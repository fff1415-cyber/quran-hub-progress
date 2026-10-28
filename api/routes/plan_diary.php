<?php
declare(strict_types=1);
require_once __DIR__.'/plan_compensation.php';

/** Called only after handle_apply_plan_input's unchanged authorization preamble. */
function plans_record_diary(PDO $pdo,int $cid,array $auth,array $input): array {
    if(!plans_table_exists($pdo,'plan_diary_events'))throw new RuntimeException('يلزم ترحيل سجل عمليات اليوم قبل الحفظ');
    $studentId=(string)$input['student_id'];$d=$input['diary']??[];$field=(string)($d['field']??'');
    if(!in_array($field,['hifz','rabt','muraja','compensationFaces'],true))throw new RuntimeException('بند اليوم غير صالح');
    $task=$field==='compensationFaces'?'hifz':$field;
    if(($input['task_type']??'')!==$task)throw new RuntimeException('بند الدرجة لا يطابق نوع الإنجاز');
    $op=plans_operation_id($input);$week=(int)($d['week_number']??0);$day=(string)($d['day_key']??'');$date=(string)($d['date']??'');
    $value=$d['value']??null;
    if($field==='hifz'&&!in_array($value,['','half','one','two'],true))throw new RuntimeException('قيمة الحفظ غير صالحة');
    if(in_array($field,['rabt','muraja'],true)&&!in_array($value,['','pass','fail'],true))throw new RuntimeException('قيمة التقييم غير صالحة');
    if($field==='compensationFaces'&&(!is_numeric($value)||(float)$value<0||(float)$value>5))throw new RuntimeException('كمية التعويض غير صالحة');
    $pdo->beginTransaction();
    try {
        plans_lock_student($pdo,$studentId);
        $replay=plans_operation_replay($pdo,$op,$studentId,'diary',$input,$cid);
        if($replay!==null){$pdo->commit();return $replay;}
        $semester=state_active_semester($pdo,$cid,true);
        if(($d['semester_id']??'')!==$semester)throw new RuntimeException('تغيّر الفصل الدراسي — لم تُحفظ العملية');
        $dateObj=DateTimeImmutable::createFromFormat('!Y-m-d',$date);
        $dayKeys=['sun','mon','tue','wed','thu','fri','sat'];
        if(!$dateObj||$dateObj->format('Y-m-d')!==$date||($dayKeys[(int)$dateObj->format('w')]??'')!==$day)throw new RuntimeException('تاريخ اليوم لا يطابق خانة التسجيل');
        $s=$pdo->prepare('SELECT start_date,end_date FROM academic_weeks WHERE semester_id = ? AND week_number = ?');$s->execute([$semester,$week]);$weekRow=$s->fetch();
        if(!$weekRow||$date<$weekRow['start_date']||$date>$weekRow['end_date'])throw new RuntimeException('اليوم لا ينتمي إلى أسبوع الفصل المحدد');
        $cellArgs=[$cid,$semester,$studentId,$week,$day,$field];
        $s=$pdo->prepare('SELECT * FROM plan_diary_events WHERE complex_id = ? AND semester_id = ? AND student_id = ? AND week_number = ? AND day_key = ? AND field_name = ? AND revoked_at IS NULL FOR UPDATE');$s->execute($cellArgs);$events=$s->fetchAll();
        if(count($events)>1)throw new RuntimeException('سجل اليوم ملتبس؛ يلزم مراجعته دون حذف');
        $old=$events[0]??null;
        $e=state_lock_envelope($pdo,$cid,'grades');$grades=state_scope_value($e,'grades',$semester);
        $entry=$grades[$studentId][(string)$week]['days'][$day]??[];
        $current=$entry[$field]??($field==='compensationFaces'?0:'');
        if(!array_key_exists('base',$d)||state_canonical($current)!==state_canonical($d['base']))throw new RuntimeException('تعارض تعديل درجة اليوم — أعد تحميل القيمة');
        $assignmentId=$old['assignment_id']??(string)($input['expected_assignment_id']??'');
        if($assignmentId===''||$assignmentId!==($input['expected_assignment_id']??''))throw new RuntimeException('مرجع تعيين اليوم تغيّر — حدّث الدرجة والخطة');
        $s=$pdo->prepare('SELECT a.*,p.track,p.level_number FROM student_plan_assignments a JOIN education_plans p ON p.id=a.plan_id WHERE a.id = ? AND a.student_id = ?');$s->execute([$assignmentId,$studentId]);$a=$s->fetch();
        if(!$a)throw new RuntimeException('تعيين اليوم غير موجود');
        if(!$old){
            $active=plans_current_assignment($pdo,$studentId);
            if(($active['id']??'')!==$a['id']||$a['status']!=='active')throw new RuntimeException('تغيّر التعيين الحالي أو جُمّد؛ لم يُسجّل إنجاز جديد');
            if($current!==''&&$current!==0&&$current!==null)throw new RuntimeException('درجة قديمة بلا رابط عملية موثوق — يلزم مراجعة الربط قبل تعديل إنجازها');
            if(!empty($entry['hifzPlanSegments'])&&$field==='hifz')throw new RuntimeException('إنجاز قديم بلا رابط عملية موثوق — يلزم المراجعة');
        }
        // An old day's event always targets its original assignment, even after progression.
        $content=plans_assignment_content($pdo,$a);$segments=array_map('intval',array_column($content['segments'],'segment_index'));
        if($field==='compensationFaces'){
            $response=plans_compensation_diary($pdo,$cid,$auth,$input,$a,$e,$grades,$content);
            plans_operation_save($pdo,$op,$studentId,'diary',$input,$response);$pdo->commit();return $response;
        }
        $track=(string)$content['plan']['track'];$level=(int)$content['plan']['level_number'];
        $quantity=$field==='compensationFaces'?(float)$value:($field==='hifz'?($value==='half'?0.5:($value==='one'?1:($value==='two'?2:0))):($value==='pass'?1:0));
        if($old){
            foreach(json_decode($old['segments_json'],true)?:[] as $seg){
                $s=$pdo->prepare('SELECT operation_id,revoked_at FROM plan_assignment_completions WHERE assignment_id = ? AND task_type = ? AND segment_index = ? FOR UPDATE');$s->execute([$a['id'],$task,$seg]);$c=$s->fetch();
                if(!$c||($c['operation_id']??'')!==$old['operation_id']||$c['revoked_at']!==null)throw new RuntimeException('إنجاز اليوم عُدّل من عملية أخرى؛ يلزم مراجعة التعارض');
                $pdo->prepare('UPDATE plan_assignment_completions SET revoked_at = NOW() WHERE assignment_id = ? AND task_type = ? AND segment_index = ? AND operation_id = ?')->execute([$a['id'],$task,$seg,$old['operation_id']]);
            }
            $pdo->prepare('UPDATE plan_diary_events SET revoked_at = NOW() WHERE id = ?')->execute([$old['id']]);
        }
        $s=$pdo->prepare('SELECT segment_index,task_type FROM plan_assignment_completions WHERE assignment_id = ? AND revoked_at IS NULL');$s->execute([$a['id']]);$done=$s->fetchAll();
        $hifz=array_map('intval',array_column(array_filter($done,fn($c)=>$c['task_type']==='hifz'),'segment_index'));
        $taskDone=array_map('intval',array_column(array_filter($done,fn($c)=>$c['task_type']===$task),'segment_index'));
        $selected=[];
        if($quantity>0){
            if($task==='hifz'){
                $count=$field==='compensationFaces'?(int)round($quantity/($track==='silver'?0.5:1)):plans_segments_for_tap($track,(string)$value);
                foreach($segments as $seg)if($seg>=(int)$a['start_segment_index']&&!in_array($seg,$taskDone,true)&&count($selected)<$count)$selected[]=$seg;
            }else{
                $seg=plans_next_segment_for_task($task,(int)$a['start_segment_index'],isset($a['start_muraja_segment'])?(int)$a['start_muraja_segment']:null,$level,$segments,$hifz,$taskDone);
                if($seg!==null)$selected[]=$seg;
            }
            if(!$selected)throw new RuntimeException('لا توجد مقاطع متاحة لهذا البند؛ لم تُحفظ الدرجة وحدها');
        }
        foreach($selected as $seg){
            $pdo->prepare('INSERT INTO plan_assignment_completions (id,student_id,plan_id,assignment_id,segment_index,task_type,completed_at,recorded_by,operation_id) VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE completed_at = VALUES(completed_at), recorded_by = VALUES(recorded_by), operation_id = VALUES(operation_id), revoked_at = NULL')->execute([new_uuid(),$studentId,$a['plan_id'],$a['id'],$seg,$task,$date,(string)($auth['name']??''),$op]);
        }
        $eventId=new_uuid();
        $pdo->prepare('INSERT INTO plan_diary_events (id,complex_id,semester_id,student_id,assignment_id,week_number,day_key,field_name,completed_at,grade_json,requested_quantity,segments_json,operation_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute([$eventId,$cid,$semester,$studentId,$a['id'],$week,$day,$field,$date,app_state_json_encode($value),$quantity,app_state_json_encode($selected),$op]);
        $entry[$field]=$field==='compensationFaces'?(float)$value:$value;
        $entry['planRecordRefs'][$field]=['eventId'=>$eventId,'assignmentId'=>$a['id'],'segments'=>$selected,'date'=>$date,'quantity'=>$quantity];
        if($field==='hifz'){$entry['hifzPlanSegments']=$selected;$entry['hifzPlanAssignmentId']=$a['id'];}
        $entry['touchedAt']=(int)round(microtime(true)*1000);$entry['fieldTouchedAt'][$field]=$entry['touchedAt'];
        $grades[$studentId][(string)$week]['days'][$day]=$entry;
        if($field==='compensationFaces'){
            $sum=0;foreach($grades[$studentId][(string)$week]['days'] as $dayEntry)$sum+=(float)($dayEntry['compensationFaces']??0);
            if($sum>5.001)throw new RuntimeException('تجاوز مجموع التعويض الأسبوعي الحد الحالي 5 أوجه');
            $grades[$studentId][(string)$week]['compensationFaces']=$sum;
        }
        $e['scopes'][$semester]=$grades;$e['revision']=($e['revision']??0)+1;app_state_upsert($pdo,'grades',$e,app_state_tenant_enabled($pdo)?$cid:null);
        $response=['ok'=>true,'assignment_id'=>$a['id'],'segments'=>$selected,'entry'=>$entry,'grades'=>$grades,'semester_id'=>$semester];
        plans_operation_save($pdo,$op,$studentId,'diary',$input,$response);$pdo->commit();return $response;
    }catch(Throwable $error){if($pdo->inTransaction())$pdo->rollBack();throw $error;}
}
