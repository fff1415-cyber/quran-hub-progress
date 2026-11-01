<?php
declare(strict_types=1);
require_once __DIR__.'/completion-events-cases.php';

function completionEditCases(PDO $pdo,string $student,string $plan,string $oldId,string $prefix):void
{
    $old=completionAssignment($pdo,$oldId);
    $raw=completionRaw($pdo,$student);
    $unknown=array_values(array_filter($raw,static fn($row)=>$row['assignment_id']===null))[0];
    completionFailure(fn()=>plan_events_set_hifz($pdo,1,$student,$oldId,$prefix.'-unknown',2,'remove',null,['legacy_id'=>$unknown['id']],'fixture'),'غير مربوط صراحة');
    check(count(completionRows($pdo,$old))===2&&completionRaw($pdo,$student)===$raw,'only an unproven legacy edit is held, while old progress and raw records remain visible');
    $exact=array_values(array_filter($raw,static fn($row)=>$row['assignment_id']===$oldId))[0];
    $corrected=plan_events_set_hifz($pdo,1,$student,$oldId,$prefix.'-legacy-date',1,'complete','2026-10-09',['legacy_id'=>$exact['id']],'fixture');
    check(count($corrected['event_ids'])===1&&completionRaw($pdo,$student)===$raw&&completionRows($pdo,$old)[0]['completed_at']==='2026-10-09','date correction creates a new immutable event; the explicitly linked source keeps its original date and unknown fields');
    $current=completionAssign($pdo,$student,$plan,$oldId,$prefix.'-assign');
    $source=['day_date'=>'2026-10-15','semester_id'=>'fixture-semester','zero'=>0,'unknown'=>null];
    $first=plan_events_set_hifz($pdo,1,$student,$current['id'],$prefix.'-first',1,'complete','2026-10-15',null,'fixture',$source);
    $target=['event_id'=>$first['event_ids'][0]];
    $retry=plan_events_set_hifz($pdo,1,$student,$current['id'],$prefix.'-first',1,'complete','2026-10-15',null,'changed-name',$source);
    check($retry['replayed']&&$retry['event_ids']===$first['event_ids']&&count(plan_events_history($pdo,1,$current))===1,'lost-response manual-completion retry does not append another event or change recorder');
    $same=plan_events_set_hifz($pdo,1,$student,$current['id'],$prefix.'-same',1,'complete','2026-10-15',$target,'fixture');
    check(!$same['changed']&&$same['event_ids']===[]&&count(plan_events_history($pdo,1,$current))===1,'same date and proven current identity need no duplicate completion event');
    $second=plan_events_set_hifz($pdo,1,$student,$current['id'],$prefix.'-correct',1,'complete','2026-10-16',$target,'fixture');
    $history=plan_events_history($pdo,1,$current);$byId=array_column($history,null,'id');
    check($byId[$first['event_ids'][0]]['completed_at']==='2026-10-15'&&$byId[$second['event_ids'][0]]['completed_at']==='2026-10-16'&&json_decode($byId[$second['event_ids'][0]]['source_reference_json'],true)['previous_event_id']===$first['event_ids'][0],'manual date change retains both versions and explicit causal predecessor');
    completionFailure(fn()=>plan_events_set_hifz($pdo,1,$student,$current['id'],$prefix.'-stale-date',1,'complete','2026-10-17',$target,'fixture'),'تغيّر مصدر الإنجاز');
    completionFailure(fn()=>plan_events_set_hifz($pdo,1,$student,$current['id'],$prefix.'-stale-remove',1,'remove',null,$target,'fixture'),'تغيّر مصدر الإنجاز');
    $secondTarget=['event_id'=>$second['event_ids'][0]];
    $removed=plan_events_set_hifz($pdo,1,$student,$current['id'],$prefix.'-remove',1,'remove',null,$secondTarget,'fixture');
    check(completionRows($pdo,$current)===[]&&count(plan_events_history($pdo,1,$current))===3,'manual removal appends a reversal without deleting either prior date');
    $none=plan_events_set_hifz($pdo,1,$student,$current['id'],$prefix.'-empty-remove',1,'remove',null,null,'fixture');
    check(!$none['changed']&&count(plan_events_history($pdo,1,$current))===3,'confirmed empty removal does not create an invented completion or duplicate reversal');
    $new=plan_events_set_hifz($pdo,1,$student,$current['id'],$prefix.'-redo',1,'complete','2026-10-18',null,'fixture');
    $again=plan_events_set_hifz($pdo,1,$student,$current['id'],$prefix.'-remove',1,'remove',null,$secondTarget,'fixture');
    check($again['event_ids']===$removed['event_ids']&&completionRows($pdo,$current)[0]['id']===$new['event_ids'][0],'old manual-removal replay cannot cancel a newer completion');
    completionFailure(fn()=>plan_events_set_hifz($pdo,1,$student,$current['id'],$prefix.'-bad-date',2,'complete','2026-02-30',null,'fixture'),'تاريخ الإنجاز');
    completionFailure(fn()=>plan_events_set_hifz($pdo,1,$student,$current['id'],$prefix.'-outside',999,'complete','2026-10-15',null,'fixture'),'خارج الخطة');
    $newAssignment=completionAssign($pdo,$student,$plan,$current['id'],$prefix.'-next');
    completionFailure(fn()=>plan_events_set_hifz($pdo,1,$student,$current['id'],$prefix.'-old-plan',2,'complete','2026-10-15',null,'fixture'),'تغيّر التعيين');
    $replay=plan_events_set_hifz($pdo,1,$student,$current['id'],$prefix.'-correct',1,'complete','2026-10-16',$target,'fixture');
    check($replay['event_ids']===$second['event_ids']&&completionRows($pdo,$newAssignment)===[]&&completionRaw($pdo,$student)===$raw,'historical receipt readback after transfer cannot write the new plan or rewrite old raw history');
}
