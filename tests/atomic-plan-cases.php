<?php
declare(strict_types=1);
if(!function_exists('require_complex_id')){function require_complex_id(array $auth):int{return (int)$auth['complexId'];}}
if(!function_exists('error_response')){function error_response(string $message,int $status=400):never{throw new RuntimeException($message,$status);}}
if(!function_exists('assert_row_belongs_to_complex')){function assert_row_belongs_to_complex(?int $actual,int $expected):void{if($actual!==$expected)error_response('Forbidden tenant',403);}}
function atomicPlanCases(PDO $pdo):void {
    $pdo->exec("INSERT INTO students VALUES('planned',1,1);
    CREATE TABLE education_plans(id VARCHAR(36) PRIMARY KEY,complex_id INT,track VARCHAR(10),level_number INT);INSERT INTO education_plans VALUES('plan',1,'gold',1001);
    CREATE TABLE student_plan_assignments(id VARCHAR(36) PRIMARY KEY,student_id VARCHAR(50),plan_id VARCHAR(36),status VARCHAR(20),start_segment_index INT,start_muraja_segment INT,assigned_at TIMESTAMP);INSERT INTO student_plan_assignments VALUES('assignment','planned','plan','active',1,NULL,'2026-10-04 00:00:00');
    CREATE TABLE plan_segments(plan_id VARCHAR(36),segment_index INT);INSERT INTO plan_segments VALUES('plan',1),('plan',2),('plan',3);
    CREATE TABLE segment_completions(id VARCHAR(36) PRIMARY KEY,student_id VARCHAR(50),plan_id VARCHAR(36),segment_index INT,task_type VARCHAR(10),completed_at VARCHAR(10),recorded_by VARCHAR(50),assignment_id VARCHAR(36),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,CONSTRAINT uk_completion_assignment UNIQUE(student_id,plan_id,segment_index,task_type,assignment_id));");
    $auth=['role'=>'teacher','complexId'=>1,'halaqaId'=>1,'name'=>'fixture'];
    $pdo->exec("ALTER TABLE semesters ADD COLUMN start_date VARCHAR(10);ALTER TABLE semesters ADD COLUMN weeks_count INT;ALTER TABLE semesters ADD COLUMN working_days TEXT;ALTER TABLE semesters ADD COLUMN excluded_dates TEXT;UPDATE semesters SET start_date='2026-10-04',weeks_count=4,working_days='[0,1,2,3,4]',excluded_dates='[]'");
    $packet=static function(string $operation,string $day,string $task,string $value,string $action='record',string $assignment='assignment',string $student='planned')use($pdo):array{
        $capture=grade_cells_capture($pdo,1,'grades',[[$student,'1','days',$day,$task]]);
        return ['operation_id'=>$operation,'calendar_context'=>$capture['calendar_context'],'changes'=>[gradeCellChange($capture,0,$value)],'plan'=>['student_id'=>$student,'expected_assignment_id'=>$assignment,'task_type'=>$task,'action'=>$action,'tap'=>'one','completed_at'=>['sun'=>'2026-10-04','mon'=>'2026-10-05','tue'=>'2026-10-06','wed'=>'2026-10-07'][$day],'cell_path'=>[$student,'1','days',$day,$task]]];
    };
    $first=$packet('plan-first-record','sun','hifz','one');grade_write_request($pdo,1,$first,$auth);grade_write_request($pdo,1,$first,$auth);
    check((int)$pdo->query('SELECT COUNT(*) FROM segment_completions')->fetchColumn()===1,'atomic grade+plan replay creates exactly one completion');
    $row=$pdo->query('SELECT * FROM segment_completions')->fetch();$view=json_decode(gradeCellRaw($pdo,1),true);
    check($row['completed_at']==='2026-10-04'&&$row['assignment_id']==='assignment'&&$view['planned'][1]['days']['sun']['hifz']==='one'&&$view['planned'][1]['days']['sun']['hifzPlanAssignmentId']==='assignment','grade, historical date, assignment and segment metadata commit together');
    $before=gradeCellRaw($pdo,1);$stale=$packet('plan-stale-assignment','mon','hifz','one','record','old-assignment');
    gradeCellFailure(fn()=>grade_write_request($pdo,1,$stale,$auth),'تغيّر التعيين');check(gradeCellRaw($pdo,1)===$before,'assignment mismatch cannot save a grade alone');
    $review=$packet('plan-review-record','sun','rabt','pass');grade_write_request($pdo,1,$review,$auth);
    $eventKey='grade_plan_event:'.hash('sha256','plan-review-record');$q=$pdo->prepare('SELECT value FROM app_state WHERE complex_id=1 AND `key`=?');$q->execute([$eventKey]);$event=$q->fetchColumn();
    grade_write_request($pdo,1,$packet('plan-review-undo','sun','rabt','fail','undo'),$auth);
    $q->execute([$eventKey]);check($q->fetchColumn()===$event && count(json_decode($event,true)['rows'])===1&&(int)$pdo->query("SELECT COUNT(*) FROM segment_completions WHERE task_type='rabt'")->fetchColumn()===0,'undo reverses only the known projection and preserves the complete original event/rows permanently');
    $comp=static function(string $id,string $day,float $faces,string $student='planned',string $assignment='assignment')use($pdo):array{$p=[$student,'1','days',$day,'compensationFaces'];$s=grade_cells_capture($pdo,1,'grades',[$p]);return ['operation_id'=>$id,'calendar_context'=>$s['calendar_context'],'changes'=>[gradeCellChange($s,0,$faces)],'plan'=>['student_id'=>$student,'expected_assignment_id'=>$assignment,'task_type'=>'hifz','action'=>'compensation','tap'=>'one','completed_at'=>$day==='mon'?'2026-10-05':'2026-10-06','cell_path'=>$p]];};
    $firstComp=$comp('plan-compensation-first','mon',1.0);$otherDay=$comp('plan-compensation-other','tue',0.5);
    grade_write_request($pdo,1,$firstComp,$auth);grade_write_request($pdo,1,$otherDay,$auth);grade_write_request($pdo,1,$firstComp,$auth);
    $view=json_decode(gradeCellRaw($pdo,1),true);check($view['planned'][1]['compensationFaces']==1.5&&count($view['planned'][1]['compensationPlanSegments'])===1,'independent compensation days derive one current weekly total and preserve the existing gold floor rule without duplicate completions');
    grade_write_request($pdo,1,$comp('plan-compensation-reduce','mon',0.0),$auth);
    $view=json_decode(gradeCellRaw($pdo,1),true);check($view['planned'][1]['compensationFaces']==0.5&&$view['planned'][1]['compensationPlanSegments']===[]&&(int)$pdo->query('SELECT COUNT(*) FROM segment_completions')->fetchColumn()===1,'compensation reduction reverses only its known rows and keeps ordinary hifz');
    $pdo->exec("INSERT INTO segment_completions(id,student_id,plan_id,segment_index,task_type,completed_at,recorded_by,assignment_id)VALUES('historical','planned','plan',3,'hifz','2020-01-01','historic',NULL)");
    $historic=$pdo->query("SELECT * FROM segment_completions WHERE id='historical'")->fetch();
    $legacy=grade_cells_store($pdo,1,'grades',false);
    grade_cells_set($legacy,['planned','1','days','tue','hifz'],['present'=>true,'value'=>'one']);
    app_state_upsert($pdo,'grades',$legacy,1);
    $missing=$packet('plan-unknown-undo','tue','hifz','','undo');grade_write_request($pdo,1,$missing,$auth);
    check(json_decode(gradeCellRaw($pdo,1),true)['planned'][1]['days']['tue']['hifz']===''&&
        $pdo->query("SELECT * FROM segment_completions WHERE id='historical'")->fetch()===$historic,
        'legacy grade can be cleared without deleting or attributing an independent historical completion');
    $failure=$packet('plan-receipt-failure','wed','hifz','one');$before=gradeCellRaw($pdo,1);$count=(int)$pdo->query('SELECT COUNT(*) FROM segment_completions')->fetchColumn();
    if($pdo->getAttribute(PDO::ATTR_DRIVER_NAME)==='sqlite')$pdo->exec("CREATE TRIGGER fail_plan_receipt BEFORE INSERT ON grade_operation_receipts WHEN NEW.operation_id='plan-receipt-failure' BEGIN SELECT RAISE(ABORT,'plan receipt failure');END");
    else $pdo->exec("ALTER TABLE grade_operation_receipts ADD CONSTRAINT plan_receipt_failure CHECK(operation_id<>'plan-receipt-failure')");
    try{grade_write_request($pdo,1,$failure,$auth);throw new LogicException('Receipt failure was not triggered');}catch(PDOException $error){check(str_contains($error->getMessage(),'plan_receipt_failure')||str_contains($error->getMessage(),'plan receipt failure'),'specific final receipt constraint fails after plan/grade writes');}
    check(gradeCellRaw($pdo,1)===$before&&(int)$pdo->query('SELECT COUNT(*) FROM segment_completions')->fetchColumn()===$count,'receipt failure rolls back grade, completion and event projection together');
    $changed=$first;$changed['plan']['completed_at']='2026-10-06';gradeCellFailure(fn()=>grade_write_request($pdo,1,$changed,$auth),'محتوى مختلف');
    $pdo->exec("INSERT INTO students VALUES('legacy-plan',1,1);
        INSERT INTO student_plan_assignments VALUES('legacy-assignment','legacy-plan','plan','active',1,NULL,'2026-10-04 00:00:00');
        INSERT INTO segment_completions(id,student_id,plan_id,segment_index,task_type,completed_at,recorded_by,assignment_id,created_at)
        VALUES('legacy-progress','legacy-plan','plan',1,'hifz','2026-10-04','historic',NULL,'2026-10-04 12:00:00')");
    $legacyRow=$pdo->query("SELECT * FROM segment_completions WHERE id='legacy-progress'")->fetch();
    $record=$packet('plan-legacy-safe-record','mon','hifz','one','record','legacy-assignment','legacy-plan');
    $receipt=grade_write_request($pdo,1,$record,$auth);
    $replay=grade_write_request($pdo,1,$record,$auth);
    $scores=json_decode(gradeCellRaw($pdo,1),true);
    check($receipt['operation_id']==='plan-legacy-safe-record'&&$replay['replayed']===true&&
        $scores['legacy-plan'][1]['days']['mon']['hifz']==='one'&&$scores['legacy-plan'][1]['days']['mon']['hifzPlanSegments']===[2]&&
        (int)$pdo->query("SELECT COUNT(*) FROM segment_completions WHERE student_id='legacy-plan'")->fetchColumn()===2,
        'legacy progress is counted before choosing the next segment and receipt retry does not duplicate it');
    grade_write_request($pdo,1,$packet('plan-legacy-safe-undo','mon','hifz','','undo','legacy-assignment','legacy-plan'),$auth);
    check($pdo->query("SELECT * FROM segment_completions WHERE student_id='legacy-plan'")->fetchAll()===[$legacyRow]&&
        json_decode(gradeCellRaw($pdo,1),true)['legacy-plan'][1]['days']['mon']['hifz']==='',
        'reversing the new grade removes only its linked completion');
    $compensation=$comp('plan-legacy-compensation','mon',1.0,'legacy-plan','legacy-assignment');
    grade_write_request($pdo,1,$compensation,$auth);
    check(grade_write_request($pdo,1,$compensation,$auth)['replayed'] &&
        json_decode(gradeCellRaw($pdo,1),true)['legacy-plan'][1]['compensationPlanSegments']===[2] &&
        (int)$pdo->query("SELECT COUNT(*) FROM segment_completions WHERE student_id='legacy-plan'")->fetchColumn()===2,
        'compensation advances past valid legacy progress and replays without duplicating it');
    grade_write_request($pdo,1,$comp('plan-legacy-compensation-reduce','mon',0.0,'legacy-plan','legacy-assignment'),$auth);
    check($pdo->query("SELECT * FROM segment_completions WHERE student_id='legacy-plan'")->fetchAll()===[$legacyRow],
        'reducing compensation preserves the original legacy completion');

    $link=$packet('plan-link-first-segment','sun','rabt','pass','record','legacy-assignment','legacy-plan');
    grade_write_request($pdo,1,$link,$auth);
    $original=$pdo->query("SELECT * FROM segment_completions WHERE student_id='legacy-plan' ORDER BY id")->fetchAll();
    $gradeOnly=$packet('plan-link-caught-up','mon','rabt','pass','record','legacy-assignment','legacy-plan');
    $receipt=grade_write_request($pdo,1,$gradeOnly,$auth);
    $q->execute(['grade_plan_event:'.hash('sha256',$receipt['operation_id'])]);
    check(json_decode((string)$q->fetchColumn(),true)['rows']===[] &&
        json_decode(gradeCellRaw($pdo,1),true)['legacy-plan'][1]['days']['mon']['rabt']==='pass' &&
        grade_write_request($pdo,1,$gradeOnly,$auth)['replayed'] &&
        $pdo->query("SELECT * FROM segment_completions WHERE student_id='legacy-plan' ORDER BY id")->fetchAll()===$original,
        'an unfinished plan accepts a caught-up daily mark once without duplicating a completion');
    grade_write_request($pdo,1,$packet('plan-link-caught-up-undo','mon','rabt','','undo','legacy-assignment','legacy-plan'),$auth);
    check($pdo->query("SELECT * FROM segment_completions WHERE student_id='legacy-plan' ORDER BY id")->fetchAll()===$original &&
        json_decode(gradeCellRaw($pdo,1),true)['legacy-plan'][1]['days']['mon']['rabt']==='',
        'undoing a daily-only mark preserves the earlier linked completion');
    grade_write_request($pdo,1,$packet('plan-review-first-segment','sun','muraja','pass','record','legacy-assignment','legacy-plan'),$auth);
    grade_write_request($pdo,1,$packet('plan-review-caught-up','mon','muraja','pass','record','legacy-assignment','legacy-plan'),$auth);
    check((int)$pdo->query("SELECT COUNT(*) FROM segment_completions WHERE student_id='legacy-plan' AND task_type='muraja'")->fetchColumn()===1,
        'review also accepts a daily mark without inventing a completion');
    grade_write_request($pdo,1,$packet('plan-final-two-segments','mon','hifz','one','record','legacy-assignment','legacy-plan'),$auth);
    grade_write_request($pdo,1,$packet('plan-final-one-segment','tue','hifz','one','record','legacy-assignment','legacy-plan'),$auth);
    $before=gradeCellRaw($pdo,1);
    gradeCellFailure(fn()=>grade_write_request($pdo,1,$packet('plan-finished-memorization','wed','hifz','one','record','legacy-assignment','legacy-plan'),$auth),'الخطة مكتملة');
    check(gradeCellRaw($pdo,1)===$before,'completed-plan rejection changes neither the daily mark nor plan progress');
    grade_write_request($pdo,1,$packet('plan-finished-hifz-link-remains','wed','rabt','pass','record','legacy-assignment','legacy-plan'),$auth);
    check((int)$pdo->query("SELECT COUNT(*) FROM segment_completions WHERE student_id='legacy-plan' AND task_type='rabt'")->fetchColumn()===2,
        'a remaining linking segment can still be recorded after memorization is complete');
    grade_write_request($pdo,1,$packet('plan-final-rabt','tue','rabt','pass','record','legacy-assignment','legacy-plan'),$auth);
    gradeCellFailure(fn()=>grade_write_request($pdo,1,$packet('plan-finished-rabt','mon','rabt','pass','record','legacy-assignment','legacy-plan'),$auth),'الخطة مكتملة');

    $pdo->exec("INSERT INTO students VALUES('reassigned',1,1);
        INSERT INTO student_plan_assignments VALUES
        ('old-reassigned','reassigned','plan','transferred',1,NULL,'2026-08-04 00:00:00'),
        ('new-reassigned','reassigned','plan','active',1,NULL,'2026-10-04 00:00:00');
        INSERT INTO segment_completions(id,student_id,plan_id,segment_index,task_type,completed_at,recorded_by,assignment_id)
        VALUES('old-completion','reassigned','plan',1,'hifz','2026-08-04','historic','old-reassigned')");
    $historical=$pdo->query("SELECT * FROM segment_completions WHERE id='old-completion'")->fetch();
    $new=$packet('plan-reassigned-hifz','sun','hifz','one','record','new-reassigned','reassigned');
    grade_write_request($pdo,1,$new,$auth);
    check(grade_write_request($pdo,1,$new,$auth)['replayed'] &&
        (int)$pdo->query("SELECT COUNT(*) FROM segment_completions WHERE student_id='reassigned' AND segment_index=1")->fetchColumn()===2 &&
        $pdo->query("SELECT * FROM segment_completions WHERE id='old-completion'")->fetch()===$historical,
        'reassigned plan records the same segment once for its new assignment and preserves the historical row');
    grade_write_request($pdo,1,$packet('plan-reassigned-undo','sun','hifz','','undo','new-reassigned','reassigned'),$auth);
    check($pdo->query("SELECT * FROM segment_completions WHERE student_id='reassigned'")->fetchAll()===[$historical],
        'canceling the new grade preserves the previous assignment completion');
}
