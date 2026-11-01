<?php
declare(strict_types=1);
require_once __DIR__.'/grade-cell-operations.php';
require_once __DIR__.'/plan-completion-events.php';

function grade_plan_date(string $date): bool
{
    $parsed=DateTimeImmutable::createFromFormat('!Y-m-d',$date);
    return $parsed && $parsed->format('Y-m-d')===$date;
}

/** Read the existing selected week; never derive an old semester from a week number. */
function grade_plan_week(PDO $pdo,array $source): array
{
    if(!plans_table_exists($pdo,'academic_weeks'))throw new RuntimeException('مرجع الأسبوع غير مهيأ؛ بقيت الدرجة والإنجاز دون تغيير',409);
    $date=(string)($source['day_date']??'');$day=(string)($source['day_key']??'');$week=(string)($source['week']??'');
    if(!preg_match('/^[1-9][0-9]*$/D',$week)||!grade_plan_date($date))throw new RuntimeException('يوم الدرجة أو أسبوعها غير صالح');
    $days=['Sun'=>'sun','Mon'=>'mon','Tue'=>'tue','Wed'=>'wed','Thu'=>'thu','Fri'=>'fri','Sat'=>'sat'];
    if(($days[(new DateTimeImmutable($date))->format('D')]??null)!==$day)throw new RuntimeException('تاريخ الدرجة لا يطابق يومها');
    $query=$pdo->prepare('SELECT id,start_date,end_date FROM academic_weeks WHERE semester_id=? AND week_number=? FOR UPDATE');
    $query->execute([$source['semester_id']??null,$week]);$rows=$query->fetchAll();
    if(count($rows)!==1||!grade_plan_date((string)$rows[0]['start_date'])||!grade_plan_date((string)$rows[0]['end_date'])||$date<$rows[0]['start_date']||$date>$rows[0]['end_date'])throw new RuntimeException('تاريخ الدرجة خارج الأسبوع المحدد في الفصل؛ لم يُنقل إلى أسبوع آخر',409);
    return $rows[0];
}

function grade_plan_old_binding(array $grade,array $binding,string $student,string $assignment,string $plan,array $source): array
{
    $base=$grade['base']??null;$proof=$binding['base']??null;
    if(!is_array($base)||!is_bool($base['present']??null)||!is_array($proof)||!is_bool($proof['present']??null))throw new RuntimeException('مصدر خلية الدرجة غير مكتمل');
    if(!$proof['present']) {
        if($base['present']&&($base['value']??null)!=='')throw new RuntimeException('الدرجة القديمة بلا مرجع إنجاز مؤكد؛ عُلّق تعديلها وحدها دون تخمين أو تغيير الخطة',409);
        return ['tap'=>'','events'=>[]];
    }
    $value=$proof['value']??null;$old=$value instanceof stdClass?get_object_vars($value):$value;
    if(!is_array($old)||($old['version']??null)!==1||($old['student_id']??null)!==$student||($old['assignment_id']??null)!==$assignment||($old['plan_id']??null)!==$plan
        ||($old['semester_id']??null)!==($source['semester_id']??null)||($old['week']??null)!==(string)($source['week']??'')||($old['day_key']??null)!==($source['day_key']??null)||($old['day_date']??null)!==($source['day_date']??null)
        ||!in_array($old['tap']??null,['','half','one','two'],true)||!$base['present']||($base['value']??null)!==$old['tap']||!is_array($old['events']??null)||!array_is_list($old['events']))throw new RuntimeException('مرجع الدرجة لا يطابق الطالب والتعيين واليوم والفصل؛ لم يُعد ربطه',409);
    $seen=[];$events=[];
    foreach($old['events'] as $event) {
        $event=$event instanceof stdClass?get_object_vars($event):$event;
        if(!is_array($event)||!is_int($event['segment_index']??null)||$event['segment_index']<1||!is_string($event['event_id']??null)||$event['event_id']===''||isset($seen[$event['segment_index']]))throw new RuntimeException('مراجع إنجاز الدرجة غير مكتملة؛ لم يُختَر بديل بالتاريخ',409);
        $seen[$event['segment_index']]=true;$events[]=$event;
    }
    if(($old['tap']==='')!==($events===[]))throw new RuntimeException('كمية الدرجة ومراجع إنجازها غير متطابقة',409);
    $old['events']=$events;return $old;
}

