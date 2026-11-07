<?php
declare(strict_types=1);
define('QHP_FIXTURE_SUPPORT_ONLY',true);require __DIR__.'/backend-sard-regression.php';
$pdo=seed();$before=$pdo->query('SELECT * FROM segment_completions')->fetchAll();handle_assign_plan();
$student=$pdo->query('SELECT * FROM students')->fetch();
check(activePlan($pdo)==='next'&&(int)$student['phase_number']===2&&$student['level']==='2'&&$student['institute_level']==='التأهيل'&&queue($pdo)[0]['status']==='passed','actual assignment, student profile and passing queue commit together');
check($pdo->query('SELECT * FROM segment_completions')->fetchAll()===$before,'all previous completions remain unchanged after advancement');
expectFailure(fn()=>handle_assign_plan(),'تغيّرت خطة الطالب');check((int)$pdo->query('SELECT COUNT(*) FROM student_plan_assignments')->fetchColumn()===2,'repeated stale approval cannot create a duplicate advancement');
$pdo=seed();$pdo->exec("CREATE TRIGGER fail_profile BEFORE UPDATE ON students BEGIN SELECT RAISE(ABORT,'profile transaction fixture');END");
try{handle_assign_plan();throw new LogicException('Profile failure was not triggered');}catch(ApiFailure $error){check($error->getCode()===409&&str_contains($error->getMessage(),'مرجع:'),'profile SQL failure is explicit and privately referenced');}
check(activePlan($pdo)==='current'&&(int)$pdo->query('SELECT phase_number FROM students')->fetchColumn()===1&&queue($pdo)[0]['status']==='scheduled','profile failure rolls back new assignment, old closure and passing queue');
$pdo=seed();$pdo->exec("UPDATE education_plans SET level_number=1 WHERE id='current'");handle_assign_plan();check((int)$pdo->query('SELECT phase_number FROM students')->fetchColumn()===2,'legacy gold numbering advances without guessing historical completion links');
echo "SQLite transaction/field acceptance only; native profile acceptance is checked separately.\n";
