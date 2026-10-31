<?php
declare(strict_types=1);
require_once __DIR__.'/../api/routes/semesters.php';
function continuityCalendarCases(PDO $pdo):void{
 // Temporary fixture tables shadow any earlier calendar fixture on this connection only.
 $pdo->exec('CREATE TEMPORARY TABLE semesters(id VARCHAR(50) PRIMARY KEY,complex_id INT,name TEXT,start_date DATE,weeks_count INT,working_days TEXT,excluded_dates TEXT,is_active INT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
 $pdo->exec('CREATE TEMPORARY TABLE academic_weeks(id VARCHAR(50) PRIMARY KEY,semester_id VARCHAR(50),week_number INT,start_date DATE,end_date DATE)');
 $pdo->exec("INSERT INTO semesters(id,complex_id,name,start_date,weeks_count,working_days,excluded_dates,is_active) VALUES('fixture-A',1,'fixture old','2026-10-01',1,'[0,1,2,3,4]','[]',1); INSERT INTO academic_weeks VALUES('fixture-week-A','fixture-A',1,'2026-10-01','2026-10-05')");
 $before=$pdo->query('SELECT * FROM app_state ORDER BY complex_id,`key`')->fetchAll();$assignments=$pdo->query('SELECT * FROM student_plan_assignments ORDER BY id')->fetchAll();$completions=$pdo->query('SELECT * FROM segment_completions ORDER BY student_id,plan_id,segment_index')->fetchAll();
 $GLOBALS['auth']=['role'=>'manager','complexId'=>1];$GLOBALS['input']=['semester'=>['name'=>'fixture new','start_date'=>'2026-11-01','weeks_count'=>1,'working_days'=>[0,1,2,3,4],'excluded_dates'=>[]],'weeks'=>[['week_number'=>1,'start_date'=>'2026-11-01','end_date'=>'2026-11-05']]];
 handle_create_semester();$new=$GLOBALS['response']['id'];check($GLOBALS['response']['ok']===true&&$new!=='fixture-A','actual unchanged calendar handler confirms the new calendar');
 check($pdo->query('SELECT * FROM app_state ORDER BY complex_id,`key`')->fetchAll()===$before,'actual calendar creation does not rewrite, reset or reattribute any grade/test/program/history store');
 check($pdo->query('SELECT * FROM student_plan_assignments ORDER BY id')->fetchAll()===$assignments&&$pdo->query('SELECT * FROM segment_completions ORDER BY student_id,plan_id,segment_index')->fetchAll()===$completions,'actual calendar creation leaves all plan identities, states and completion histories unchanged');
 check((int)$pdo->query("SELECT COUNT(*) FROM academic_weeks WHERE week_number=1")->fetchColumn()===2&&(int)$pdo->query("SELECT COUNT(*) FROM academic_weeks WHERE semester_id='fixture-A'")->fetchColumn()===1,'calendar week one in two periods coexists without moving student records or deleting the prior calendar');
}
