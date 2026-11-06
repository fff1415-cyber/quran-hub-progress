<?php
declare(strict_types=1);
define('QHP_FIXTURE_SUPPORT_ONLY',true);require __DIR__.'/backend-sard-regression.php';
function assessmentSeed():array{
 $pdo=seed();$rows=queue($pdo);$rows[0]+=['week'=>3,'halaqaId'=>7,'phase'=>'full'];app_state_upsert($pdo,'sard_queue',$rows,1);
 $old=[];for($i=0;$i<651;$i++)$old[]=['id'=>'old-'.$i,'percent'=>0,'unknown'=>null];app_state_upsert($pdo,'sard_history',$old,1);
 return ['sard_assessment_protocol'=>1,'operation_id'=>'fixture-assessment-operation','changes'=>[['base'=>$rows[0],'item'=>array_replace($rows[0],['status'=>'awaiting_supervisor'])]],'history_record'=>['hifzErrors'=>4,'hifzWarnings'=>0,'reviewErrors'=>[0,2],'reviewWarnings'=>[0,0],'percent'=>0,'evaluationRules'=>['zero'=>0,'unknown'=>null],'custom'=>['retained'=>null]]];
}
$auth=['role'=>'musammi','accountId'=>'fixture'];$packet=assessmentSeed();$pdo=db();$completions=$pdo->query('SELECT * FROM segment_completions')->fetchAll();$first=app_state_patch_sard($pdo,1,$packet,$auth);
check(queue($pdo)[0]['status']==='awaiting_supervisor'&&$first['history_record']['hifzErrors']===4&&$first['history_record']['hifzWarnings']===0&&$first['history_record']['assignmentId']==='old'&&$first['history_record']['assessmentConfirmed']===true,'failed assessment queue and raw details commit together with server-bound identity');
$rows=json_decode((string)$pdo->query("SELECT value FROM app_state WHERE `key`='sard_history'")->fetchColumn(),true);check(count($rows)===652&&$rows[651]['unknown']===null&&$rows[0]['custom']['retained']===null&&$completions===$pdo->query('SELECT * FROM segment_completions')->fetchAll(),'all historical rows, unknown values and plan completions remain intact');
check(app_state_patch_sard($pdo,1,$packet,$auth)===$first,'lost-response replay returns immutable receipt without duplicating history');
$newer=queue($pdo)[0];$approved=array_replace($newer,['status'=>'approved_third','attempt'=>3]);app_state_patch_sard($pdo,1,['changes'=>[['base'=>$newer,'item'=>$approved]]]);check(app_state_patch_sard($pdo,1,$packet,$auth)===$first&&queue($pdo)[0]['status']==='approved_third','old receipt replay does not regress a newer supervisor decision');
$changed=$packet;$changed['history_record']['hifzErrors']=5;expectFailure(fn()=>app_state_patch_sard($pdo,1,$changed,$auth),'طلبًا مختلفًا');expectFailure(fn()=>app_state_patch_sard($pdo,1,$packet,['role'=>'musammi','accountId'=>'other']),'طلبًا مختلفًا');
$rows[0]['hifzErrors']=9;expectFailure(fn()=>app_state_save_untruncated_history($pdo,1,'sard_history',$rows),'سجل الاجتياز مؤكد');
foreach(['sard_history','sard_queue','grade_sard_receipt:']as$target){
 $packet=assessmentSeed();$pdo=db();$before=$pdo->query('SELECT * FROM app_state ORDER BY `key`')->fetchAll();$where=$target==='grade_sard_receipt:'?"SUBSTR(NEW.`key`,1,19)='grade_sard_receipt:'":"NEW.`key`=".$pdo->quote($target);
 $pdo->exec("CREATE TRIGGER fail_assessment BEFORE INSERT ON app_state WHEN $where BEGIN SELECT RAISE(ABORT,'fixture atomic assessment');END");
 try{app_state_patch_sard($pdo,1,$packet,$auth);throw new LogicException('Failure absent');}catch(ApiFailure $e){check($e->getCode()===409,'injected assessment SQL failure is explicit');}
 check($pdo->query('SELECT * FROM app_state ORDER BY `key`')->fetchAll()===$before,'late history/queue/receipt failure rolls back the entire assessment and preserves prior bytes');
}
$packet=assessmentSeed();$pdo=db();$packet['changes'][0]['item']['status']='passed';expectFailure(fn()=>app_state_patch_sard($pdo,1,$packet,$auth),'لا تطابق');
$packet=assessmentSeed();$pdo=db();$rows=queue($pdo);unset($rows[0]['assignmentId']);app_state_upsert($pdo,'sard_queue',$rows,1);$packet['changes'][0]['base']=$rows[0];$packet['changes'][0]['item']=$rows[0]+['unused'=>true];try{app_state_patch_sard($pdo,1,$packet,$auth);throw new LogicException('Unlinked history accepted');}catch(ApiFailure $e){check($e->getCode()===409&&count(json_decode((string)$pdo->query("SELECT value FROM app_state WHERE `key`='sard_history'")->fetchColumn(),true))===651,'unlinked legacy queue cannot gain an attributed assessment by guessing');}
$packet=assessmentSeed();$pdo=db();$rows=queue($pdo);$rows[0]['scheduledAt']='2099-01-01';app_state_upsert($pdo,'sard_queue',$rows,1);$packet['changes'][0]['base']=$rows[0];$packet['changes'][0]['item']=array_replace($rows[0],['status'=>'final_failed']);expectFailure(fn()=>app_state_patch_sard($pdo,1,$packet,$auth),'لم يحل موعده');
echo "PASS: failed/deferred assessment transaction, immutable receipt, replay, rollback, retention and server readiness\n";
