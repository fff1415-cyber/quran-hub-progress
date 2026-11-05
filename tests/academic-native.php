<?php
declare(strict_types=1);
require __DIR__.'/stage4-native.php';
function academicNativeSeed(string $student):void {
 seedNativeProfile($student);$pdo=db();$queue=json_decode((string)$pdo->query("SELECT value FROM app_state WHERE `key`='sard_queue' AND complex_id=1")->fetchColumn(),true);
 foreach($queue as&$row)if($row['studentId']===$student){$row['week']=3;$row['halaqaId']=7;}unset($row);app_state_upsert($pdo,'sard_queue',$queue,1);
 $GLOBALS['input']['sard_result']['academic_record']=['hifzScore'=>0,'reviewScore'=>18];
}
academicNativeSeed('AC');handle_assign_plan();$original=$GLOBALS['response'];handle_assign_plan();check(json_encode($GLOBALS['response'],JSON_THROW_ON_ERROR)===json_encode($original,JSON_THROW_ON_ERROR)&&$original['academic_record']['assignmentId']==='old-AC','native duplicate approval replays identical HTTP JSON, including zero scores, from confirmed academic transition');
check((int)$pdo->query("SELECT COUNT(*) FROM student_plan_assignments WHERE student_id='AC'")->fetchColumn()===2,'native receipt prevents duplicate assignment');
academicNativeSeed('ACRACE');$children=[];
for($i=0;$i<2;$i++){$pid=pcntl_fork();if($pid<0)throw new RuntimeException('fork failed');if($pid===0){try{$GLOBALS['pdo']=new PDO(getenv('AUDIT_MYSQL_DSN'),'audit','audit_only',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);handle_assign_plan();exit(0);}catch(Throwable $e){fwrite(STDERR,$e->getMessage());exit(1);}}$children[]=$pid;}
foreach($children as$pid){pcntl_waitpid($pid,$status);check(pcntl_wifexited($status)&&pcntl_wexitstatus($status)===0,'native independent transition session gets confirmed result');}
$GLOBALS['pdo']=$pdo=new PDO(getenv('AUDIT_MYSQL_DSN'),'audit','audit_only',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
check((int)$pdo->query("SELECT COUNT(*) FROM student_plan_assignments WHERE student_id='ACRACE'")->fetchColumn()===2&&substr_count((string)$pdo->query("SELECT value FROM app_state WHERE `key`='academic_records'")->fetchColumn(),'ar-assignment-old-ACRACE')===1,'native simultaneous approvals produce one next assignment and one academic record');
academicNativeSeed('ACFAIL');$before=$pdo->query("SELECT value FROM app_state WHERE `key`='academic_records' AND complex_id=1")->fetchColumn();$queueBefore=$pdo->query("SELECT value FROM app_state WHERE `key`='sard_queue' AND complex_id=1")->fetchColumn();
$pdo->exec("ALTER TABLE app_state ADD CONSTRAINT academic_write_failure CHECK(`key`<>'academic_records' OR LOCATE('ar-assignment-old-ACFAIL',value)=0)");
try{handle_assign_plan();throw new LogicException('Expected academic failure');}catch(RuntimeException $e){check($e->getCode()===409,'native academic CHECK failure reported');}
check($pdo->query("SELECT value FROM app_state WHERE `key`='academic_records' AND complex_id=1")->fetchColumn()===$before&&$pdo->query("SELECT value FROM app_state WHERE `key`='sard_queue' AND complex_id=1")->fetchColumn()===$queueBefore&&$pdo->query("SELECT plan_id FROM student_plan_assignments WHERE student_id='ACFAIL' AND status='active'")->fetchColumn()==='current'&&(int)$pdo->query("SELECT phase_number FROM students WHERE id='ACFAIL'")->fetchColumn()===1,'native academic failure atomically rolls back assignment/profile/queue/history');
