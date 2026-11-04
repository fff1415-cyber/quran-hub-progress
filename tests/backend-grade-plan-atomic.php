<?php
declare(strict_types=1);
require __DIR__.'/backend-completion-events.php';
require getenv('AUDIT_GRADE_PLAN_SOURCE') ?: __DIR__.'/../api/lib/grade-plan-operations.php';require __DIR__.'/grade-plan-cases.php';
function gradePlanSeed():PDO {
    $pdo=completionSeed();
    $pdo->exec('CREATE TABLE semesters(id INTEGER PRIMARY KEY,complex_id INTEGER,is_active INTEGER); INSERT INTO semesters VALUES(1,1,1),(2,1,0);
      CREATE TABLE academic_weeks(id TEXT PRIMARY KEY,semester_id INTEGER,week_number INTEGER,start_date TEXT,end_date TEXT);
      INSERT INTO academic_weeks VALUES("gp-week-1",1,1,"2026-11-01","2026-11-07"),("gp-week-2",1,2,"2026-11-08","2026-11-14");
      CREATE TABLE grade_cell_versions(context_id INTEGER NOT NULL,store_key TEXT NOT NULL,path_sha256 TEXT NOT NULL,path_json TEXT NOT NULL,direct_version TEXT,subtree_version TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(context_id,store_key,path_sha256));
      CREATE TABLE grade_operation_receipts(context_id INTEGER NOT NULL,store_key TEXT NOT NULL,operation_id TEXT NOT NULL,input_sha256 TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(context_id,store_key,operation_id))');
    app_state_upsert($pdo,'grades',(object)['legacy-visible'=>(object)['old_zero'=>0,'unknown'=>null]],1);return $pdo;
}
$pdo=gradePlanSeed();gradePlanCases($pdo,'student-1','current','old','gp-sqlite');
$pdo=gradePlanSeed();$pdo->exec("UPDATE education_plans SET track='silver',segment_count=4 WHERE id='current'; INSERT INTO plan_segments(plan_id,segment_index,id,hifz_plan,rabt_plan,muraja_plan) VALUES('current',3,'gp-sqlite-seg3','h','r','m'),('current',4,'gp-sqlite-seg4','h','r','m')");gradePlanSilverCases($pdo,'student-1','current','old','gp-sqlite-silver');
$pdo=gradePlanSeed();$current=gradePlanAssignment($pdo,'student-1','current','old','gp-fail-assign');$request=gradePlanRequest($pdo,'student-1','one');$before=gradeCellRaw($pdo,1);$raw=completionRaw($pdo,'student-1');
$pdo->exec("CREATE TRIGGER fixture_compound_grade BEFORE INSERT ON grade_operation_receipts WHEN NEW.operation_id='gp-grade-failure' BEGIN SELECT RAISE(ABORT,'fixture compound grade failure'); END");
gradeCellFailure(fn()=>grade_plan_apply($pdo,1,'student-1',$current['id'],'current','gp-grade-failure',$request,'fixture'),'fixture compound grade failure');
check(gradeCellRaw($pdo,1)===$before&&completionRaw($pdo,'student-1')===$raw&&plan_events_history($pdo,1,$current)===[]&&(int)$pdo->query('SELECT COUNT(*) FROM grade_cell_versions')->fetchColumn()===0&&(int)$pdo->query("SELECT COUNT(*) FROM plan_operation_receipts WHERE operation_id='gp-grade-failure'")->fetchColumn()===0,'grade receipt failure rolls back grade, binding, versions, event/head and every compound receipt together');
$pdo->exec("CREATE TRIGGER fixture_compound_root BEFORE UPDATE ON plan_operation_receipts WHEN NEW.operation_id='gp-root-failure' BEGIN SELECT RAISE(ABORT,'fixture compound root failure'); END");
gradeCellFailure(fn()=>grade_plan_apply($pdo,1,'student-1',$current['id'],'current','gp-root-failure',$request,'fixture'),'fixture compound root failure');
check(gradeCellRaw($pdo,1)===$before&&plan_events_history($pdo,1,$current)===[]&&(int)$pdo->query("SELECT COUNT(*) FROM grade_operation_receipts WHERE operation_id='gp-root-failure'")->fetchColumn()===0,'final root receipt failure cannot commit a grade or a plan event alone');
$GLOBALS['input']=['student_id'=>'student-1','assignment_id'=>$current['id'],'status'=>'frozen'];handle_patch_assignment();
gradeCellFailure(fn()=>grade_plan_apply($pdo,1,'student-1',$current['id'],'current','gp-frozen-request',$request,'fixture'),'تغيّر التعيين الحالي');
check(gradeCellRaw($pdo,1)===$before&&plan_events_history($pdo,1,$current)===[],'frozen assignment rejects the whole linked grade without resetting any prior record');
echo "PASS: isolated dated hifz grade/event coordinator; public routes, browser transport, non-hifz/compensation and production activation remain pending\n";
