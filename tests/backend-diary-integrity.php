<?php
declare(strict_types=1);
require __DIR__.'/backend-sard-regression.php';
function diarySeed(): PDO {
    $p=seed();$p->exec("DELETE FROM plan_assignment_completions;
    CREATE TABLE semesters(id TEXT PRIMARY KEY,complex_id INT,is_active INT); INSERT INTO semesters VALUES('term-A',1,1);
    CREATE TABLE academic_weeks(semester_id TEXT,week_number INT,start_date TEXT,end_date TEXT); INSERT INTO academic_weeks VALUES('term-A',1,'2026-10-11','2026-10-15');
    CREATE TABLE plan_diary_events(id TEXT PRIMARY KEY,complex_id INT,semester_id TEXT,student_id TEXT,assignment_id TEXT,week_number INT,day_key TEXT,field_name TEXT,completed_at TEXT,grade_json TEXT,requested_quantity NUMERIC,segments_json TEXT,operation_id TEXT,revoked_at TEXT);");
    $GLOBALS['auth']['role']='manager';return $p;
}
function diaryInput(string $id,string $field,mixed $value,mixed $base='',string $assignment='old',string $day='sun',string $date='2026-10-11'): array {
    return ['student_id'=>'student-1','expected_assignment_id'=>$assignment,'operation_id'=>$id,'task_type'=>$field==='compensationFaces'?'hifz':$field,'tap'=>'one','diary'=>['semester_id'=>'term-A','week_number'=>1,'day_key'=>$day,'date'=>$date,'field'=>$field,'base'=>$base,'value'=>$value]];
}
function recordDay(array $input): array {$GLOBALS['input']=$input;handle_apply_plan_input();return $GLOBALS['response'];}
$pdo=diarySeed();$input=diaryInput('day-record-0001','hifz','one');$r=recordDay($input);recordDay($input);
check((int)$pdo->query('SELECT COUNT(*) FROM plan_diary_events')->fetchColumn()===1,'lost response retry creates one diary event');
check($r['entry']['hifz']==='one'&&$r['segments']===[1],'grade and exact completion commit together');
check($pdo->query('SELECT completed_at FROM plan_assignment_completions')->fetchColumn()==='2026-10-11','completion uses selected prior day date');
recordDay(diaryInput('rabt-record-001','rabt','pass'));recordDay(diaryInput('rabt-cancel-001','rabt','fail','pass'));
check((int)$pdo->query("SELECT COUNT(*) FROM plan_assignment_completions WHERE task_type='rabt' AND revoked_at IS NULL")->fetchColumn()===0,'pass to fail reverses only linked rabt completion');
$pdo->exec("UPDATE student_plan_assignments SET status='transferred' WHERE id='old'; INSERT INTO student_plan_assignments(id,student_id,plan_id,start_segment_index,status) VALUES('new','student-1','next',1,'active')");
recordDay(diaryInput('new-day-record-001','hifz','one','','new','mon','2026-10-12'));
recordDay(diaryInput('old-day-cancel-001','hifz','','one'));
check((int)$pdo->query("SELECT COUNT(*) FROM plan_assignment_completions WHERE assignment_id='new' AND revoked_at IS NULL")->fetchColumn()===1,'old day undo cannot touch new assignment');
check((int)$pdo->query("SELECT COUNT(*) FROM plan_assignment_completions WHERE assignment_id='old' AND task_type='hifz' AND revoked_at IS NOT NULL")->fetchColumn()===1,'old completion remains as revoked history');
check((int)$pdo->query("SELECT COUNT(*) FROM plan_diary_events WHERE assignment_id='old'")->fetchColumn()===4,'replaced and cancelled diary events are retained');
$pdo=diarySeed();app_state_upsert($pdo,'grades',state_envelope([]),1);
$pdo->exec("CREATE TRIGGER fail_grade BEFORE INSERT ON app_state BEGIN SELECT RAISE(ABORT,'injected grade save failure'); END");
expectFailure(fn()=>recordDay(diaryInput('grade-failure-001','hifz','one')),'injected grade save failure');
check((int)$pdo->query('SELECT COUNT(*) FROM plan_assignment_completions')->fetchColumn()===0&&(int)$pdo->query('SELECT COUNT(*) FROM plan_diary_events')->fetchColumn()===0,'grade failure rolls back completion and event');
$pdo=diarySeed();$bad=diaryInput('bad-date-0001','hifz','one');$bad['diary']['date']='2026-10-12';expectFailure(fn()=>recordDay($bad),'تاريخ اليوم');
$bad=diaryInput('bad-term-0001','hifz','one');$bad['diary']['semester_id']='old-term';expectFailure(fn()=>recordDay($bad),'تغيّر الفصل');
recordDay(diaryInput('quantity-two-001','hifz','two'));
check((int)$pdo->query('SELECT COUNT(*) FROM plan_assignment_completions WHERE revoked_at IS NULL')->fetchColumn()===2,'actual two tap quantity is used instead of default one');
echo "PASS: atomic dated diary, exact assignment reversal, retries, quantity and rollback\n";

$pdo=diarySeed();recordDay(diaryInput('comp-half-sun-001','compensationFaces',0.5,0));
check((int)$pdo->query('SELECT COUNT(*) FROM plan_assignment_completions WHERE revoked_at IS NULL')->fetchColumn()===0,'gold half compensation preserves weekly floor conversion');
recordDay(diaryInput('comp-half-mon-001','compensationFaces',0.5,0,'old','mon','2026-10-12'));
check((int)$pdo->query('SELECT COUNT(*) FROM plan_assignment_completions WHERE revoked_at IS NULL')->fetchColumn()===1,'two dated gold halves produce one compensation segment');
check($pdo->query('SELECT completed_at FROM plan_assignment_completions WHERE revoked_at IS NULL')->fetchColumn()==='2026-10-12','threshold crossing has the date of its explicit dated event');
recordDay(diaryInput('comp-undo-sun-001','compensationFaces',0,0.5));
check((int)$pdo->query('SELECT COUNT(*) FROM plan_assignment_completions WHERE revoked_at IS NULL')->fetchColumn()===0,'removing an earlier half reverses the known weekly carry without changing remaining grades');
$pdo->exec("UPDATE student_plan_assignments SET status='transferred' WHERE id='old'; INSERT INTO student_plan_assignments(id,student_id,plan_id,start_segment_index,status) VALUES('new','student-1','next',1,'active')");
recordDay(diaryInput('comp-new-tue-001','compensationFaces',1,0,'new','tue','2026-10-13'));
recordDay(diaryInput('comp-old-mon-001','compensationFaces',1,0.5,'old','mon','2026-10-12'));
check((int)$pdo->query("SELECT COUNT(*) FROM plan_assignment_completions WHERE assignment_id='new' AND revoked_at IS NULL")->fetchColumn()===1,'old compensation edit leaves the new assignment untouched');
$pdo=diarySeed();$GLOBALS['auth']=['role'=>'teacher','halaqaId'=>1,'complexId'=>1,'name'=>'isolated teacher'];
recordDay(diaryInput('legit-teacher-001','hifz','one'));check($GLOBALS['response']['entry']['hifz']==='one','current legitimate teacher access still records paired data');
$GLOBALS['auth']=['role'=>'assistant','halaqaId'=>2,'complexId'=>1,'name'=>'isolated other'];expectFailure(fn()=>recordDay(diaryInput('wrong-halaqa-001','hifz','two','one')),'حلقة');
foreach(['student','parent'] as $role){$GLOBALS['auth']=['role'=>$role,'studentId'=>'student-1','complexId'=>1];$_GET=['student_id'=>'student-1'];handle_student_plan_sheet();check(count($GLOBALS['response']['completions'])===1,"$role reads the same confirmed assignment completion");}

$pdo=diarySeed();recordDay(diaryInput('paired-delete-test','hifz','one'));
$GLOBALS['input']=['student_id'=>'student-1','assignment_id'=>'old','task_type'=>'hifz','segment_indexes'=>[1]];expectFailure(fn()=>handle_remove_plan_completions(),'مرتبط بدرجة يوم');
check((int)$pdo->query('SELECT COUNT(*) FROM plan_assignment_completions WHERE revoked_at IS NULL')->fetchColumn()===1,'legacy standalone removal cannot orphan a paired diary grade');
