<?php
declare(strict_types=1);
require __DIR__.'/stage4-native.php';
function seedFullNative(string $student):void {
 seedNativeProfile($student);$pdo=db();$q=$pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='sard_queue'");$rows=json_decode((string)$q->fetchColumn(),true);
 foreach($rows as&$row)if($row['studentId']===$student){$row['halaqaId']=7;$row['week']=3;$row['phase']='full';}unset($row);app_state_upsert($pdo,'sard_queue',$rows,1);
 $GLOBALS['input']['sard_result']+=['write_protocol'=>2,'academic_record'=>['hifzScore'=>0,'reviewScore'=>18],'history_record'=>['hifzErrors'=>0,'hifzWarnings'=>0,'reviewErrors'=>[0,2],'reviewWarnings'=>[0,0],'evaluationRules'=>['reference'=>'frozen-native','settings'=>['zero'=>0,'unknown'=>null]]]];
}
function fullNativeState(string $student):array {
 $pdo=db();$q=$pdo->prepare('SELECT * FROM student_plan_assignments WHERE student_id=? ORDER BY id');$q->execute([$student]);$assignments=$q->fetchAll();
 $q=$pdo->prepare('SELECT * FROM students WHERE id=?');$q->execute([$student]);$profile=$q->fetch();
 return [$assignments,$profile,$pdo->query("SELECT `key`,value FROM app_state WHERE complex_id=1 ORDER BY `key`")->fetchAll()];
}
$legacy=[];for($i=0;$i<651;$i++)$legacy[]=['id'=>'native-legacy-'.$i,'percent'=>0,'unknown'=>null];app_state_upsert($pdo,'sard_history',$legacy,1);
seedFullNative('DETAIL');handle_assign_plan();$firstResult=$GLOBALS['response'];handle_assign_plan();
check(json_encode($firstResult)===json_encode($GLOBALS['response'])&&$firstResult['sard_history_record']['assignmentId']==='old-DETAIL'&&$firstResult['sard_history_record']['evaluationRules']['settings']['zero']===0,'native detailed assessment and frozen rules replay exactly once');
$rows=json_decode((string)$pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='sard_history'")->fetchColumn(),true);check(count($rows)===652&&$rows[651]['unknown']===null,'native atomic append retains all 651 historical rows');
seedFullNative('RACE');$children=[];
for($i=0;$i<2;$i++){$pid=pcntl_fork();if($pid<0)throw new RuntimeException('fork unavailable');if($pid===0){try{$GLOBALS['pdo']=new PDO(getenv('AUDIT_MYSQL_DSN'),'audit','audit_only',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);handle_assign_plan();exit(0);}catch(Throwable $e){fwrite(STDERR,$e->getMessage());exit(1);}}$children[]=$pid;}
foreach($children as$pid){pcntl_waitpid($pid,$status);check(pcntl_wifexited($status)&&pcntl_wexitstatus($status)===0,'native independent recovery session confirms the same transition');}
$GLOBALS['pdo']=$pdo=new PDO(getenv('AUDIT_MYSQL_DSN'),'audit','audit_only',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
$rows=json_decode((string)$pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='sard_history'")->fetchColumn(),true);check(count(array_filter($rows,fn($r)=>($r['assignmentId']??'')==='old-RACE'))===1&&(int)$pdo->query("SELECT COUNT(*) FROM student_plan_assignments WHERE student_id='RACE'")->fetchColumn()===2,'native simultaneous recovery produces one assignment, one academic record and one detailed history');
seedFullNative('HFAIL');$before=fullNativeState('HFAIL');$pdo->exec("ALTER TABLE app_state ADD CONSTRAINT detailed_history_failure CHECK(`key`<>'sard_history' OR LOCATE('sh-queue-HFAIL-1-full',value)=0)");
try{handle_assign_plan();throw new LogicException('Expected detailed history failure');}catch(RuntimeException $e){check($e->getCode()===409,'native detailed-history CHECK fails explicitly');}check(fullNativeState('HFAIL')===$before,'native history failure rolls back closure, assignment, profile, queue, academic and detailed history');
seedFullNative('RCFAIL');$before=fullNativeState('RCFAIL');$rejectedReceipt=plans_transition_receipt_key($GLOBALS['input']);$pdo->exec("ALTER TABLE app_state ADD CONSTRAINT complete_receipt_failure CHECK(`key`<>".$pdo->quote($rejectedReceipt).")");
try{handle_assign_plan();throw new LogicException('Expected final receipt failure');}catch(RuntimeException $e){check($e->getCode()===409,'native final complete-receipt CHECK fails explicitly');}check(fullNativeState('RCFAIL')===$before,'native final receipt failure rolls back every linked record and preserves all prior bytes');
seedFullNative('FINAL');$pdo->exec("INSERT INTO education_plans(id,complex_id,title,track,level_number)VALUES('final',1,'fixture-final','gold',5030);INSERT INTO plan_segments VALUES('final',1),('final',2);UPDATE student_plan_assignments SET plan_id='final' WHERE student_id='FINAL';UPDATE segment_completions SET plan_id='final' WHERE student_id='FINAL';UPDATE students SET phase_number=30,level='30',institute_level='الخريجين' WHERE id='FINAL'");$GLOBALS['input']['plan_id']='final';$GLOBALS['input']['finalize_only']=true;
$q=$pdo->query("SELECT * FROM student_plan_assignments WHERE student_id='FINAL'");$finalBefore=$q->fetchAll();handle_assign_plan();$finalResult=$GLOBALS['response'];handle_assign_plan();
check(json_encode($GLOBALS['response'])===json_encode($finalResult)&&$finalResult['assignment_id']==='old-FINAL'&&$finalResult['academic_record']['finalPlanCompleted']===true&&$pdo->query("SELECT * FROM student_plan_assignments WHERE student_id='FINAL'")->fetchAll()===$finalBefore,'native final-plan pass/replay preserves the visible active assignment and creates no artificial successor');
