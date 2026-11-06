<?php
declare(strict_types=1);
$native=getenv('AUDIT_MYSQL_DSN')!==false&&getenv('AUDIT_MYSQL_DSN')!=='';
if($native){require __DIR__.'/stage4-native.php';seedNativeProfile('STATE');$student='STATE';$assignment='old-STATE';}
else{define('QHP_FIXTURE_SUPPORT_ONLY',true);require __DIR__.'/backend-sard-regression.php';$pdo=seed();$student='student-1';$assignment='old';}
$GLOBALS['auth']=['role'=>'supervisor','accountId'=>'fixture','complexId'=>1,'name'=>'fixture'];
function stateCurrent(string $student):array{return plans_locked_current_assignment(db(),$student);}
function statePacket(string $student,string $assignment,string $desired,string $operation):array{
 $current=stateCurrent($student);return ['student_id'=>$student,'assignment_id'=>$assignment,'status'=>$desired,'expected_status'=>$current['status'],'expected_status_version'=>plans_assignment_state(db(),1,$current),'operation_id'=>$operation,'assignment_state_protocol'=>1];
}
function rejectState(array $input,string $part):void{$GLOBALS['input']=$input;try{handle_patch_assignment();throw new LogicException('State conflict absent');}catch(RuntimeException $e){check($e->getCode()===409&&str_contains($e->getMessage(),$part),'state conflict explicitly rejects '.$part);}}
$originalCompletions=$pdo->query('SELECT * FROM segment_completions ORDER BY student_id,segment_index')->fetchAll();$originalStudents=$pdo->query('SELECT * FROM students ORDER BY id')->fetchAll();
$freeze=statePacket($student,$assignment,'frozen','assignment-freeze-original');$GLOBALS['input']=$freeze;handle_patch_assignment();$freezeReceipt=$GLOBALS['response'];check(stateCurrent($student)['status']==='frozen'&&$freezeReceipt['status_version']!==$freeze['expected_status_version'],'freeze atomically changes status and version with an exact operation receipt');
$resume=statePacket($student,$assignment,'active','assignment-resume-newer');$GLOBALS['input']=$resume;handle_patch_assignment();$resumeReceipt=$GLOBALS['response'];check(stateCurrent($student)['status']==='active'&&$resumeReceipt['status_version']!==$freezeReceipt['status_version'],'resume rotates version even when the original status is restored');
$GLOBALS['input']=$freeze;handle_patch_assignment();check(json_encode($GLOBALS['response'])===json_encode($freezeReceipt)&&stateCurrent($student)['status']==='active','lost old freeze reply replays its receipt without refreezing a newer resumed plan');
$stale=$freeze;$stale['operation_id']='assignment-freeze-stale-new';rejectState($stale,'جهاز آخر');check(stateCurrent($student)['status']==='active','active-frozen-active ABA cycle cannot make an old observed version valid again');
$changed=$freeze;$changed['status']='active';rejectState($changed,'طلبًا مختلفًا');$GLOBALS['auth']['accountId']='other';rejectState($freeze,'طلبًا مختلفًا');$GLOBALS['auth']['accountId']='fixture';
$legacy=$freeze;unset($legacy['assignment_state_protocol']);rejectState($legacy,'إصدار حالة');
$fault=statePacket($student,$assignment,'frozen','assignment-late-receipt-failure');$faultKey='grade_assignment_status_receipt:'.hash('sha256',$fault['operation_id']);$before=$pdo->query('SELECT * FROM app_state ORDER BY `key`')->fetchAll();
if($native)$pdo->exec('ALTER TABLE app_state ADD CONSTRAINT state_receipt_failure CHECK(`key`<>'.$pdo->quote($faultKey).')');
else $pdo->exec('CREATE TRIGGER state_receipt_failure BEFORE INSERT ON app_state WHEN NEW.`key`='.$pdo->quote($faultKey)." BEGIN SELECT RAISE(ABORT,'fixture state receipt');END");
rejectState($fault,'مرجع:');check(stateCurrent($student)['status']==='active'&&$pdo->query('SELECT * FROM app_state ORDER BY `key`')->fetchAll()===$before,'late receipt SQL failure rolls back status timestamp/version and all internal state bytes');
check($pdo->query('SELECT * FROM segment_completions ORDER BY student_id,segment_index')->fetchAll()===$originalCompletions&&$pdo->query('SELECT * FROM students ORDER BY id')->fetchAll()===$originalStudents,'freeze/resume/replay/conflict never modifies academic profile or any historical completion');
if($native){
 function reconnectState():void{$GLOBALS['pdo']=new PDO(getenv('AUDIT_MYSQL_DSN'),'audit','audit_only',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);}
 function raceState(array $a,array $b,array $expected):void{
  $children=[];foreach([$a,$b]as$input){$pid=pcntl_fork();if($pid<0)throw new RuntimeException('fork unavailable');if($pid===0){try{reconnectState();$GLOBALS['input']=$input;handle_patch_assignment();exit(0);}catch(RuntimeException $e){exit($e->getCode()===409?2:1);}}$children[]=$pid;}
  $exits=[];foreach($children as$pid){pcntl_waitpid($pid,$status);check(pcntl_wifexited($status),'native state worker exits normally');$exits[]=pcntl_wexitstatus($status);}sort($exits);check($exits===$expected,'native independent sessions have the expected confirmed/conflict outcomes');reconnectState();
 }
 $one=statePacket($student,$assignment,'frozen','assignment-race-distinct-1');$two=$one;$two['operation_id']='assignment-race-distinct-2';raceState($one,$two,[0,2]);check(stateCurrent($student)['status']==='frozen','concurrent distinct requests on one version cannot silently override each other');
 $same=statePacket($student,$assignment,'active','assignment-race-same-recovery');raceState($same,$same,[0,0]);check(stateCurrent($student)['status']==='active','concurrent identical recovery applies one resume and confirms the same receipt');
}
echo "PASS: versioned freeze/resume, ABA conflict, actor-bound receipt/replay, late rollback and historical-data preservation\n";
