<?php
declare(strict_types=1);

function completionAssignment(PDO $pdo,string $id):array
{
    $query=$pdo->prepare('SELECT a.*,p.track,p.level_number,p.title FROM student_plan_assignments a JOIN education_plans p ON p.id=a.plan_id WHERE a.id=?');$query->execute([$id]);return $query->fetch();
}
function completionRaw(PDO $pdo,string $student):array
{
    $query=$pdo->prepare('SELECT * FROM segment_completions WHERE student_id=? ORDER BY id');$query->execute([$student]);return $query->fetchAll();
}
function completionRows(PDO $pdo,array $assignment,string $task='hifz'):array
{
    return array_values(array_filter(array_column(plan_events_read($pdo,1,$assignment),'completion'),static fn($row)=>$row['task_type']===$task));
}
function completionFailure(callable $run,string $message):void
{
    try{$run();}catch(Throwable $error){if(!str_contains($error->getMessage(),$message))throw new RuntimeException('Expected '.$message.'; actual isolated error: '.$error->getMessage(),0,$error);check(true,$message);return;}
    throw new RuntimeException('Expected completion rejection: '.$message);
}
function completionAssign(PDO $pdo,string $student,string $plan,string $expected,string $operation,int $start=1):array
{
    $GLOBALS['auth']=['role'=>'supervisor','complexId'=>1,'name'=>'fixture'];
    $GLOBALS['input']=['student_id'=>$student,'plan_id'=>$plan,'start_segment_index'=>$start,'expected_assignment_id'=>$expected,'operation_id'=>$operation];
    handle_assign_plan();return completionAssignment($pdo,$GLOBALS['response']['assignment_id']);
}
function completionEventCases(PDO $pdo,string $student,string $plan,string $oldId,string $prefix):void
{
    $old=completionAssignment($pdo,$oldId);$initial=completionRaw($pdo,$student);
    check(count(completionRows($pdo,$old))===2&&!plan_events_strict_assignment($pdo,$old),'pre-cutover assignment keeps its exact existing progress and legacy mode');
    $legacy=plan_events_read($pdo,1,$old);check(count(array_filter($legacy,static fn($row)=>$row['source']['kind']==='legacy_unassigned'))===1,'unassigned legacy provenance stays explicit and is never silently rebound');
    $current=completionAssign($pdo,$student,$plan,$oldId,$prefix.'-assignment');
    $future=(new DateTimeImmutable((string)$current['assigned_at']))->modify('+1 day')->format('Y-m-d H:i:s');
    // Deliberately adversarial fixture timestamp: dates must not attach this old NULL row to a new assignment.
    $pdo->prepare('UPDATE segment_completions SET created_at=? WHERE student_id=? AND assignment_id IS NULL')->execute([$future,$student]);
    $raw=completionRaw($pdo,$student);
    check(plan_events_strict_assignment($pdo,$current)&&completionRows($pdo,$current)===[],'actual assignment handler stamps only the new assignment; repeated-plan progress excludes old explicit and NULL rows even with a later timestamp');
    check(count(completionRows($pdo,$old))===2&&$raw[0]['assignment_id']===$initial[0]['assignment_id']&&$raw[1]['assignment_id']===$initial[1]['assignment_id'],'old plan remains readable and original ownership of its completion rows is unchanged');
    completionFailure(fn()=>plan_events_apply($pdo,1,$student,$current['id'],$prefix.'-early-rabt','rabt','one','2026-10-15','fixture'),'لا توجد مقاطع');
    check(plan_events_history($pdo,1,$current)===[],'existing rabt gate cannot create an event before hifz');
    $source=['semester_id'=>'fixture-semester','day_date'=>'2026-10-15','unknown_zero'=>0,'unknown_null'=>null];
    $first=plan_events_apply($pdo,1,$student,$current['id'],$prefix.'-first','hifz','one','2026-10-15','fixture',$source);
    check($first['applied_segments']===[1]&&count($first['event_ids'])===1,'gold one records exactly the first current-assignment segment');
    $oldQuery=$pdo->prepare('SELECT segment_index FROM segment_completions WHERE student_id=? AND plan_id=? AND (assignment_id=? OR (assignment_id IS NULL AND created_at>=?))');
    $oldQuery->execute([$student,$plan,$current['id'],$current['assigned_at']]);
    check(array_map('intval',array_column($oldQuery->fetchAll(),'segment_index'))===[2]&&array_map('intval',array_column(completionRows($pdo,$current),'segment_index'))===[1],'negative control: the old reader identifies the wrong segment even when both percentages would be 50%; a future deployment must retain the event reader');
    $history=plan_events_history($pdo,1,$current);$reference=json_decode($history[0]['source_reference_json'],true);
    check($reference['source']===$source&&$history[0]['completed_at']==='2026-10-15','explicit date and opaque source preserve zero/null without inferring a semester or recalculating anything');
    $repeat=plan_events_apply($pdo,1,$student,$current['id'],$prefix.'-first','hifz','one','2026-10-15','changed-name',$source);
    check($repeat['event_ids']===$first['event_ids']&&$repeat['replayed']&&count(plan_events_history($pdo,1,$current))===1,'lost-response retry returns the original event and recorder without advancing again');
    completionFailure(fn()=>plan_events_apply($pdo,1,$student,$current['id'],$prefix.'-first','hifz','two','2026-10-15','fixture',$source),'بيانات مختلفة');
    $rabt=plan_events_apply($pdo,1,$student,$current['id'],$prefix.'-rabt','rabt','one','2026-10-15','fixture');
    check($rabt['applied_segments']===[1],'existing rabt ordering still follows completed hifz');
    $second=plan_events_apply($pdo,1,$student,$current['id'],$prefix.'-second','hifz','one','2026-10-16','fixture');
    check($second['applied_segments']===[2]&&count(completionRows($pdo,$current))===2,'old shared unique slot never overwrites history; the second actual event completes only this assignment');
    $cancel=[['segment_index'=>1,'event_id'=>$first['event_ids'][0]]];
    $removed=plan_events_revoke($pdo,1,$student,$current['id'],$prefix.'-cancel',$cancel,'fixture');
    check($removed['removed']===1&&count(completionRows($pdo,$current))===1&&count(completionRows($pdo,$current,'rabt'))===1,'cancellation reverses the exact hifz event without deleting independent rabt');
    $redo=plan_events_apply($pdo,1,$student,$current['id'],$prefix.'-redo','hifz','one','2026-10-17','fixture');
    completionFailure(fn()=>plan_events_revoke($pdo,1,$student,$current['id'],$prefix.'-stale-cancel',$cancel,'fixture'),'إنجاز أحدث');
    check(count(completionRows($pdo,$current))===2,'stale source identity cannot cancel the replacement event');
    $again=plan_events_revoke($pdo,1,$student,$current['id'],$prefix.'-cancel',$cancel,'fixture');
    check($again['event_ids']===$removed['event_ids']&&count(completionRows($pdo,$current))===2,'old cancellation receipt never undoes a legitimate newer completion');
    $newCancel=[['segment_index'=>1,'event_id'=>$redo['event_ids'][0]]];
    plan_events_revoke($pdo,1,$student,$current['id'],$prefix.'-cancel-redo',$newCancel,'fixture');
    $count=count(plan_events_history($pdo,1,$current));$noOp=plan_events_revoke($pdo,1,$student,$current['id'],$prefix.'-cancel-again',$newCancel,'fixture');
    check($noOp['removed']===0&&count(plan_events_history($pdo,1,$current))===$count,'repeated cancellation with a new request identity does not duplicate historical reversal events');
    check(completionRaw($pdo,$student)===$raw,'all original legacy rows, NULL associations, dates and unknown columns remain byte-equivalent at values');
    $next=completionAssign($pdo,$student,$plan,$current['id'],$prefix.'-next',2);
    completionFailure(fn()=>plan_events_revoke($pdo,1,$student,$current['id'],$prefix.'-old-assignment',[['segment_index'=>2,'event_id'=>$second['event_ids'][0]]],'fixture'),'تغيّر التعيين');
    check(completionRows($pdo,$next)===[]&&count(completionRows($pdo,$current))===1,'a previous-assignment edit neither changes the new plan nor destroys its old history');
    $middle=plan_events_apply($pdo,1,$student,$next['id'],$prefix.'-middle','hifz','one','2026-10-18','fixture');
    check($middle['applied_segments']===[2],'a real middle start retains the existing segment-range policy');
    $replayed=plan_events_apply($pdo,1,$student,$current['id'],$prefix.'-first','hifz','one','2026-10-15','fixture',$source);
    check($replayed['event_ids']===$first['event_ids']&&count(completionRows($pdo,$next))===1,'known earlier-operation replay is read-only even after a new assignment');
    check(completionRaw($pdo,$student)===$raw,'same-plan repetition never rewrites a historical unique completion slot');
}

