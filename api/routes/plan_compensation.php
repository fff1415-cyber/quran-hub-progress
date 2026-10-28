<?php
declare(strict_types=1);

/** Preserve the existing weekly conversion (gold=floor faces, silver=round faces*2).
 * Only dated, explicit events from this assignment participate. Earlier versions
 * are revoked and retained; no old weekly total is distributed by inference.
 */
function plans_compensation_diary(PDO $pdo,int $cid,array $auth,array $input,array $a,array $envelope,array $grades,array $content): array {
    $d=$input['diary'];$semester=$d['semester_id'];$student=$input['student_id'];$week=(int)$d['week_number'];$op=$input['operation_id'];$field='compensationFaces';
    $s=$pdo->prepare("SELECT * FROM plan_diary_events WHERE complex_id = ? AND semester_id = ? AND student_id = ? AND week_number = ? AND field_name = 'compensationFaces' AND revoked_at IS NULL FOR UPDATE");$s->execute([$cid,$semester,$student,$week]);$all=$s->fetchAll();$byDay=[];
    foreach($all as $event)$byDay[$event['day_key']]=$event;
    $weekGrades=$grades[$student][(string)$week]??[];
    foreach($weekGrades['days']??[] as $day=>$entry)if((float)($entry[$field]??0)>0&&!isset($byDay[$day]))throw new RuntimeException('تعويض قديم بلا رابط عملية مؤكد — يلزم مراجعة الأسبوع دون توزيعه بالتخمين');
    if(!$byDay&&!empty($weekGrades['compensationFaces']))throw new RuntimeException('تعويض أسبوعي قديم بلا تاريخ — يلزم المراجعة');
    $events=array_values(array_filter($all,fn($event)=>$event['assignment_id']===$a['id']));$next=[];
    foreach($events as $event){
        foreach(json_decode($event['segments_json'],true)?:[] as $seg){
            $s=$pdo->prepare("SELECT operation_id,revoked_at FROM plan_assignment_completions WHERE assignment_id = ? AND task_type = 'hifz' AND segment_index = ? FOR UPDATE");$s->execute([$a['id'],$seg]);$c=$s->fetch();
            if(!$c||$c['operation_id']!==$event['operation_id']||$c['revoked_at']!==null)throw new RuntimeException('إنجاز التعويض عُدّل من عملية أخرى؛ يلزم مراجعة التعارض');
            $pdo->prepare("UPDATE plan_assignment_completions SET revoked_at = NOW() WHERE assignment_id = ? AND task_type = 'hifz' AND segment_index = ? AND operation_id = ?")->execute([$a['id'],$seg,$event['operation_id']]);
        }
        $pdo->prepare('UPDATE plan_diary_events SET revoked_at = NOW() WHERE id = ?')->execute([$event['id']]);
        $next[$event['day_key']]=['date'=>$event['completed_at'],'quantity'=>(float)$event['requested_quantity']];
    }
    $next[$d['day_key']]=['date'=>$d['date'],'quantity'=>(float)$d['value']];uasort($next,fn($x,$y)=>strcmp($x['date'],$y['date']));
    $track=$content['plan']['track'];$convert=fn(float $faces):int=>$track==='gold'?(int)floor($faces):(int)round($faces*2);
    $total=array_sum(array_column($next,'quantity'));$target=$convert($total);
    $s=$pdo->prepare("SELECT segment_index FROM plan_assignment_completions WHERE assignment_id = ? AND task_type = 'hifz' AND revoked_at IS NULL");$s->execute([$a['id']]);$done=array_map('intval',array_column($s->fetchAll(),'segment_index'));
    $available=[];foreach($content['segments'] as $seg){$index=(int)$seg['segment_index'];if($index>=(int)$a['start_segment_index']&&!in_array($index,$done,true))$available[]=$index;}
    if(count($available)<$target)throw new RuntimeException('المقاطع المتاحة لا تكفي للتعويض؛ لم تُحفظ عملية جزئية');
    $cumulative=0.0;$offset=0;$currentSegments=[];
    foreach($next as $day=>$row){
        $before=$convert($cumulative);$cumulative+=$row['quantity'];$count=$convert($cumulative)-$before;$selected=array_slice($available,$offset,$count);$offset+=$count;
        foreach($selected as $seg)$pdo->prepare('INSERT INTO plan_assignment_completions (id,student_id,plan_id,assignment_id,segment_index,task_type,completed_at,recorded_by,operation_id) VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE completed_at = VALUES(completed_at), recorded_by = VALUES(recorded_by), operation_id = VALUES(operation_id), revoked_at = NULL')->execute([new_uuid(),$student,$a['plan_id'],$a['id'],$seg,'hifz',$row['date'],(string)($auth['name']??''),$op]);
        $eventId=new_uuid();$pdo->prepare('INSERT INTO plan_diary_events (id,complex_id,semester_id,student_id,assignment_id,week_number,day_key,field_name,completed_at,grade_json,requested_quantity,segments_json,operation_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute([$eventId,$cid,$semester,$student,$a['id'],$week,$day,$field,$row['date'],app_state_json_encode($row['quantity']),$row['quantity'],app_state_json_encode($selected),$op]);
        $entry=$grades[$student][(string)$week]['days'][$day]??[];$entry[$field]=$row['quantity'];$entry['planRecordRefs'][$field]=['eventId'=>$eventId,'assignmentId'=>$a['id'],'segments'=>$selected,'date'=>$row['date'],'quantity'=>$row['quantity']];
        $entry['fieldTouchedAt'][$field]=(int)round(microtime(true)*1000);$grades[$student][(string)$week]['days'][$day]=$entry;
        if($day===$d['day_key'])$currentSegments=$selected;
    }
    $sum=0;foreach($grades[$student][(string)$week]['days'] as $entry)$sum+=(float)($entry[$field]??0);
    if($sum>5.001)throw new RuntimeException('تجاوز مجموع التعويض الأسبوعي الحد الحالي 5 أوجه');
    $grades[$student][(string)$week]['compensationFaces']=$sum;$envelope['scopes'][$semester]=$grades;$envelope['revision']=($envelope['revision']??0)+1;
    app_state_upsert($pdo,'grades',$envelope,app_state_tenant_enabled($pdo)?$cid:null);
    return ['ok'=>true,'assignment_id'=>$a['id'],'segments'=>$currentSegments,'entry'=>$grades[$student][(string)$week]['days'][$d['day_key']],'grades'=>$grades,'semester_id'=>$semester];
}