function grade_plan_suboperation(string $operation,string $kind,int $index=0): string
{
    return 'gp-'.hash('sha256',$operation."\0".$kind."\0".$index);
}

/** Dated hifz cells only. Original route authorization must run before this data primitive. */
function grade_plan_apply(PDO $pdo,int $cid,string $student,string $assignmentId,string $planId,string $operation,array $request,string $recorder,int $attempt=0): array
{
    $owns=!$pdo->inTransaction();
    try {
        if(!preg_match('/^[A-Za-z0-9_-]{8,128}$/D',$operation)||$student===''||$assignmentId===''||$planId==='')throw new RuntimeException('هوية تسجيل الدرجة والخطة غير مكتملة');
        $source=$request['source']??null;$calendar=$request['calendar_context']??null;$grade=$request['grade']??null;$binding=$request['binding']??null;
        if(!is_array($source)||!is_array($calendar)||!is_array($grade)||!is_array($binding))throw new RuntimeException('طلب الدرجة والإنجاز غير مكتمل');
        $prefix=[$student,(string)($source['week']??''),'days',(string)($source['day_key']??'')];
        if(grade_cells_path($grade['path']??null)!==array_merge($prefix,['hifz'])||grade_cells_path($binding['path']??null)!==array_merge($prefix,['_plan_hifz_v1']))throw new RuntimeException('مسار الدرجة لا يطابق الطالب واليوم المحددين');
        $tap=$grade['next']['value']??null;
        if(($grade['next']['present']??null)!==true||!in_array($tap,['','half','one','two'],true))throw new RuntimeException('قيمة الحفظ غير صالحة');
        $hash=hash('sha256',grade_cells_json(['protocol'=>'grade-plan-v1','student_id'=>$student,'assignment_id'=>$assignmentId,'plan_id'=>$planId,'request'=>$request]));
        if($owns)$pdo->beginTransaction();
        grade_cells_ready($pdo);if(!plan_events_tables_ready($pdo))throw new RuntimeException('حفظ تاريخ الإنجاز غير مهيأ؛ لم تُكتب الدرجة وحدها',409);
        $lock=$pdo->prepare('SELECT id FROM students WHERE id=? FOR UPDATE');$lock->execute([$student]);if(!$lock->fetch())throw new RuntimeException('الطالب غير موجود');
        $store=grade_cells_store($pdo,$cid,'grades',true);$gradeContext=grade_cells_context($pdo,$cid);
        $query=$pdo->prepare('SELECT student_id,operation_kind,input_sha256,response_json FROM plan_operation_receipts WHERE context_id=? AND operation_id=? FOR UPDATE');$query->execute([$cid,$operation]);$known=$query->fetch();
        if($known) {
            if($known['student_id']!==$student||$known['operation_kind']!=='grade_plan'||!hash_equals((string)$known['input_sha256'],$hash))throw new RuntimeException('معرّف العملية مستخدم لدرجة أو تعيين مختلف',409);
            $response=json_decode((string)$known['response_json'],false,512,JSON_THROW_ON_ERROR);
            if(!($response instanceof stdClass)||($response->ok??null)!==true||($response->student_id??null)!==$student||($response->operation_id??null)!==$operation||($response->assignment_id??null)!==$assignmentId||($response->plan_id??null)!==$planId||!is_string($response->grade_input_sha256??null)||!(($response->binding??null) instanceof stdClass)||!is_array($response->added_event_ids??null)||!is_array($response->revoked_event_ids??null))throw new RuntimeException('إيصال الدرجة والإنجاز غير مكتمل؛ لم يُعد التنفيذ',409);
            $query=$pdo->prepare('SELECT input_sha256 FROM grade_operation_receipts WHERE context_id=? AND store_key=? AND operation_id=? FOR UPDATE');$query->execute([$gradeContext,'grades',$operation]);$gradeHash=$query->fetchColumn();
            if($gradeHash===false||!hash_equals($response->grade_input_sha256,(string)$gradeHash))throw new RuntimeException('إيصال الدرجة لا يطابق العملية المشتركة؛ يلزم التحقق دون تكرارها',409);
            grade_plan_old_binding(['base'=>['present'=>true,'value'=>$tap]],['base'=>['present'=>true,'value'=>$response->binding]],$student,$assignmentId,$planId,$source);
            $replayGrade=$grade;$replayBinding=$binding;$replayBinding['next']=['present'=>true,'value'=>$response->binding];
            $replayGrade['linked_operation']=$replayBinding['linked_operation']=['grade_plan_request_sha256'=>$hash];
            $verified=grade_cells_apply($pdo,$cid,'grades',$operation,$calendar,[$replayGrade,$replayBinding]);
            if(!$verified['replayed'])throw new RuntimeException('إيصال الدرجة السابق غير مثبت؛ لم يُعلن نجاح العملية',409);
            if($owns)$pdo->commit();return array_replace((array)$response,['replayed'=>true]);
        }
        $query=$pdo->prepare('SELECT 1 FROM grade_operation_receipts WHERE context_id=? AND store_key=? AND operation_id=? FOR UPDATE');$query->execute([$gradeContext,'grades',$operation]);if($query->fetchColumn())throw new RuntimeException('يوجد إيصال درجة بلا عملية مشتركة مطابقة؛ لم يُنشأ إنجاز بالتخمين',409);
        if(($calendar['known']??null)!==true||!is_string($calendar['active_semester_id']??null)||($source['semester_id']??null)!==$calendar['active_semester_id']||grade_cells_json(grade_cells_calendar($pdo,$cid,true))!==grade_cells_json($calendar))throw new RuntimeException('تغيّر الفصل أو لم يتأكد مصدره؛ لم تُنسب الدرجة القديمة إليه',409);
        $week=grade_plan_week($pdo,$source);$assignment=plans_locked_current_assignment($pdo,$student);
        if(!$assignment||$assignment['id']!==$assignmentId||$assignment['plan_id']!==$planId||$assignment['status']!=='active')throw new RuntimeException('تغيّر التعيين الحالي أو جُمّد؛ لم تُكتب الدرجة على خطة جديدة',409);
        $start=(string)(($assignment['plan_start_date']??null)?:substr((string)($assignment['assigned_at']??''),0,10));
        if(!grade_plan_date($start)||$source['day_date']<$start)throw new RuntimeException('يوم الدرجة يسبق بداية التعيين المحدد؛ لم يُنقل إنجاز يوم سابق إلى الخطة الحالية',409);
        foreach([$grade,$binding] as $cell)grade_cells_assert_current($pdo,$gradeContext,'grades',$store,$cell['path'],$cell['base']??[],$cell['stamp']??null);
        $old=grade_plan_old_binding($grade,$binding,$student,$assignmentId,$planId,$source);$events=$old['events'];
        if($old['tap']!==''&&(plans_segments_for_tap((string)$assignment['track'],$old['tap'])<count($events)))throw new RuntimeException('كمية الدرجة القديمة ومراجعها غير متطابقة؛ لم تُصحح بالتخمين',409);
        $eligible=plan_events_segments($pdo,$assignment,true);
        foreach($events as $event) {
            if($event['segment_index']<(int)$assignment['start_segment_index']||!in_array($event['segment_index'],$eligible,true))throw new RuntimeException('إنجاز الدرجة خارج نطاق التعيين المحدد؛ لم يُنقل إلى مقطع آخر',409);
            $head=plan_events_head($pdo,$cid,$assignment,'hifz',$event['segment_index'],true);if(!$head||(int)$head['head_completed']!==1||$head['id']!==$event['event_id'])throw new RuntimeException('تغيّر الإنجاز المرتبط بهذه الدرجة؛ لم يُمس إنجاز أحدث',409);
        }
        $target=$tap===''?0:plans_segments_for_tap((string)$assignment['track'],$tap);if($tap!==''&&$target<1)throw new RuntimeException('هذا الإدخال غير متاح لمسار الطالب');
        if(!$pdo->inTransaction())throw new RuntimeException('انتهت معاملة الدرجة؛ لم يُحفظ جزء منها',409);
        $pdo->prepare('INSERT INTO plan_operation_receipts(context_id,operation_id,student_id,operation_kind,input_sha256,response_json) VALUES(?,?,?,?,?,?)')->execute([$cid,$operation,$student,'grade_plan',$hash,'{"pending":true}']);
        $sourceRef=['kind'=>'grade_cell','grade_operation_id'=>$operation,'grade_request_sha256'=>$hash]+$source;$revoked=[];$added=[];
        if($tap!==$old['tap']) {
            $remove=array_slice($events,$target);$events=array_slice($events,0,$target);
            if($remove) {$delta=plan_events_revoke($pdo,$cid,$student,$assignmentId,grade_plan_suboperation($operation,'revoke'),array_map(static fn($row)=>['segment_index'=>$row['segment_index'],'event_id'=>$row['event_id']],$remove),$recorder,$sourceRef);if($delta['replayed'])throw new RuntimeException('إيصال إنجاز منفصل بلا عملية درجة مؤكدة',409);$revoked=$delta['event_ids'];}
            for($index=0;count($events)<$target;$index++) {
                $all=plan_events_segments($pdo,$assignment,true);$rows=array_column(plan_events_read($pdo,$cid,$assignment,true),'completion');$done=array_map('intval',array_column(array_filter($rows,static fn($row)=>$row['task_type']==='hifz'),'segment_index'));
                if(!array_filter($all,static fn($segment)=>$segment>=(int)$assignment['start_segment_index']&&!in_array($segment,$done,true)))break;
                $remaining=$target-count($events);$chunk='half';
                foreach(['two','one','half'] as $option) {$quantity=plans_segments_for_tap((string)$assignment['track'],$option);if($quantity>0&&$quantity<=$remaining){$chunk=$option;break;}}
                $delta=plan_events_apply($pdo,$cid,$student,$assignmentId,grade_plan_suboperation($operation,'apply',$index),'hifz',$chunk,$source['day_date'],$recorder,$sourceRef);
                if($delta['replayed'])throw new RuntimeException('إيصال إنجاز منفصل بلا عملية درجة مؤكدة',409);
                foreach($delta['applied_segments'] as $i=>$segment) {$events[]=['segment_index'=>$segment,'event_id'=>$delta['event_ids'][$i]];$added[]=$delta['event_ids'][$i];}
            }
        }
        if($tap!==''&&!$events)throw new RuntimeException('لا توجد مقاطع متبقية؛ لم تُسجّل درجة بلا إنجاز',409);
        $nextBinding=(object)array_replace($old,['version'=>1,'student_id'=>$student,'assignment_id'=>$assignmentId,'plan_id'=>$planId,'semester_id'=>$source['semester_id'],'week'=>(string)$source['week'],'day_key'=>$source['day_key'],'day_date'=>$source['day_date'],'academic_week'=>$week,'tap'=>$tap,'events'=>$events,'operation_id'=>$operation]);
        $binding['next']=['present'=>true,'value'=>$nextBinding];$intent=['grade_plan_request_sha256'=>$hash];$grade['linked_operation']=$intent;$binding['linked_operation']=$intent;
        $gradeReceipt=grade_cells_apply($pdo,$cid,'grades',$operation,$calendar,[$grade,$binding]);if($gradeReceipt['replayed'])throw new RuntimeException('إيصال درجة سابق بلا عملية إنجاز مشتركة',409);
        $response=['ok'=>true,'operation_id'=>$operation,'student_id'=>$student,'assignment_id'=>$assignmentId,'plan_id'=>$planId,'replayed'=>false,'grade_input_sha256'=>$gradeReceipt['input_sha256'],'binding'=>$nextBinding,'added_event_ids'=>$added,'revoked_event_ids'=>$revoked];
        $query=$pdo->prepare('UPDATE plan_operation_receipts SET response_json=? WHERE context_id=? AND operation_id=? AND input_sha256=?');$query->execute([grade_cells_json((object)$response),$cid,$operation,$hash]);if($query->rowCount()!==1)throw new RuntimeException('تعذّر تثبيت الإيصال المشترك؛ لم يُحفظ جزء من العملية',409);
        if($owns)$pdo->commit();return $response;
    } catch(Throwable $error) {
        if($pdo->inTransaction()){try{$pdo->rollBack();}catch(Throwable){}}
        $databaseError=$error instanceof PDOException?$error:($error->getCode()===409&&$error->getPrevious() instanceof PDOException?$error->getPrevious():null);
        $code=$databaseError?(int)($databaseError->errorInfo[1]??0):0;
        if(in_array($code,[1020,1205,1213],true)) {if($owns&&!$pdo->inTransaction()&&$attempt<2)return grade_plan_apply($pdo,$cid,$student,$assignmentId,$planId,$operation,$request,$recorder,$attempt+1);throw new RuntimeException('تعارض تسجيل الدرجة والإنجاز؛ أُلغيت المعاملة كاملة. أعد العملية نفسها',409,$databaseError);}
        throw $error;
    }
}
