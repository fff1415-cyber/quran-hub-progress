<?php
declare(strict_types=1);
require_once __DIR__.'/atomic-plan-cases.php';
function semesterPlanCases(PDO $pdo):void {
 seedAtomicPlanCases($pdo);$pdo->exec("INSERT INTO plan_segments VALUES('plan',4),('plan',5)");
 $pdo->exec("UPDATE semesters SET is_active=CASE WHEN id=1 THEN 1 ELSE 0 END;UPDATE semesters SET start_date='2026-11-01' WHERE id=2");
 $auth=['role'=>'teacher','complexId'=>1,'halaqaId'=>1,'name'=>'fixture'];
 $packet=static function(string $operation,string $field,mixed $value,string $action,string $date)use($pdo):array{$path=['planned','1','days','sun',$field];$capture=grade_cells_capture($pdo,1,'grades',[$path]);return ['operation_id'=>$operation,'semester_scoped'=>true,'calendar_context'=>$capture['calendar_context'],'changes'=>[gradeCellChange($capture,0,$value)],'plan'=>['student_id'=>'planned','expected_assignment_id'=>'assignment','task_type'=>'hifz','action'=>$action,'tap'=>'one','completed_at'=>$date,'cell_path'=>$path]];};
 $first=$packet('semester-plan-first','hifz','one','record','2026-10-04');grade_write_request($pdo,1,$first,$auth);grade_write_request($pdo,1,$packet('semester-comp-first','compensationFaces',1,'compensation','2026-10-04'),$auth);$oldGrades=gradeCellRaw($pdo,1,'term:1:grades');$oldRows=$pdo->query('SELECT * FROM segment_completions ORDER BY segment_index')->fetchAll();
 $pdo->exec('UPDATE semesters SET is_active=CASE WHEN id=2 THEN 1 ELSE 0 END');
 grade_write_request($pdo,1,$packet('semester-plan-next','hifz','one','record','2026-11-01'),$auth);grade_write_request($pdo,1,$packet('semester-comp-next','compensationFaces',1,'compensation','2026-11-01'),$auth);
 check((int)$pdo->query('SELECT COUNT(*) FROM segment_completions')->fetchColumn()===4,'same assignment and week/day path in a new semester create independent hifz and compensation projections');
 grade_write_request($pdo,1,$packet('semester-undo-next','hifz','','undo','2026-11-01'),$auth);grade_write_request($pdo,1,$packet('semester-comp-clear','compensationFaces',0,'compensation','2026-11-01'),$auth);
 check($pdo->query('SELECT * FROM segment_completions ORDER BY segment_index')->fetchAll()===$oldRows&&gradeCellRaw($pdo,1,'term:1:grades')===$oldGrades,'new-semester undo/compensation clear cannot remove old-semester rows or grade bytes');
 check(grade_write_request($pdo,1,$first,$auth)['replayed']&&gradeCellRaw($pdo,1,'term:1:grades')===$oldGrades,'old plan receipt replays read-only after semester change');
 $legacy=$first;unset($legacy['semester_scoped']);$legacy['operation_id']='pre-cutover-plan-receipt';
 $identity=['protocol'=>1,'key'=>'grades','calendar_context'=>$legacy['calendar_context'],'changes'=>$legacy['changes'],'effect'=>$legacy['plan']];
 $legacyHash=hash('sha256',grade_cells_json($identity));
 $pdo->prepare('INSERT INTO grade_operation_receipts(context_id,store_key,operation_id,input_sha256) VALUES(?,?,?,?)')->execute([1,'grades',$legacy['operation_id'],$legacyHash]);
 $replay=grade_write_request($pdo,1,$legacy,$auth);
 check($replay['replayed']&&$replay['input_sha256']===$legacyHash&&$pdo->query('SELECT * FROM segment_completions ORDER BY segment_index')->fetchAll()===$oldRows,'pre-cutover plan receipt is acknowledged without recreating or removing any historical completion');
 $versions=$pdo->query("SELECT DISTINCT store_key FROM grade_cell_versions WHERE store_key LIKE 'term:%:grades' ORDER BY store_key")->fetchAll(PDO::FETCH_COLUMN);check($versions===['term:1:grades','term:2:grades'],'derived plan metadata is versioned in its exact semester store');
}
