<?php
declare(strict_types=1);
require_once __DIR__.'/completion-events-cases.php';
require_once __DIR__.'/grade-cell-cases.php';

function gradePlanAssignment(PDO $pdo,string $student,string $plan,string $old,string $operation,string $start='2026-11-01',int $segment=1):array {
    $GLOBALS['pdo']=$pdo;$GLOBALS['auth']=['role'=>'supervisor','complexId'=>1,'name'=>'fixture'];
    $GLOBALS['input']=['student_id'=>$student,'plan_id'=>$plan,'expected_assignment_id'=>$old,'operation_id'=>$operation,'start_segment_index'=>$segment,'plan_start_date'=>$start];handle_assign_plan();
    return completionAssignment($pdo,$GLOBALS['response']['assignment_id']);
}
function gradePlanRequest(PDO $pdo,string $student,string $tap,string $date='2026-11-01',string $week='1',string $day='sun'):array {
    $base=[$student,$week,'days',$day];$capture=grade_cells_capture($pdo,1,'grades',[array_merge($base,['hifz']),array_merge($base,['_plan_hifz_v1'])]);
    return ['calendar_context'=>$capture['calendar_context'],'source'=>['semester_id'=>'1','week'=>$week,'day_key'=>$day,'day_date'=>$date],
        'grade'=>$capture['cells'][0]+['next'=>['present'=>true,'value'=>$tap]],'binding'=>$capture['cells'][1]];
}
function gradePlanDay(PDO $pdo,string $student,string $week='1',string $day='sun'):stdClass {
    return json_decode(gradeCellRaw($pdo,1),false)->{$student}->{$week}->days->{$day};
}
function gradePlanCases(PDO $pdo,string $student,string $plan,string $old,string $prefix):array {
    $raw=completionRaw($pdo,$student);$current=gradePlanAssignment($pdo,$student,$plan,$old,$prefix.'-assign');
    $request=gradePlanRequest($pdo,$student,'one');$first=grade_plan_apply($pdo,1,$student,$current['id'],$plan,$prefix.'-first',$request,'fixture');
    $firstEvent=$first['binding']->events[0]['event_id'];$day=gradePlanDay($pdo,$student);
    check($day->hifz==='one'&&$day->_plan_hifz_v1->assignment_id===$current['id']&&$day->_plan_hifz_v1->events[0]->event_id===$firstEvent&&count(completionRows($pdo,$current))===1,'dated grade, explicit assignment/day/semester binding, event and both receipts commit together');
    $before=gradeCellRaw($pdo,1);$retry=grade_plan_apply($pdo,1,$student,$current['id'],$plan,$prefix.'-first',$request,'changed-recorder');
    check($retry['replayed']&&gradeCellRaw($pdo,1)===$before&&count(plan_events_history($pdo,1,$current))===1,'lost-response compound retry confirms its original receipt without a second grade or completion');
    $query=$pdo->prepare('SELECT response_json FROM plan_operation_receipts WHERE context_id=1 AND operation_id=?');$query->execute([$prefix.'-first']);$savedReceipt=$query->fetchColumn();$corrupt=json_decode($savedReceipt,false);$corrupt->binding->events[0]->event_id='fixture-corrupt-reference';
    $query=$pdo->prepare('UPDATE plan_operation_receipts SET response_json=? WHERE context_id=1 AND operation_id=?');$query->execute([grade_cells_json($corrupt),$prefix.'-first']);
    gradeCellFailure(fn()=>grade_plan_apply($pdo,1,$student,$current['id'],$plan,$prefix.'-first',$request,'fixture'),'محتوى مختلف');
    check(gradeCellRaw($pdo,1)===$before&&count(plan_events_history($pdo,1,$current))===1,'corrupt compound binding cannot be acknowledged or silently repaired from the current plan');
    $query->execute([$savedReceipt,$prefix.'-first']);
    $two=grade_plan_apply($pdo,1,$student,$current['id'],$plan,$prefix.'-two',gradePlanRequest($pdo,$student,'two'),'fixture');
    check(count($two['binding']->events)===2&&$two['binding']->events[0]['event_id']===$firstEvent&&count(plan_events_history($pdo,1,$current))===2,'quantity increase keeps the existing linked segment and appends only the additional one');
    $same=grade_plan_apply($pdo,1,$student,$current['id'],$plan,$prefix.'-same',gradePlanRequest($pdo,$student,'two'),'fixture');
    check($same['added_event_ids']===[]&&$same['revoked_event_ids']===[]&&count(plan_events_history($pdo,1,$current))===2,'saving an unchanged quantity never advances or re-creates plan segments');
    $before=gradeCellRaw($pdo,1);gradeCellFailure(fn()=>grade_plan_apply($pdo,1,$student,$current['id'],$plan,$prefix.'-stale',$request,'fixture'),'عدّل مستخدم آخر');
    check(gradeCellRaw($pdo,1)===$before&&count(plan_events_history($pdo,1,$current))===2,'same-cell stale grade is rejected before touching any plan event');
    $one=grade_plan_apply($pdo,1,$student,$current['id'],$plan,$prefix.'-one',gradePlanRequest($pdo,$student,'one'),'fixture');
    check($one['binding']->events[0]['event_id']===$firstEvent&&count($one['revoked_event_ids'])===1&&count(completionRows($pdo,$current))===1,'quantity decrease reverses only the excess event from this grade and keeps its first event');
    $clearRequest=gradePlanRequest($pdo,$student,'');$clear=grade_plan_apply($pdo,1,$student,$current['id'],$plan,$prefix.'-clear',$clearRequest,'fixture');
    check(gradePlanDay($pdo,$student)->hifz===''&&gradePlanDay($pdo,$student)->_plan_hifz_v1->events===[]&&completionRows($pdo,$current)===[],'explicit grade clear reverses its own remaining event while retaining the binding and every historical event');
    $redo=grade_plan_apply($pdo,1,$student,$current['id'],$plan,$prefix.'-redo',gradePlanRequest($pdo,$student,'one'),'fixture');$before=gradeCellRaw($pdo,1);
    $oldClear=grade_plan_apply($pdo,1,$student,$current['id'],$plan,$prefix.'-clear',$clearRequest,'fixture');
    check($oldClear['replayed']&&gradeCellRaw($pdo,1)===$before&&completionRows($pdo,$current)[0]['id']===$redo['binding']->events[0]['event_id'],'an earlier cancellation receipt cannot remove the legitimate replacement completion');
    $wrongDate=gradePlanRequest($pdo,$student,'one','2026-11-09');
    gradeCellFailure(fn()=>grade_plan_apply($pdo,1,$student,$current['id'],$plan,$prefix.'-wrong-day',$wrongDate,'fixture'),'لا يطابق يومها');
    $wrongWeek=gradePlanRequest($pdo,$student,'one','2026-11-08');
    gradeCellFailure(fn()=>grade_plan_apply($pdo,1,$student,$current['id'],$plan,$prefix.'-wrong-week',$wrongWeek,'fixture'),'خارج الأسبوع المحدد');
    $store=json_decode(gradeCellRaw($pdo,1),false);$store->{$student}->{'1'}->days->mon=(object)['hifz'=>'one','manual_zero'=>0,'unknown'=>null];app_state_upsert($pdo,'grades',$store,1);
    $legacy=gradePlanRequest($pdo,$student,'','2026-11-02','1','mon');$before=gradeCellRaw($pdo,1);
    gradeCellFailure(fn()=>grade_plan_apply($pdo,1,$student,$current['id'],$plan,$prefix.'-legacy-cell',$legacy,'fixture'),'بلا مرجع إنجاز مؤكد');
    check(gradeCellRaw($pdo,1)===$before&&gradePlanDay($pdo,$student,'1','mon')->manual_zero===0,'only the unproven legacy cell is held; its score/zero/null remain in the native visible store');
    $independent=grade_plan_apply($pdo,1,$student,$current['id'],$plan,$prefix.'-independent',gradePlanRequest($pdo,$student,'one','2026-11-03','1','tue'),'fixture');
    check(count($independent['binding']->events)===1&&count(completionRows($pdo,$current))===2,'an independent new day continues from actual current progress while the old unproven day stays unchanged');
    $historical=gradePlanRequest($pdo,$student,'two');$next=gradePlanAssignment($pdo,$student,$plan,$current['id'],$prefix.'-next','2026-11-08',2);
    gradeCellFailure(fn()=>grade_plan_apply($pdo,1,$student,$current['id'],$plan,$prefix.'-old-assignment',$historical,'fixture'),'تغيّر التعيين الحالي');
    $before=gradeCellRaw($pdo,1);$replay=grade_plan_apply($pdo,1,$student,$current['id'],$plan,$prefix.'-first',$request,'fixture');
    check($replay['replayed']&&gradeCellRaw($pdo,1)===$before&&completionRows($pdo,$next)===[],'receipt replay after transfer is read-only and old-day editing cannot write the new assignment');
    $new=grade_plan_apply($pdo,1,$student,$next['id'],$plan,$prefix.'-new-day',gradePlanRequest($pdo,$student,'one','2026-11-08','2','sun'),'fixture');
    check($new['binding']->events[0]['segment_index']===2&&plan_events_hifz_counts($pdo,1,$next)===['total'=>1,'done'=>1]&&completionRaw($pdo,$student)===$raw,'new plan from the middle uses only its own new dated grade and segment, with all original raw completions intact');
    return ['first_request'=>$request,'first_response'=>$first,'old_assignment'=>$current,'current_assignment'=>$next];
}

function gradePlanSilverCases(PDO $pdo,string $student,string $plan,string $old,string $prefix):array {
    $current=gradePlanAssignment($pdo,$student,$plan,$old,$prefix.'-assign');
    $half=grade_plan_apply($pdo,1,$student,$current['id'],$plan,$prefix.'-half',gradePlanRequest($pdo,$student,'half'),'fixture');$first=$half['binding']->events[0]['event_id'];
    $two=grade_plan_apply($pdo,1,$student,$current['id'],$plan,$prefix.'-two',gradePlanRequest($pdo,$student,'two'),'fixture');
    check(count($two['binding']->events)===4&&$two['binding']->events[0]['event_id']===$first&&count(plan_events_history($pdo,1,$current))===4,'silver half-to-two keeps its first segment and atomically adds the other three using existing quantity rules');
    $one=grade_plan_apply($pdo,1,$student,$current['id'],$plan,$prefix.'-one',gradePlanRequest($pdo,$student,'one'),'fixture');
    check(count($one['binding']->events)===2&&$one['binding']->events[0]['event_id']===$first&&count($one['revoked_event_ids'])===2&&count(completionRows($pdo,$current))===2,'silver decrease cancels only its last two linked segments without touching the retained first two');
    return $current;
}
