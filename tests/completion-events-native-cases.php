<?php
declare(strict_types=1);
require_once __DIR__.'/completion-events-cases.php';
require_once __DIR__.'/completion-edits-cases.php';
function completionNativeSeed(PDO $pdo,string $tag,string $plan='P'):array
{
    $student='ce-'.$tag.'-S';$old='ce-'.$tag.'-old';
    $pdo->prepare("INSERT INTO students(id,complex_id,phase_number,level) VALUES(?,1,1,'1')")->execute([$student]);
    $pdo->prepare("INSERT INTO student_plan_assignments(id,student_id,plan_id,start_segment_index,status,assigned_at) VALUES(?,?,?,1,'active','2026-10-01 00:00:00')")->execute([$old,$student,$plan]);
    $insert=$pdo->prepare("INSERT INTO segment_completions(id,student_id,plan_id,assignment_id,segment_index,task_type,completed_at,recorded_by,created_at,fixture_extra) VALUES(?,?,?,?,?,'hifz','2026-10-02','original','2026-10-02 00:00:00',?)");
    $extra='{"zero":0,"unknown":null}';$insert->execute([$tag.'-legacy1',$student,$plan,$old,1,$extra]);$insert->execute([$tag.'-legacy2',$student,$plan,null,2,$extra]);
    return [$student,$old];
}
function completionNativeCases(PDO $pdo):void
{
    $pdo->exec(file_get_contents(__DIR__.'/fixtures/plan-completion-events.sql'));
    $pdo->exec('ALTER TABLE segment_completions ADD COLUMN fixture_extra LONGTEXT NULL');
    $pdo->exec('ALTER TABLE students ADD COLUMN halaqa_id INT DEFAULT 7');
    [$student,$old]=completionNativeSeed($pdo,'main');completionEventCases($pdo,$student,'P',$old,'ce-main');
    [$student,$old]=completionNativeSeed($pdo,'legacy');completionLegacyCases($pdo,$student,$old,'ce-old');
    [$student,$old]=completionNativeSeed($pdo,'edit');completionEditCases($pdo,$student,'P',$old,'ce-native-edit');
    [$student,$old]=completionNativeSeed($pdo,'snapshot');$current=completionAssign($pdo,$student,'P',$old,'ce-snapshot-assign');
    $stale=connectFixture();$stale->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');$stale->beginTransaction();
    $stale->query('SELECT COUNT(*) FROM plan_completion_heads')->fetchColumn();
    $written=plan_events_set_hifz($pdo,1,$student,$current['id'],'ce-snapshot-first',1,'complete','2026-10-15',null,'fixture');
    check(plan_events_read($stale,1,$current)===[], 'negative control: an established repeatable-read snapshot misses a later committed completion');
    check(count(plan_events_read($stale,1,$current,true))===1, 'current locked source read sees the confirmed event instead of the older snapshot');
    completionFailure(fn()=>plan_events_set_hifz($stale,1,$student,$current['id'],'ce-snapshot-stale',1,'complete','2026-10-16',null,'fixture'),'تغيّر مصدر الإنجاز');
    check(!$stale->inTransaction()&&count(plan_events_history($pdo,1,$current))===1&&completionRows($pdo,$current)[0]['id']===$written['event_ids'][0], 'stale outer snapshot cannot overwrite a newer same-cell event or commit a second receipt');
    [$student,$old]=completionNativeSeed($pdo,'edit-race');$current=completionAssign($pdo,$student,'P',$old,'ce-edit-race-assign');$children=[];$results=[];
    for($i=0;$i<2;$i++) {
        $pid=pcntl_fork();if($pid===-1)throw new RuntimeException('fork unavailable');
        if($pid===0) {
            try {$GLOBALS['pdo']=connectFixture();plan_events_set_hifz($GLOBALS['pdo'],1,$student,$current['id'],'ce-edit-race-'.$i,1,'complete',$i===0?'2026-10-15':'2026-10-16',null,'fixture');exit(0);}
            catch(Throwable $error) {if(!str_contains($error->getMessage(),'تغيّر مصدر الإنجاز'))fwrite(STDERR,'Isolated manual race: '.get_class($error).' '.$error->getMessage()."\n");exit(str_contains($error->getMessage(),'تغيّر مصدر الإنجاز')?2:1);}
        }
        $children[]=$pid;
    }
    foreach($children as $pid) {pcntl_waitpid($pid,$status);check(pcntl_wifexited($status),'manual edit race exits cleanly');$results[]=pcntl_wexitstatus($status);}
    sort($results);$GLOBALS['pdo']=$pdo=connectFixture();
    check($results===[0,2]&&count(plan_events_history($pdo,1,$current))===1&&count(completionRows($pdo,$current))===1,'two different same-cell manual requests yield one confirmed event and one explicit conflict without lost writes');
    [$student,$old]=completionNativeSeed($pdo,'apply-race');$current=completionAssign($pdo,$student,'P',$old,'ce-apply-race-assign');$children=[];
    for($i=0;$i<2;$i++) {
        $pid=pcntl_fork();if($pid===-1)throw new RuntimeException('fork unavailable');
        if($pid===0) {
            try {
                $child=connectFixture();$child->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');$child->beginTransaction();
                $child->query('SELECT COUNT(*) FROM plan_completion_heads')->fetchColumn();
                $result=plan_events_apply($child,1,$student,$current['id'],'ce-distinct-tap-'.$i,'hifz','one','2026-10-15','fixture');
                $child->commit();exit(count($result['applied_segments'])===1?0:1);
            } catch(Throwable $error) {fwrite(STDERR,'Isolated tap race: '.get_class($error).' '.$error->getMessage()."\n");exit(1);}
        }
        $children[]=$pid;
    }
    foreach($children as $pid) {pcntl_waitpid($pid,$status);check(pcntl_wifexited($status)&&pcntl_wexitstatus($status)===0,'distinct concurrent taps commit from established outer snapshots');}
    $GLOBALS['pdo']=$pdo=connectFixture();$segments=array_map('intval',array_column(plan_events_history($pdo,1,$current),'segment_index'));sort($segments);
    check($segments===[1,2]&&count(completionRows($pdo,$current))===2,'current source reads select two different next segments instead of recording the first twice');
    [$student,$old]=completionNativeSeed($pdo,'edit-failure');$current=completionAssign($pdo,$student,'P',$old,'ce-edit-failure-assign');
    $pdo->exec('ALTER TABLE plan_completion_heads ADD CONSTRAINT fixture_manual_edit_head CHECK(assignment_id<>'.$pdo->quote($current['id']).')');
    $grade=$pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='grades'")->fetchColumn();
    $pdo->beginTransaction();app_state_upsert($pdo,'grades',['fixture'=>['keep'=>99]],1);
    completionFailure(fn()=>plan_events_set_hifz($pdo,1,$student,$current['id'],'ce-native-edit-failure',1,'complete','2026-10-15',null,'fixture'),'fixture_manual_edit_head');
    check(!$pdo->inTransaction()&&$pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='grades'")->fetchColumn()===$grade&&completionRows($pdo,$current)===[]&&(int)$pdo->query("SELECT COUNT(*) FROM plan_operation_receipts WHERE operation_id='ce-native-edit-failure'")->fetchColumn()===0,'native manual-edit head failure keeps grade bytes and leaves no event or provisional receipt');
    [$student,$old]=completionNativeSeed($pdo,'atomic');$current=completionAssign($pdo,$student,'P',$old,'ce-atomic-assignment');$raw=completionRaw($pdo,$student);
    $pdo->exec('ALTER TABLE plan_completion_heads ADD CONSTRAINT fixture_second_event_head CHECK(assignment_id<>'.$pdo->quote($current['id']).' OR segment_index<>2)');
    $grade=$pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='grades'")->fetchColumn();
    $pdo->beginTransaction();app_state_upsert($pdo,'grades',['fixture'=>['keep'=>0,'unknown'=>null]],1);
    completionFailure(fn()=>plan_events_apply($pdo,1,$student,$current['id'],'ce-native-partial','hifz','two','2026-10-15','fixture'),'fixture_second_event_head');
    $count=$pdo->prepare('SELECT COUNT(*) FROM plan_completion_events WHERE assignment_id=?');$count->execute([$current['id']]);
    check(!$pdo->inTransaction()&&$count->fetchColumn()==0&&completionRows($pdo,$current)===[]&&completionRaw($pdo,$student)===$raw&&$pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='grades'")->fetchColumn()===$grade,'native second-segment failure rolls back the whole composed grade transaction, pending receipt, events and heads');
    [$student,$old]=completionNativeSeed($pdo,'final');$current=completionAssign($pdo,$student,'P',$old,'ce-final-assignment');
    $pdo->exec("ALTER TABLE plan_operation_receipts ADD CONSTRAINT fixture_completion_finalize CHECK(operation_id<>'ce-native-finalize' OR response_json NOT LIKE '%event_ids%')");
    completionFailure(fn()=>plan_events_apply($pdo,1,$student,$current['id'],'ce-native-finalize','hifz','one','2026-10-15','fixture'),'fixture_completion_finalize');
    check(completionRows($pdo,$current)===[]&&(int)$pdo->query("SELECT COUNT(*) FROM plan_operation_receipts WHERE operation_id='ce-native-finalize'")->fetchColumn()===0,'native final-receipt failure leaves neither provisional receipt nor partial completion');
    [$student,$old]=completionNativeSeed($pdo,'race');$current=completionAssign($pdo,$student,'P',$old,'ce-race-assignment');$raw=completionRaw($pdo,$student);$children=[];
    for($i=0;$i<2;$i++){
        $pid=pcntl_fork();if($pid===-1)throw new RuntimeException('fork unavailable');
        if($pid===0){try{$GLOBALS['pdo']=connectFixture();$result=plan_events_apply($GLOBALS['pdo'],1,$student,$current['id'],'ce-native-race','hifz','one','2026-10-15','fixture');exit($result['applied_segments']===[1]?0:1);}catch(Throwable $error){exit(1);}}
        $children[]=$pid;
    }
    foreach($children as $pid){pcntl_waitpid($pid,$status);check(pcntl_wifexited($status)&&pcntl_wexitstatus($status)===0,'concurrent identical completion requests confirm the same segment');}
    $GLOBALS['pdo']=$pdo=connectFixture();
    check(count(plan_events_history($pdo,1,$current))===1&&count(completionRows($pdo,$current))===1&&completionRaw($pdo,$student)===$raw,'native row locks keep one event/receipt and never overwrite the old shared unique slot');
    // Fault injection: the FK alone cannot prove that a head belongs to the same assignment.
    $otherQuery=$pdo->prepare('SELECT id FROM plan_completion_events WHERE assignment_id<>? LIMIT 1');$otherQuery->execute([$current['id']]);$foreign=$otherQuery->fetchColumn();
    $head=completionRows($pdo,$current)[0]['id'];$pdo->prepare('UPDATE plan_completion_heads SET current_event_id=? WHERE assignment_id=?')->execute([$foreign,$current['id']]);
    completionFailure(fn()=>completionRows($pdo,$current),'لا يطابق الطالب');
    $pdo->prepare('UPDATE plan_completion_heads SET current_event_id=? WHERE assignment_id=?')->execute([$head,$current['id']]);
    check(count(completionRows($pdo,$current))===1,'invalid cross-assignment reference is rejected rather than repaired or counted as zero');
    [$student,$old]=completionNativeSeed($pdo,'history');$current=completionAssign($pdo,$student,'P',$old,'ce-history-assignment');$raw=completionRaw($pdo,$student);
    for($i=0;$i<325;$i++){
        $written=plan_events_apply($pdo,1,$student,$current['id'],'ce-history-write-'.$i,'hifz','one','2026-10-15','fixture');
        plan_events_revoke($pdo,1,$student,$current['id'],'ce-history-revoke-'.$i,[['segment_index'=>1,'event_id'=>$written['event_ids'][0]]],'fixture');
    }
    plan_events_apply($pdo,1,$student,$current['id'],'ce-history-final','hifz','one','2026-10-15','fixture');
    check(count(plan_events_history($pdo,1,$current))===651&&count(completionRows($pdo,$current))===1&&completionRaw($pdo,$student)===$raw,'all 651 immutable events remain; only the explicit head defines current progress');
    echo "PASS: native completion-event identity, exact undo/redo, concurrency, legacy retention and composed failure rollback\n";
}
