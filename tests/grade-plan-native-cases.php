<?php
declare(strict_types=1);
require __DIR__.'/../api/lib/grade-plan-operations.php';require __DIR__.'/grade-plan-cases.php';
$GLOBALS['pdo']=$pdo=connectFixture();
$pdo->exec('CREATE TABLE academic_weeks(id VARCHAR(50) PRIMARY KEY,semester_id INT,week_number INT,start_date DATE,end_date DATE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
$pdo->exec("INSERT INTO academic_weeks VALUES('gp-native-week1',1,1,'2026-11-01','2026-11-07'),('gp-native-week2',1,2,'2026-11-08','2026-11-14')");
[$student,$old]=completionNativeSeed($pdo,'gp-main');$main=gradePlanCases($pdo,$student,'P',$old,'gp-native');
[$student,$old]=completionNativeSeed($pdo,'gp-failure');$current=gradePlanAssignment($pdo,$student,'P',$old,'gp-failure-assignment');$request=gradePlanRequest($pdo,$student,'one');$before=gradeCellRaw($pdo,1);$raw=completionRaw($pdo,$student);
$pdo->exec("ALTER TABLE grade_operation_receipts ADD CONSTRAINT fixture_compound_grade CHECK(operation_id<>'gp-native-grade-failure')");
gradeCellFailure(fn()=>grade_plan_apply($pdo,1,$student,$current['id'],'P','gp-native-grade-failure',$request,'fixture'),'fixture_compound_grade');
check(gradeCellRaw($pdo,1)===$before&&completionRaw($pdo,$student)===$raw&&plan_events_history($pdo,1,$current)===[]&&(int)$pdo->query("SELECT COUNT(*) FROM plan_operation_receipts WHERE operation_id='gp-native-grade-failure'")->fetchColumn()===0,'native grade-receipt failure rolls back events/heads, grade/binding, versions and root receipt');
$pdo->exec("ALTER TABLE plan_operation_receipts ADD CONSTRAINT fixture_compound_root CHECK(operation_id<>'gp-native-root-failure' OR response_json NOT LIKE '%grade_input_sha256%')");
gradeCellFailure(fn()=>grade_plan_apply($pdo,1,$student,$current['id'],'P','gp-native-root-failure',$request,'fixture'),'fixture_compound_root');
check(gradeCellRaw($pdo,1)===$before&&plan_events_history($pdo,1,$current)===[]&&(int)$pdo->query("SELECT COUNT(*) FROM grade_operation_receipts WHERE operation_id='gp-native-root-failure'")->fetchColumn()===0,'native final compound receipt cannot leave an acknowledged grade without its completion');
$pdo->exec("INSERT INTO education_plans(id,complex_id,track,level_number,title,segment_count) VALUES('gp-silver-plan',1,'silver',9001,'fixture silver',4)");
$insert=$pdo->prepare("INSERT INTO plan_segments(id,plan_id,segment_index,hifz_plan,rabt_plan,muraja_plan) VALUES(?,'gp-silver-plan',?,'h','r','m')");for($i=1;$i<=4;$i++)$insert->execute(['gp-silver-segment-'.$i,$i]);
[$student,$old]=completionNativeSeed($pdo,'gp-silver','gp-silver-plan');gradePlanSilverCases($pdo,$student,'gp-silver-plan',$old,'gp-native-silver');
[$student,$old]=completionNativeSeed($pdo,'gp-silver-fail','gp-silver-plan');$current=gradePlanAssignment($pdo,$student,'gp-silver-plan',$old,'gp-silver-fail-assign');
grade_plan_apply($pdo,1,$student,$current['id'],'gp-silver-plan','gp-silver-fail-first',gradePlanRequest($pdo,$student,'half'),'fixture');
$request=gradePlanRequest($pdo,$student,'two');$before=gradeCellRaw($pdo,1);$history=plan_events_history($pdo,1,$current);
$pdo->exec('ALTER TABLE plan_completion_heads ADD CONSTRAINT fixture_compound_fourth CHECK(assignment_id<>'.$pdo->quote($current['id']).' OR segment_index<>4)');
gradeCellFailure(fn()=>grade_plan_apply($pdo,1,$student,$current['id'],'gp-silver-plan','gp-silver-partial-fail',$request,'fixture'),'fixture_compound_fourth');
check(gradeCellRaw($pdo,1)===$before&&plan_events_history($pdo,1,$current)===$history&&count(completionRows($pdo,$current))===1&&(int)$pdo->query("SELECT COUNT(*) FROM plan_operation_receipts WHERE operation_id='gp-silver-partial-fail'")->fetchColumn()===0,'fourth-segment failure rolls back the earlier added segments and all receipts while the prior half-grade keeps its original event');
// Two different day cells share one plan and must keep both grades and distinct segments.
[$student,$old]=completionNativeSeed($pdo,'gp-race');$current=gradePlanAssignment($pdo,$student,'P',$old,'gp-race-assignment');
$requests=[gradePlanRequest($pdo,$student,'one'),gradePlanRequest($pdo,$student,'one','2026-11-02','1','mon')];$children=[];
for($i=0;$i<2;$i++) {
    $pid=pcntl_fork();if($pid===-1)throw new RuntimeException('fork unavailable');
    if($pid===0) {try{$child=connectFixture();grade_plan_apply($child,1,$student,$current['id'],'P','gp-native-race-'.$i,$requests[$i],'fixture');exit(0);}catch(Throwable $error){fwrite(STDERR,'Isolated compound race: '.$error->getMessage()."\n");exit(1);}}
    $children[]=$pid;
}
foreach($children as $pid) {pcntl_waitpid($pid,$status);check(pcntl_wifexited($status)&&pcntl_wexitstatus($status)===0,'concurrent grade/completion operation commits as a whole');}
$GLOBALS['pdo']=$pdo=connectFixture();$sun=gradePlanDay($pdo,$student);$mon=gradePlanDay($pdo,$student,'1','mon');
check($sun->hifz==='one'&&$mon->hifz==='one'&&$sun->_plan_hifz_v1->events[0]->event_id!==$mon->_plan_hifz_v1->events[0]->event_id&&count(completionRows($pdo,$current))===2,'different-day concurrency retains two grades and two distinct proven plan events');
[$student,$old]=completionNativeSeed($pdo,'gp-same');$current=gradePlanAssignment($pdo,$student,'P',$old,'gp-same-assignment');$requests=[gradePlanRequest($pdo,$student,'one'),gradePlanRequest($pdo,$student,'two')];$children=[];$results=[];
for($i=0;$i<2;$i++) {
    $pid=pcntl_fork();if($pid===-1)throw new RuntimeException('fork unavailable');
    if($pid===0) {try{$child=connectFixture();grade_plan_apply($child,1,$student,$current['id'],'P','gp-native-same-'.$i,$requests[$i],'fixture');exit(0);}catch(Throwable $error){exit($error->getCode()===409&&str_contains($error->getMessage(),'عدّل مستخدم آخر')?2:1);}}
    $children[]=$pid;
}
foreach($children as $pid) {pcntl_waitpid($pid,$status);check(pcntl_wifexited($status),'same-cell compound worker exits cleanly');$results[]=pcntl_wexitstatus($status);}
sort($results);$GLOBALS['pdo']=$pdo=connectFixture();$day=gradePlanDay($pdo,$student);
check($results===[0,2]&&count(completionRows($pdo,$current))===($day->hifz==='two'?2:1)&&(int)$pdo->query("SELECT COUNT(*) FROM grade_operation_receipts WHERE operation_id IN ('gp-native-same-0','gp-native-same-1')")->fetchColumn()===1,'same-day race commits one complete grade/event operation and explicitly rejects the stale one');
echo "PASS: native dated hifz grade/event atomic coordinator; no public writer, browser, non-hifz or production activation claimed\n";
