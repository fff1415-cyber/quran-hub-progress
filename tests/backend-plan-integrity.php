<?php
// Isolated SQLite acceptance tests; requires no live configuration or server.
declare(strict_types=1);
require __DIR__ . '/backend-sard-regression.php';

$pdo=seed();
$GLOBALS['auth']=['role'=>'manager','complexId'=>1,'name'=>'test'];
$GLOBALS['input']=['student_id'=>'student-1','plan_id'=>'next','start_segment_index'=>99];
expectFailure(fn()=>handle_assign_plan(),'مقطع البداية');
check(activePlan($pdo)==='current','invalid starting segment preserves current assignment');

$pdo=seed();$GLOBALS['auth']['role']='supervisor';
$GLOBALS['input']=['student_id'=>'student-1','assignment_id'=>'old','status'=>'frozen'];
handle_patch_assignment();
check($pdo->query("SELECT status FROM student_plan_assignments WHERE id='old'")->fetchColumn()==='frozen','freeze targets exact assignment');
$GLOBALS['input']=['student_id'=>'student-1','plan_id'=>'next','start_segment_index'=>1];handle_assign_plan();
check($pdo->query("SELECT status FROM student_plan_assignments WHERE id='old'")->fetchColumn()==='transferred','replacement retains frozen assignment as history');
$GLOBALS['input']=['student_id'=>'student-1','assignment_id'=>'old','status'=>'active'];expectFailure(fn()=>handle_patch_assignment(),'تغيّر تعيين');
check((int)$pdo->query("SELECT COUNT(*) FROM student_plan_assignments WHERE status IN ('active','frozen')")->fetchColumn()===1,'stale resume cannot activate two assignments');

$pdo=seed();$GLOBALS['auth']['role']='manager';
$pdo->exec("UPDATE student_plan_assignments SET status='transferred' WHERE id='old'; INSERT INTO student_plan_assignments(id,student_id,plan_id,start_segment_index,status) VALUES('new','student-1','current',1,'active')");
$GLOBALS['input']=['student_id'=>'student-1','expected_assignment_id'=>'new','task_type'=>'hifz','tap'=>'one','completed_at'=>'2026-10-12','operation_id'=>'tap-new-0001'];
handle_apply_plan_input();$first=$GLOBALS['response'];handle_apply_plan_input();
check($GLOBALS['response']===$first,'lost-response retry returns same result');
check((int)$pdo->query("SELECT COUNT(*) FROM plan_assignment_completions WHERE assignment_id='new'")->fetchColumn()===1,'same plan can be recorded in new assignment without overwriting old');
check((int)$pdo->query("SELECT COUNT(*) FROM plan_assignment_completions WHERE assignment_id='old'")->fetchColumn()===2,'previous assignment history is intact');
$GLOBALS['input']=['student_id'=>'student-1','assignment_id'=>'old','task_type'=>'hifz','segment_indexes'=>[1]];handle_remove_plan_completions();
check((int)$pdo->query("SELECT COUNT(*) FROM plan_assignment_completions WHERE assignment_id='new' AND revoked_at IS NULL")->fetchColumn()===1,'undo targets old assignment only');
check((int)$pdo->query("SELECT COUNT(*) FROM plan_assignment_completions WHERE assignment_id='old' AND revoked_at IS NOT NULL")->fetchColumn()===1,'undo retains original row as revoked history');

$pdo=seed();$GLOBALS['auth']['role']='manager';
$pdo->exec("DELETE FROM plan_assignment_completions; UPDATE education_plans SET track='silver' WHERE id='current'; CREATE TRIGGER fail_second BEFORE INSERT ON plan_assignment_completions WHEN NEW.segment_index=2 BEGIN SELECT RAISE(ABORT,'second segment failure'); END");
$GLOBALS['input']=['student_id'=>'student-1','expected_assignment_id'=>'old','task_type'=>'hifz','tap'=>'one','completed_at'=>'2026-10-12','operation_id'=>'tap-failure-0001'];
expectFailure(fn()=>handle_apply_plan_input(),'second segment failure');
check((int)$pdo->query('SELECT COUNT(*) FROM plan_assignment_completions')->fetchColumn()===0,'multi-segment partial failure rolls back all inserts');
check((int)$pdo->query('SELECT COUNT(*) FROM plan_operations')->fetchColumn()===0,'failed request has no successful replay record');

$pdo=seed();
$before=plans_assignment_content($pdo,['plan_id'=>'current']);plans_pin_existing_content($pdo,'current');
$pdo->exec("UPDATE plan_segments SET hifz_plan='new content' WHERE plan_id='current'");
$row=$pdo->query("SELECT * FROM student_plan_assignments WHERE id='old'")->fetch();
$pinned=plans_assignment_content($pdo,$row);
check($pinned['segments'][0]['hifz_plan']===$before['segments'][0]['hifz_plan'],'catalog update does not relabel observed assignment content');
check($pinned['provenance']==='observed_before_catalog_update_not_original','legacy content snapshot does not claim unverified original provenance');
echo "PASS: assignment-specific history, exact undo, freeze, idempotence, rollback and catalog snapshots\n";
