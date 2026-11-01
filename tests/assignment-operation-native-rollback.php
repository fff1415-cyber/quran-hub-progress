<?php
declare(strict_types=1);
const ROLLBACK_DSN='mysql:host=127.0.0.1;port=3307;dbname=audit_test;charset=utf8mb4';
if (getenv('AUDIT_MYSQL_DSN')!==ROLLBACK_DSN || !isset($argv[1],$argv[2]) || !in_array($argv[2],['write','read'],true)) throw new RuntimeException('Isolated rollback fixture required');
$GLOBALS['pdo']=$pdo=new PDO(ROLLBACK_DSN,'audit','audit_only',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
function db():PDO{return $GLOBALS['pdo'];}
function table_column_exists(PDO $pdo,string $table,string $column):bool{$st=$pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?');$st->execute([$table,$column]);return (bool)$st->fetchColumn();}
function require_auth():array{return $GLOBALS['auth'];}
function require_complex_id(array $auth):int{return $auth['complexId'];}
function json_input():array{return $GLOBALS['input'];}
function json_response(mixed $value):void{$GLOBALS['response']=$value;}
function error_response(string $message,int $status=400):never{throw new RuntimeException($message,$status);}
function assert_row_belongs_to_complex(?int $row,int $complex):void{if($row!==$complex)error_response('Forbidden',403);}
function new_uuid():string{return bin2hex(random_bytes(16));}
function check(bool $ok,string $label):void{if(!$ok)throw new RuntimeException($label);echo "PASS: $label\n";}
require __DIR__.'/../api/routes/app_state.php';require $argv[1];require __DIR__.'/assignment-operation-cases.php';
$GLOBALS['auth']=['role'=>'supervisor','complexId'=>1,'name'=>'fixture'];
$first=json_decode($pdo->query("SELECT response_json FROM plan_operation_receipts WHERE context_id=1 AND operation_id='fixture-race-operation'")->fetchColumn(),true)['assignment_id'];
if($argv[2]==='write'){
 $GLOBALS['input']=['student_id'=>'receipt-race-S','plan_id'=>'Q','expected_assignment_id'=>'receipt-race-A','start_segment_index'=>1,'operation_id'=>'fixture-race-operation'];$before=assignmentOperationSnapshot($pdo,'receipt-race-S');
 handle_assign_plan();check($GLOBALS['response']['assignment_id']===$first&&assignmentOperationSnapshot($pdo,'receipt-race-S')===$before,'independent rollback writer replays a candidate receipt without changing current data');
}
$GLOBALS['input']=['student_id'=>'receipt-race-S','plan_id'=>'Q','expected_assignment_id'=>$first,'start_segment_index'=>1,'operation_id'=>'fixture-fallback-new'];
if($argv[2]==='read')$GLOBALS['input']['operation_probe']=true;
handle_assign_plan();$result=$GLOBALS['response'];$before=assignmentOperationSnapshot($pdo,'receipt-race-S');
check($result['operation_applied']===true&&$result['assignment_id']!==$first,'compatible writer receipt is readable by the selected API');
handle_assign_plan();check($GLOBALS['response']['assignment_id']===$result['assignment_id']&&assignmentOperationSnapshot($pdo,'receipt-race-S')===$before,'cross-version retry cannot create a second assignment or discard newer data');

if (plans_table_exists($pdo,'plan_completion_events')) {
 $case=$pdo->query("SELECT a.*,p.track,p.level_number,p.title FROM student_plan_assignments a JOIN education_plans p ON p.id=a.plan_id WHERE a.student_id='ce-race-S' AND a.status='active'")->fetch();
 if ($case) {
  $read=plan_events_read($pdo,1,$case);check(count($read)===1&&$read[0]['source']['kind']==='event','compatible API retains the assignment-event data reader and its real current source');
  $_GET=['student_id'=>$case['student_id']];handle_student_plan_sheet();
  $hifz=array_values(array_filter($GLOBALS['response']['completions'],static fn($row)=>$row['task_type']==='hifz'));
  check(count($hifz)===1&&(int)$hifz[0]['segment_index']===1&&($hifz[0]['source']['kind']??null)==='event','candidate and compatible public sheet both display the new event instead of the old second-segment slot');
 }
}
