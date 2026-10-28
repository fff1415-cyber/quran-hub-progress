<?php
declare(strict_types=1);
require __DIR__.'/backend-sard-regression.php';
$pdo=seed();$GLOBALS['input']['operation_id']='pass-retry-0001';$GLOBALS['input']['sard_result']['hifzScore']=40;$GLOBALS['input']['sard_result']['reviewScore']=45;
handle_assign_plan();$first=$GLOBALS['response'];handle_assign_plan();
check(state_canonical($GLOBALS['response'])===state_canonical($first),'lost pass response replays original atomic result');
check((int)$pdo->query("SELECT phase_number FROM students WHERE id='student-1'")->fetchColumn()===2,'profile phase committed with assignment');
$state=json_decode($pdo->query("SELECT value FROM app_state WHERE `key`='academic_records'")->fetchColumn(),true);
check(count($state['scopes']['_'])===1&&$state['scopes']['_'][0]['assignmentId']==='old','one academic record binds completed assignment');
check($state['scopes']['_'][0]['semesterId']===null,'old queue semester is not guessed from active term');
$pdo=seed();$pdo->exec("CREATE TRIGGER fail_profile BEFORE UPDATE ON students BEGIN SELECT RAISE(ABORT,'profile commit failure'); END");expectFailure(fn()=>handle_assign_plan(),'profile commit failure');check(activePlan($pdo)==='current'&&queue($pdo)[0]['status']==='scheduled','profile failure rolls back assignment and queue');
$pdo=seed();$pdo->exec("CREATE TRIGGER fail_history BEFORE INSERT ON app_state WHEN NEW.`key`='academic_records' BEGIN SELECT RAISE(ABORT,'academic commit failure'); END");expectFailure(fn()=>handle_assign_plan(),'academic commit failure');
check(activePlan($pdo)==='current'&&queue($pdo)[0]['status']==='scheduled'&&(int)$pdo->query('SELECT phase_number FROM students')->fetchColumn()===1,'academic failure rolls back profile, queue and assignment');
$pdo=seed();$pdo->exec("UPDATE education_plans SET level_number=5030 WHERE id='current'; UPDATE students SET phase_number=30,level='30'");
$GLOBALS['input']=['student_id'=>'student-1','plan_id'=>'current','expected_assignment_id'=>'old','start_segment_index'=>1,'operation_id'=>'final-pass-0001','finalize_only'=>true,'sard_result'=>['id'=>'sq-1','percent'=>90,'phase'=>'full']];handle_assign_plan();
check((int)$pdo->query('SELECT COUNT(*) FROM student_plan_assignments')->fetchColumn()===1&&activePlan($pdo)==='current'&&queue($pdo)[0]['status']==='passed','final plan stays visible while pass and history commit atomically');
echo "PASS: atomic profile/plan/pass/history, final plan and response-loss retries\n";
