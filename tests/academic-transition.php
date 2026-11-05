<?php
declare(strict_types=1);
define('QHP_FIXTURE_SUPPORT_ONLY',true);require __DIR__.'/backend-sard-regression.php';
function academicSeed():PDO {
 $pdo=seed();$rows=queue($pdo);$rows[0]['week']=3;$rows[0]['halaqaId']=7;app_state_upsert($pdo,'sard_queue',$rows,1);
 app_state_upsert($pdo,'academic_records',[['id'=>'historic','studentId'=>'historic','percent'=>0,'unknown'=>['keep'=>null]]],1);
 $GLOBALS['input']['sard_result']['academic_record']=['hifzScore'=>0,'reviewScore'=>18];return $pdo;
}
function academicRows(PDO $pdo):array{$q=$pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='academic_records'");return json_decode((string)$q->fetchColumn(),true);}
$pdo=academicSeed();$old=$pdo->query('SELECT * FROM segment_completions')->fetchAll();handle_assign_plan();$firstResponse=$GLOBALS['response'];$record=$firstResponse['academic_record'];
check($record['id']==='ar-assignment-old'&&$record['assignmentId']==='old'&&$record['planId']==='current'&&$record['planTitle']==='current plan'&&$record['levelNumber']===1001&&$record['hifzScore']===0.0&&$record['week']===3&&$record['halaqaId']===7,'server binds academic record to observed old assignment/plan and saved queue, preserving assessed zero');
check(activePlan($pdo)==='next'&&queue($pdo)[0]['status']==='passed'&&count(academicRows($pdo))===2&&academicRows($pdo)[1]['unknown']['keep']===null&&$pdo->query('SELECT * FROM segment_completions')->fetchAll()===$old,'assignment/profile/pass/academic record commit together with all historical values unchanged');
handle_assign_plan();check(json_encode($GLOBALS['response'],JSON_THROW_ON_ERROR)===json_encode($firstResponse,JSON_THROW_ON_ERROR)&&count(academicRows($pdo))===2&&(int)$pdo->query('SELECT COUNT(*) FROM student_plan_assignments')->fetchColumn()===2,'lost-response retry returns identical HTTP JSON from immutable transition receipt, with no duplicate assignment/record');
$stale=academicRows($pdo);$stale[0]['percent']=0;expectFailure(fn()=>app_state_save_untruncated_history($pdo,1,'academic_records',$stale),'سجل الاجتياز مؤكد');check(academicRows($pdo)[0]['percent']===90,'legacy whole-history client cannot overwrite confirmed transition record');
$GLOBALS['input']['sard_result']['academic_record']['hifzScore']=1;expectFailure(fn()=>handle_assign_plan(),'محتوى مختلف');check(count(academicRows($pdo))===2,'receipt cannot be reused for different results');
foreach(['academic_records','grade_plan_transition:']as$target){
 $pdo=academicSeed();$prior=academicRows($pdo);$queueBefore=queue($pdo);$condition=$target==='academic_records'?"NEW.`key`='academic_records'":"SUBSTR(NEW.`key`,1,22)='grade_plan_transition:'";
 $pdo->exec("CREATE TRIGGER fixture_academic_fail BEFORE INSERT ON app_state WHEN $condition BEGIN SELECT RAISE(ABORT,'academic fixture');END");
 try{handle_assign_plan();throw new LogicException('Expected rollback');}catch(ApiFailure $e){check($e->getCode()===409,'academic/receipt SQL failure is reported');}
 check(activePlan($pdo)==='current'&&queue($pdo)===$queueBefore&&academicRows($pdo)===$prior&&(int)$pdo->query('SELECT phase_number FROM students')->fetchColumn()===1&&(int)$pdo->query('SELECT COUNT(*) FROM student_plan_assignments')->fetchColumn()===1,'late academic/receipt failure rolls back old closure, new assignment, profile, queue and academic record');
}
$pdo=academicSeed();app_state_upsert($pdo,'academic_records',[['id'=>'ar-assignment-old','unknown'=>'historic authoritative record']],1);expectFailure(fn()=>handle_assign_plan(),'سجل سابق');check(activePlan($pdo)==='current'&&academicRows($pdo)[0]['unknown']==='historic authoritative record','conflicting historical record blocks advancement without replacing history');
echo "PASS: actual transition handler academic transaction/receipt acceptance; SQLite does not prove native row locks.\n";
