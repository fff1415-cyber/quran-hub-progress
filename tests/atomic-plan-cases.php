<?php
declare(strict_types=1);
if(!function_exists('require_complex_id')){function require_complex_id(array $auth):int{return (int)$auth['complexId'];}}
if(!function_exists('error_response')){function error_response(string $message,int $status=400):never{throw new RuntimeException($message,$status);}}
if(!function_exists('assert_row_belongs_to_complex')){function assert_row_belongs_to_complex(?int $actual,int $expected):void{if($actual!==$expected)error_response('Forbidden tenant',403);}}
function atomicPlanCases(PDO $pdo):void {
    $pdo->exec("CREATE TABLE students(id VARCHAR(50) PRIMARY KEY,complex_id INT,halaqa_id INT);INSERT INTO students VALUES('planned',1,1);
    CREATE TABLE education_plans(id VARCHAR(36) PRIMARY KEY,complex_id INT,track VARCHAR(10),level_number INT);INSERT INTO education_plans VALUES('plan',1,'gold',1001);
    CREATE TABLE student_plan_assignments(id VARCHAR(36) PRIMARY KEY,student_id VARCHAR(50),plan_id VARCHAR(36),status VARCHAR(20),start_segment_index INT,start_muraja_segment INT);INSERT INTO student_plan_assignments VALUES('assignment','planned','plan','active',1,NULL);
    CREATE TABLE plan_segments(plan_id VARCHAR(36),segment_index INT);INSERT INTO plan_segments VALUES('plan',1),('plan',2),('plan',3);
    CREATE TABLE segment_completions(id VARCHAR(36) PRIMARY KEY,student_id VARCHAR(50),plan_id VARCHAR(36),segment_index INT,task_type VARCHAR(10),completed_at VARCHAR(10),recorded_by VARCHAR(50),assignment_id VARCHAR(36),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,UNIQUE(student_id,plan_id,segment_index,task_type));");
    $auth=['role'=>'teacher','complexId'=>1,'halaqaId'=>1,'name'=>'fixture'];
    $packet=static function(string $operation,string $day,string $task,string $value,string $action='record',string $assignment='assignment')use($pdo):array{
        $capture=grade_cells_capture($pdo,1,'grades',[['planned','1','days',$day,$task]]);
        return ['operation_id'=>$operation,'calendar_context'=>$capture['calendar_context'],'changes'=>[gradeCellChange($capture,0,$value)],'plan'=>['student_id'=>'planned','expected_assignment_id'=>$assignment,'task_type'=>$task,'action'=>$action,'tap'=>'one','completed_at'=>'2026-10-05','cell_path'=>['planned','1','days',$day,$task]]];
    };
    $first=$packet('plan-first-record','sun','hifz','one');grade_write_request($pdo,1,$first,$auth);grade_write_request($pdo,1,$first,$auth);
    check((int)$pdo->query('SELECT COUNT(*) FROM segment_completions')->fetchColumn()===1,'atomic grade+plan replay creates exactly one completion');
    $row=$pdo->query('SELECT * FROM segment_completions')->fetch();$view=json_decode(gradeCellRaw($pdo,1),true);
    check($row['completed_at']==='2026-10-05'&&$row['assignment_id']==='assignment'&&$view['planned'][1]['days']['sun']['hifz']==='one'&&$view['planned'][1]['days']['sun']['hifzPlanAssignmentId']==='assignment','grade, historical date, assignment and segment metadata commit together');
    $before=gradeCellRaw($pdo,1);$stale=$packet('plan-stale-assignment','mon','hifz','one','record','old-assignment');
    gradeCellFailure(fn()=>grade_write_request($pdo,1,$stale,$auth),'تغيّر التعيين');check(gradeCellRaw($pdo,1)===$before,'assignment mismatch cannot save a grade alone');
    $review=$packet('plan-review-record','sun','rabt','pass');grade_write_request($pdo,1,$review,$auth);
    $eventKey='grade_plan_event:'.hash('sha256','plan-review-record');$q=$pdo->prepare('SELECT value FROM app_state WHERE complex_id=1 AND `key`=?');$q->execute([$eventKey]);$event=$q->fetchColumn();
    grade_write_request($pdo,1,$packet('plan-review-undo','sun','rabt','fail','undo'),$auth);
    $q->execute([$eventKey]);check($q->fetchColumn()===$event && count(json_decode($event,true)['rows'])===1&&(int)$pdo->query("SELECT COUNT(*) FROM segment_completions WHERE task_type='rabt'")->fetchColumn()===0,'undo reverses only the known projection and preserves the complete original event/rows permanently');
    $pdo->exec("INSERT INTO segment_completions(id,student_id,plan_id,segment_index,task_type,completed_at,recorded_by,assignment_id)VALUES('historical','planned','plan',3,'hifz','2020-01-01','historic',NULL)");
    $historic=$pdo->query("SELECT * FROM segment_completions WHERE id='historical'")->fetch();
    $missing=$packet('plan-unknown-undo','tue','hifz','','undo');$before=gradeCellRaw($pdo,1);gradeCellFailure(fn()=>grade_write_request($pdo,1,$missing,$auth),'لا يوجد رابط إنجاز مؤكد');
    check(gradeCellRaw($pdo,1)===$before&&$pdo->query("SELECT * FROM segment_completions WHERE id='historical'")->fetch()===$historic,'unknown legacy undo is blocked without deleting or attributing historical rows');
    $failure=$packet('plan-receipt-failure','wed','hifz','one');$before=gradeCellRaw($pdo,1);$count=(int)$pdo->query('SELECT COUNT(*) FROM segment_completions')->fetchColumn();
    if($pdo->getAttribute(PDO::ATTR_DRIVER_NAME)==='sqlite')$pdo->exec("CREATE TRIGGER fail_plan_receipt BEFORE INSERT ON grade_operation_receipts WHEN NEW.operation_id='plan-receipt-failure' BEGIN SELECT RAISE(ABORT,'plan receipt failure');END");
    else $pdo->exec("ALTER TABLE grade_operation_receipts ADD CONSTRAINT plan_receipt_failure CHECK(operation_id<>'plan-receipt-failure')");
    gradeCellFailure(fn()=>grade_write_request($pdo,1,$failure,$auth),'plan');
    check(gradeCellRaw($pdo,1)===$before&&(int)$pdo->query('SELECT COUNT(*) FROM segment_completions')->fetchColumn()===$count,'receipt failure rolls back grade, completion and event projection together');
    $changed=$first;$changed['plan']['completed_at']='2026-10-06';gradeCellFailure(fn()=>grade_write_request($pdo,1,$changed,$auth),'محتوى مختلف');
}
