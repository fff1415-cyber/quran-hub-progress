<?php
declare(strict_types=1);
require __DIR__.'/stage4-native.php';
function seedNativeAssessment(string $student):array{
 seedNativeProfile($student);$pdo=db();$rows=json_decode((string)$pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='sard_queue'")->fetchColumn(),true);
 foreach($rows as&$row)if($row['studentId']===$student){$row['phase']='full';$row['halaqaId']=7;$row['week']=3;$base=$row;}unset($row);app_state_upsert($pdo,'sard_queue',$rows,1);
 return ['sard_assessment_protocol'=>1,'operation_id'=>'native-assessment-'.$student,'changes'=>[['base'=>$base,'item'=>array_replace($base,['status'=>'awaiting_supervisor'])]],'history_record'=>['hifzErrors'=>4,'hifzWarnings'=>0,'reviewErrors'=>[0,2],'reviewWarnings'=>[0,0],'percent'=>0,'evaluationRules'=>['reference'=>'native-frozen','zero'=>0,'unknown'=>null]]];
}
function nativeAssessmentState():array{return db()->query('SELECT * FROM app_state WHERE complex_id=1 ORDER BY `key`')->fetchAll();}
$auth=['role'=>'musammi','accountId'=>'fixture'];$old=[];for($i=0;$i<651;$i++)$old[]=['id'=>'legacy-'.$i,'percent'=>0,'unknown'=>null];app_state_upsert($pdo,'sard_history',$old,1);
$packet=seedNativeAssessment('NATIVE');$first=app_state_patch_sard($pdo,1,$packet,$auth);$before=nativeAssessmentState();check(json_encode(app_state_patch_sard($pdo,1,$packet,$auth))===json_encode($first)&&nativeAssessmentState()===$before,'native failed assessment replays original date/rules/counters without any duplicate write');
$rows=json_decode((string)$pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='sard_history'")->fetchColumn(),true);check(count($rows)===652&&$rows[651]['unknown']===null,'native assessment preserves all historical rows and null values');
$packet=seedNativeAssessment('RACE');$children=[];
for($i=0;$i<2;$i++){$pid=pcntl_fork();if($pid<0)throw new RuntimeException('fork unavailable');if($pid===0){try{$GLOBALS['pdo']=new PDO(getenv('AUDIT_MYSQL_DSN'),'audit','audit_only',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);app_state_patch_sard(db(),1,$packet,$auth);exit(0);}catch(Throwable $e){fwrite(STDERR,$e->getMessage());exit(1);}}$children[]=$pid;}
foreach($children as$pid){pcntl_waitpid($pid,$status);check(pcntl_wifexited($status)&&pcntl_wexitstatus($status)===0,'native independent simultaneous assessment session confirms the same receipt');}
$GLOBALS['pdo']=$pdo=new PDO(getenv('AUDIT_MYSQL_DSN'),'audit','audit_only',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);$rows=json_decode((string)$pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='sard_history'")->fetchColumn(),true);check(count(array_filter($rows,fn($r)=>($r['assignmentId']??null)==='old-RACE'))===1,'native simultaneous retries append precisely one assessment');
foreach(['HISTORY','QUEUE','RECEIPT']as$target){
 $packet=seedNativeAssessment($target);$before=nativeAssessmentState();$operation='native-assessment-'.$target;$receiptKey=sard_assessment_packet($packet,$auth)['key'];
 $condition=match($target){'HISTORY'=>"`key`<>'sard_history' OR LOCATE(".$pdo->quote('sh-op-'.$operation).",value)=0",'QUEUE'=>"`key`<>'sard_queue' OR LOCATE(".$pdo->quote('queue-'.$target).",value)=0 OR LOCATE('awaiting_supervisor',value)=0",'RECEIPT'=>"`key`<>".$pdo->quote($receiptKey)};
 // Queue already contains other waiting rows; target this student's serialized outcome only.
 if($target==='QUEUE')$condition="`key`<>'sard_queue' OR LOCATE(".$pdo->quote('"id":"queue-QUEUE","studentId":"QUEUE","assignmentId":"old-QUEUE","status":"awaiting_supervisor"').",value)=0";
 $pdo->exec('ALTER TABLE app_state ADD CONSTRAINT fail_assessment_'.$target.' CHECK('.$condition.')');
 try{app_state_patch_sard($pdo,1,$packet,$auth);throw new LogicException('Expected native assessment failure');}catch(RuntimeException $e){check($e->getCode()===409,'native '.$target.' failure is explicitly reported');}
 check(nativeAssessmentState()===$before,'native '.$target.' failure rolls back queue, details and receipt and retains prior bytes');
}