function completionLegacyCases(PDO $pdo,string $student,string $assignmentId,string $prefix):void
{
    $assignment=completionAssignment($pdo,$assignmentId);$raw=completionRaw($pdo,$student);
    $unbound=array_values(array_filter($raw,static fn($row)=>$row['assignment_id']===null))[0];
    $exact=array_values(array_filter($raw,static fn($row)=>$row['assignment_id']!==null))[0];
    completionFailure(fn()=>plan_events_revoke($pdo,1,$student,$assignmentId,$prefix.'-unknown',[['segment_index'=>(int)$unbound['segment_index'],'legacy_id'=>$unbound['id']]],'fixture'),'غير مربوط صراحة');
    check(count(completionRows($pdo,$assignment))===2&&plan_events_history($pdo,1,$assignment)===[],'only the ambiguous operation is held; its legacy progress and source remain visible');
    $target=[['segment_index'=>(int)$exact['segment_index'],'legacy_id'=>$exact['id']]];
    plan_events_revoke($pdo,1,$student,$assignmentId,$prefix.'-exact',$target,'fixture');
    check(count(completionRows($pdo,$assignment))===1&&completionRaw($pdo,$student)===$raw,'a proven legacy identity can be reversed by a new event without deleting its original row');
    $redo=plan_events_apply($pdo,1,$student,$assignmentId,$prefix.'-redo','hifz','one','2026-10-20','fixture');
    plan_events_revoke($pdo,1,$student,$assignmentId,$prefix.'-undo-redo',[['segment_index'=>$redo['applied_segments'][0],'event_id'=>$redo['event_ids'][0]]],'fixture');
    check(count(completionRows($pdo,$assignment))===1&&completionRaw($pdo,$student)===$raw,'undo/redo cannot resurrect the raw legacy row or erase the unassigned one');
}
