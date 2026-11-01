<?php
declare(strict_types=1);
const INDEPENDENT_DSN='mysql:host=127.0.0.1;port=3307;dbname=audit_test;charset=utf8mb4';
function connectFixture():PDO {
 if(getenv('AUDIT_MYSQL_DSN')!==INDEPENDENT_DSN)throw new RuntimeException('Isolated fixture DSN required');
 return new PDO(INDEPENDENT_DSN,'audit','audit_only',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
}
function db():PDO{return $GLOBALS['pdo'];}
function table_column_exists(PDO $pdo,string $table,string $column):bool {$s=$pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?');$s->execute([$table,$column]);return (bool)$s->fetchColumn();}
function require_auth():array{return $GLOBALS['auth'];}
function require_complex_id(array $auth):int{return $auth['complexId'];}
function json_input():array{return $GLOBALS['input'];}
function json_response(mixed $value):void{$GLOBALS['response']=$value;}
function error_response(string $message,int $status=400):never{throw new RuntimeException($message,$status);}
function assert_row_belongs_to_complex(?int $row,int $complex):void{if($row!==$complex)error_response('Forbidden',403);}
function new_uuid():string{return bin2hex(random_bytes(16));}
function check(bool $ok,string $label):void{if(!$ok)throw new RuntimeException($label);echo "PASS: $label\n";}
require __DIR__.'/../api/routes/app_state.php';
require __DIR__.'/../api/routes/plans.php';
require __DIR__.'/../api/routes/evaluation_settings.php';
$GLOBALS['pdo']=$pdo=connectFixture();$GLOBALS['auth']=['role'=>'supervisor','complexId'=>1,'name'=>'fixture'];
$pdo->exec(file_get_contents(__DIR__.'/../database/migrate-education-plans.sql'));
$pdo->exec("ALTER TABLE education_plans ADD COLUMN complex_id INT DEFAULT 1;
 CREATE TABLE students(id VARCHAR(50) PRIMARY KEY,complex_id INT,phase_number INT,level VARCHAR(20)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
 CREATE TABLE app_state(complex_id INT NOT NULL,`key` VARCHAR(100) NOT NULL,value LONGTEXT,UNIQUE KEY app_key(complex_id,`key`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
 INSERT INTO students VALUES('import-S',1,1,'1'),('frozen-S',1,1,'1');
 INSERT INTO education_plans(id,track,level_number,title,segment_count) VALUES('P','gold',1001,'fixture',2);
 INSERT INTO plan_segments(id,plan_id,segment_index,hifz_plan,rabt_plan,muraja_plan) VALUES('seg-1','P',1,'h','r','m'),('seg-2','P',2,'h','r','m');");
// Prepare only the original schema prerequisites in this disposable database.
plans_ensure_assignment_v2_columns($pdo);plans_ensure_daily_faces_columns($pdo);plans_ensure_completion_assignment_column($pdo);
$input=['student_id'=>'import-S','plan_id'=>'P','only_if_unassigned'=>true];$GLOBALS['input']=$input;
$children=[];
for($i=0;$i<2;$i++){
 $pid=pcntl_fork();if($pid===-1)throw new RuntimeException('fork unavailable');
 if($pid===0){try{$GLOBALS['pdo']=connectFixture();$GLOBALS['input']=$input;handle_assign_plan();exit(0);}catch(Throwable $error){exit(str_contains($error->getMessage(),'لم يُستبدل التعيين')?0:1);}}
 $children[]=$pid;
}
foreach($children as $pid){pcntl_waitpid($pid,$status);check(pcntl_wexitstatus($status)===0,'concurrent import either commits once or rejects the existing link');}
$GLOBALS['pdo']=$pdo=connectFixture();
check((int)$pdo->query("SELECT COUNT(*) FROM student_plan_assignments WHERE student_id='import-S'")->fetchColumn()===1,'two real InnoDB transactions create only one assignment');
$pdo->exec("INSERT INTO student_plan_assignments(id,student_id,plan_id,status) VALUES('F','frozen-S','P','frozen')");
$GLOBALS['input']=['student_id'=>'frozen-S','plan_id'=>'P','only_if_unassigned'=>true];
try{handle_assign_plan();throw new RuntimeException('frozen link was replaced');}catch(RuntimeException $error){check(str_contains($error->getMessage(),'لم يُستبدل التعيين'),'frozen assignment is retained during import');}
$GLOBALS['auth']['role']='secretary';$GLOBALS['input']=$input;
try{handle_assign_plan();throw new RuntimeException('role was elevated');}catch(RuntimeException $error){check($error->getCode()===403,'existing secretary plan-link refusal preserved');}
$GLOBALS['auth']=['role'=>'manager','complexId'=>1,'name'=>'fixture'];
$columns=[];foreach(eval_settings_defaults() as $key=>$value)$columns[]="$key ".(is_float($value)?'DOUBLE':'INT')." DEFAULT $value";
$pdo->exec('CREATE TABLE evaluation_settings(complex_id INT PRIMARY KEY,'.implode(',',$columns).') ENGINE=InnoDB');
$pdo->exec('SET TRANSACTION READ ONLY');$pdo->beginTransaction();handle_get_evaluation_settings();$pdo->rollBack();
check((int)$pdo->query('SELECT COUNT(*) FROM evaluation_settings')->fetchColumn()===0,'actual read-only transaction accepts settings GET without implicit writes');
$GLOBALS['input']=['settings'=>array_merge(eval_settings_defaults(),['error_deduction'=>0])];handle_put_evaluation_settings();
check($GLOBALS['response']['settings']['error_deduction']===0,'actual database PUT confirms zero settings');
$pdo->exec('ALTER TABLE evaluation_settings ADD CONSTRAINT fixture_reject_nine CHECK(error_deduction<>9)');
$GLOBALS['auth']['complexId']=2;$GLOBALS['input']['settings']['error_deduction']=9;unset($GLOBALS['response']);
try{handle_put_evaluation_settings();throw new RuntimeException('fixture failure not detected');}catch(PDOException $error){check(str_contains($error->getMessage(),'fixture_reject_nine'),'real constraint failure is surfaced');}
check(!isset($GLOBALS['response'])&&(int)$pdo->query('SELECT COUNT(*) FROM evaluation_settings WHERE complex_id=2')->fetchColumn()===0,'real transaction rolls back initialized settings after failed update');
$pdo->exec('ALTER TABLE evaluation_settings ADD CONSTRAINT fixture_reject_three CHECK(complex_id<>3)');
$GLOBALS['auth']['complexId']=3;$GLOBALS['input']['settings']['error_deduction']=7;unset($GLOBALS['response']);
try{handle_put_evaluation_settings();throw new RuntimeException('initialization falsely succeeded');}catch(Throwable $error){check(str_contains($error->getMessage(),'تعذّر تهيئة')||str_contains($error->getMessage(),'fixture_reject_three'),'ignored or rejected initialization never confirms defaults as a saved row');}
check(!isset($GLOBALS['response'])&&(int)$pdo->query('SELECT COUNT(*) FROM evaluation_settings WHERE complex_id=3')->fetchColumn()===0,'no silent success when INSERT IGNORE could not create settings');
$pdo->exec('DROP TABLE evaluation_settings');$pdo->exec('CREATE TABLE evaluation_settings(id INT PRIMARY KEY,'.implode(',',$columns).') ENGINE=InnoDB');
$GLOBALS['input']['settings']['error_deduction']=7;handle_put_evaluation_settings();
check($GLOBALS['response']['settings']['error_deduction']===7&&(int)$pdo->query('SELECT COUNT(*) FROM evaluation_settings')->fetchColumn()===1,'original non-tenant schema still supports explicit confirmed save');
$records=[];for($i=0;$i<651;$i++)$records[]=['id'=>'fixture-'.$i,'percent'=>0,'unverified'=>null];
$GLOBALS['input']=['key'=>'sard_history','value'=>$records];handle_set_app_state();
$s=$pdo->prepare('SELECT value FROM app_state WHERE complex_id=? AND `key`=?');$s->execute([3,'sard_history']);
check(json_decode($s->fetchColumn(),true)===$records,'original shared-history format retains 651 exact records on the actual engine');
$GLOBALS['input']['value']=array_slice($records,0,500);
try{handle_set_app_state();throw new RuntimeException('old truncation accepted');}catch(RuntimeException $error){check($error->getCode()===409,'old 500-item writer is rejected on the actual engine');}
$s->execute([3,'sard_history']);check(json_decode($s->fetchColumn(),true)===$records,'old-client rejection retains all 651 stored records');
$_GET=['key'=>'sard_history'];$pdo->exec('SET TRANSACTION READ ONLY');$pdo->beginTransaction();handle_list_app_state();$pdo->rollBack();
check($GLOBALS['response'][0]['context_complex_id']===3&&$GLOBALS['response'][0]['value']===$records,'read-only history response confirms request context without changing its stored data');
// F07/F20 use existing rows only: no migration or inferred legacy provenance.
$GLOBALS['auth']=['role'=>'supervisor','complexId'=>1,'name'=>'fixture'];
$pdo->exec("INSERT INTO students VALUES('target-S',1,1,'1'),('middle-S',1,1,'1'),('rollback-S',1,1,'1');
 INSERT INTO education_plans(id,track,level_number,title,segment_count) VALUES('Q','gold',1002,'next fixture',2);
 INSERT INTO plan_segments(id,plan_id,segment_index,hifz_plan,rabt_plan,muraja_plan) VALUES('q-1','Q',1,'h','r','m'),('q-3','Q',3,'h','r','m');
 INSERT INTO student_plan_assignments(id,student_id,plan_id,status) VALUES('A','target-S','P','active'),('R','rollback-S','P','active');
 INSERT INTO segment_completions(id,student_id,plan_id,assignment_id,segment_index,task_type,completed_at) VALUES('legacy-exact','target-S','P','A',1,'hifz','2026-10-01'),('legacy-unbound','target-S','P',NULL,2,'hifz','2026-10-01');");
$history=$pdo->query("SELECT * FROM segment_completions WHERE student_id='target-S' ORDER BY id")->fetchAll();
$GLOBALS['input']=['student_id'=>'target-S','assignment_id'=>'A','status'=>'frozen'];handle_patch_assignment();$frozen=$pdo->query("SELECT frozen_at FROM student_plan_assignments WHERE id='A'")->fetchColumn();handle_patch_assignment();
check($GLOBALS['response']['updated']===0&&$pdo->query("SELECT frozen_at FROM student_plan_assignments WHERE id='A'")->fetchColumn()===$frozen,'real engine repeated freeze preserves the first timestamp');
$GLOBALS['input']=['student_id'=>'target-S','plan_id'=>'Q','expected_assignment_id'=>'A'];handle_assign_plan();$assigned=$GLOBALS['response']['assignment_id'];
check((int)$pdo->query("SELECT COUNT(*) FROM student_plan_assignments WHERE student_id='target-S' AND status IN ('active','frozen')")->fetchColumn()===1,'frozen replacement leaves one current plan on the actual engine');
$GLOBALS['input']=['student_id'=>'target-S','assignment_id'=>'A','status'=>'active'];
try{handle_patch_assignment();throw new RuntimeException('old assignment resumed');}catch(RuntimeException $e){check($e->getCode()===409,'stale resume rejects the old identity');}
check($pdo->query("SELECT * FROM segment_completions WHERE student_id='target-S' ORDER BY id")->fetchAll()===$history,'bound and unbound original completions are preserved byte-for-value without guessing');
$pdo->prepare("UPDATE student_plan_assignments SET status='frozen' WHERE id=?")->execute([$assigned]);
$children=[];for($i=0;$i<2;$i++){
 $pid=pcntl_fork();if($pid===-1)throw new RuntimeException('fork unavailable');
 if($pid===0){$GLOBALS['pdo']=connectFixture();$GLOBALS['input']=$i===0?['student_id'=>'target-S','plan_id'=>'P','expected_assignment_id'=>$assigned]:['student_id'=>'target-S','assignment_id'=>$assigned,'status'=>'active'];
  try{if($i===0)handle_assign_plan();else handle_patch_assignment();exit(0);}catch(Throwable $e){exit(str_contains($e->getMessage(),'تغيّرت خطة الطالب')?0:1);}}
 $children[]=$pid;
}
foreach($children as $pid){pcntl_waitpid($pid,$status);check(pcntl_wexitstatus($status)===0,'concurrent replacement/resume commits or reports a genuine stale assignment');}
$GLOBALS['pdo']=$pdo=connectFixture();check((int)$pdo->query("SELECT COUNT(*) FROM student_plan_assignments WHERE student_id='target-S' AND status IN ('active','frozen')")->fetchColumn()===1,'student row lock prevents two current assignments during real concurrency');
$pdo->exec("INSERT INTO student_plan_assignments(id,student_id,plan_id,status) VALUES('duplicate-current','target-S','Q','frozen')");
$GLOBALS['input']=['student_id'=>'target-S','assignment_id'=>'duplicate-current','status'=>'active'];
try{handle_patch_assignment();throw new RuntimeException('ambiguous data changed');}catch(RuntimeException $e){check(str_contains($e->getMessage(),'تعيينات حالية متعددة'),'ambiguous current rows are held intact instead of selecting one');}
check((int)$pdo->query("SELECT COUNT(*) FROM student_plan_assignments WHERE student_id='target-S' AND status IN ('active','frozen')")->fetchColumn()===2,'both ambiguous fixture rows remain available for review');
foreach([0,-1,1.5,'bad',2,99] as $start){$GLOBALS['input']=['student_id'=>'middle-S','plan_id'=>'Q','expected_assignment_id'=>'','start_segment_index'=>$start];try{handle_assign_plan();throw new RuntimeException('invalid start accepted');}catch(RuntimeException $e){check(str_contains($e->getMessage(),in_array($start,[2,99],true)?'غير موجود':'عددًا صحيحًا'),'invalid or missing start is rejected without creating an assignment');}}
$GLOBALS['input']['start_segment_index']=3;handle_assign_plan();check((int)$pdo->query("SELECT start_segment_index FROM student_plan_assignments WHERE student_id='middle-S'")->fetchColumn()===3,'a real middle segment is accepted');
$pdo->exec("ALTER TABLE student_plan_assignments ADD CONSTRAINT fixture_reject_frozen CHECK(student_id<>'rollback-S' OR status<>'frozen')");
$GLOBALS['input']=['student_id'=>'rollback-S','assignment_id'=>'R','status'=>'frozen'];
try{handle_patch_assignment();throw new RuntimeException('freeze failure was hidden');}catch(RuntimeException $e){check(str_contains($e->getMessage(),'fixture_reject_frozen'),'actual freeze constraint failure is surfaced');}
check($pdo->query("SELECT status FROM student_plan_assignments WHERE id='R'")->fetchColumn()==='active','failed freeze rolls back its existing row on the actual engine');

// F17: prove the extra grade metadata and the empty-store path are genuinely read-only.
$pdo->exec('CREATE TABLE semesters(id INT PRIMARY KEY,complex_id INT,is_active INT); INSERT INTO semesters VALUES(1,1,1),(2,1,0),(3,2,1)');
$GLOBALS['auth']=['role'=>'student','studentId'=>'fixture-S','complexId'=>1];
$gradeFixture=['fixture-S'=>[1=>['days'=>['sun'=>['hifz'=>'one','compensationFaces'=>0,'unknown'=>null]]]]];
app_state_upsert($pdo,'grades',$gradeFixture,1);
$gradeRaw=$pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='grades'")->fetchColumn();
$rowCount=(int)$pdo->query('SELECT COUNT(*) FROM app_state')->fetchColumn();
$_GET=['key'=>'grades'];$pdo->exec('SET TRANSACTION READ ONLY');$pdo->beginTransaction();handle_list_app_state();$pdo->rollBack();
check($GLOBALS['response'][0]['value']===$gradeFixture&&$GLOBALS['response'][0]['calendar_context']===['known'=>true,'active_semester_id'=>'1'],'actual read-only grade GET retains zero/null and confirms the request calendar');
$GLOBALS['auth']['complexId']=2;$pdo->exec('SET TRANSACTION READ ONLY');$pdo->beginTransaction();handle_list_app_state();$pdo->rollBack();
check($GLOBALS['response'][0]['context_complex_id']===2&&$GLOBALS['response'][0]['calendar_context']['active_semester_id']==='3'&&(array)$GLOBALS['response'][0]['value']===[],'actual empty grade GET uses the existing complex filter without inserting defaults');
check($pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='grades'")->fetchColumn()===$gradeRaw&&(int)$pdo->query('SELECT COUNT(*) FROM app_state')->fetchColumn()===$rowCount,'read-only grade polling does not rewrite or classify historical records');
$GLOBALS['auth']['complexId']=1;$pdo->exec('UPDATE semesters SET is_active=1 WHERE id=2');handle_list_app_state();check($GLOBALS['response'][0]['calendar_context']['known']===false,'actual ambiguous active calendar is reported rather than guessed');
$pdo->exec('UPDATE semesters SET is_active=0 WHERE complex_id=1');handle_list_app_state();check($GLOBALS['response'][0]['calendar_context']===['known'=>true,'active_semester_id'=>null],'actual missing active calendar is explicit');

require __DIR__.'/assignment-quota-cases.php';quotaCases($pdo,'P');
$pdo->exec("UPDATE student_plan_assignments SET daily_hifz_faces=9 WHERE id='quota-current'; ALTER TABLE student_plan_assignments ADD CONSTRAINT reject_quota CHECK(id<>'quota-current' OR daily_hifz_faces=9)");
$quotaBefore=$pdo->query("SELECT * FROM student_plan_assignments WHERE student_id='quota-S' ORDER BY id")->fetchAll();
quotaFailure(fn()=>handle_patch_assignment_quotas(),'reject_quota');check($pdo->query("SELECT * FROM student_plan_assignments WHERE student_id='quota-S' ORDER BY id")->fetchAll()===$quotaBefore,'actual quota constraint failure rolls back all target changes');
$pdo->exec("INSERT INTO students(id,complex_id,phase_number,level) VALUES('quota-race-S',1,1,'1'); INSERT INTO student_plan_assignments(id,student_id,plan_id,start_segment_index,status) VALUES('quota-race-current','quota-race-S','P',1,'frozen')");
// Race the exact quota mutation against replacement under the same existing student lock.
$children=[];for($i=0;$i<2;$i++){
 $pid=pcntl_fork();if($pid===-1)throw new RuntimeException('fork unavailable');
 if($pid===0){$GLOBALS['pdo']=connectFixture();$GLOBALS['input']=$i===0?['student_id'=>'quota-race-S','assignment_id'=>'quota-race-current']:['student_id'=>'quota-race-S','plan_id'=>'Q','expected_assignment_id'=>'quota-race-current'];
  try{if($i===0)handle_patch_assignment_quotas();else handle_assign_plan();exit(0);}catch(Throwable $e){exit(str_contains($e->getMessage(),'تغيّرت خطة الطالب')?0:1);}}
 $children[]=$pid;
}
foreach($children as $pid){pcntl_waitpid($pid,$status);check(pcntl_wexitstatus($status)===0,'actual concurrent quota/replacement commits or reports a stale target');}
$GLOBALS['pdo']=$pdo=connectFixture();$s=$pdo->query("SELECT id,plan_id FROM student_plan_assignments WHERE student_id='quota-race-S' AND status IN ('active','frozen')")->fetchAll();
check(count($s)===1&&$s[0]['plan_id']==='Q','quota concurrency never updates or reactivates a replacement assignment');
$GLOBALS['input']=['student_id'=>'quota-race-S','assignment_id'=>'quota-race-current'];quotaFailure(fn()=>handle_patch_assignment_quotas(),'تغيّرت خطة الطالب');

require __DIR__.'/backend-continuity-cases.php';continuityCases($pdo);
$GLOBALS['auth']=['role'=>'manager','complexId'=>1];app_state_upsert($pdo,'grades',['S'=>['keep'=>'original']],1);
$pdo->exec("ALTER TABLE app_state ADD CONSTRAINT fixture_continuity CHECK(`key`<>'grades' OR complex_id<>1 OR value NOT LIKE '%rejected-value%')");$GLOBALS['input']=['key'=>'grades','value'=>['S'=>['keep'=>'rejected-value']]];
continuityFailure(fn()=>handle_set_app_state(),'fixture_continuity');check(json_decode($pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='grades'")->fetchColumn(),true)===['S'=>['keep'=>'original']],'real database failure leaves the original store unchanged');
// A late empty request cannot race a valid write into deleting it.
$children=[];for($i=0;$i<2;$i++){$pid=pcntl_fork();if($pid===-1)throw new RuntimeException('fork unavailable');if($pid===0){$GLOBALS['pdo']=connectFixture();$GLOBALS['input']=['key'=>'grades','value'=>$i===0?[]:['S'=>['keep'=>'concurrent-new']]];try{handle_set_app_state();exit($i===0?1:0);}catch(Throwable $e){exit($i===0&&str_contains($e->getMessage(),'سيصفّر')?0:1);}}$children[]=$pid;}
foreach($children as $pid){pcntl_waitpid($pid,$status);check(pcntl_wexitstatus($status)===0,'real concurrent reset/save rejects only the reset');}
$GLOBALS['pdo']=$pdo=connectFixture();check(json_decode($pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='grades'")->fetchColumn(),true)===['S'=>['keep'=>'concurrent-new']],'concurrent valid writing survives the late empty store request');

require __DIR__.'/continuity-calendar-cases.php';continuityCalendarCases($pdo);

// Identical catalog imports must preserve native identifiers on both actual InnoDB engines.
require __DIR__.'/catalog-noop-cases.php';catalogNoopCases($pdo);
$baseline=catalogSnapshot($pdo);catalogDeleteTrap($pdo,true);$children=[];
for($i=0;$i<2;$i++){
 $pid=pcntl_fork();if($pid===-1)throw new RuntimeException('fork unavailable');
 if($pid===0){try{$GLOBALS['pdo']=connectFixture();$GLOBALS['auth']=['role'=>'supervisor','complexId'=>1,'name'=>'fixture'];$GLOBALS['input']=catalogNoopPayload();handle_import_plans();exit(0);}catch(Throwable $e){exit(1);}}
 $children[]=$pid;
}
foreach($children as $pid){pcntl_waitpid($pid,$status);check(pcntl_wifexited($status)&&pcntl_wexitstatus($status)===0,'concurrent same-content import never deletes/recreates segments');}
$GLOBALS['pdo']=$pdo=connectFixture();check(catalogSnapshot($pdo)===$baseline,'concurrent retry preserves ongoing work byte-for-byte at row values');catalogDeleteTrap($pdo,false);

// Optional assignment receipt protocol: native schema is created in this disposable DB only.
require __DIR__.'/assignment-operation-cases.php';assignmentReceiptTable($pdo);
$pdo->exec("INSERT INTO students(id,complex_id,phase_number,level) VALUES('receipt-S',1,1,'1'),('receipt-race-S',1,1,'1'),('receipt-fail-S',1,1,'1');
 INSERT INTO student_plan_assignments(id,student_id,plan_id,status) VALUES('receipt-A','receipt-S','P','active'),('receipt-race-A','receipt-race-S','P','active'),('receipt-fail-A','receipt-fail-S','P','active');
 INSERT INTO segment_completions(id,student_id,plan_id,assignment_id,segment_index,task_type,completed_at) VALUES('receipt-legacy','receipt-S','P',NULL,1,'hifz','2026-01-01');");
assignmentOperationCases($pdo,['student_id'=>'receipt-S','plan_id'=>'Q','expected_assignment_id'=>'receipt-A','start_segment_index'=>1],'receipt-S');
$GLOBALS['auth']=['role'=>'supervisor','complexId'=>1,'name'=>'fixture'];
$raceInput=['student_id'=>'receipt-race-S','plan_id'=>'Q','expected_assignment_id'=>'receipt-race-A','start_segment_index'=>1,'operation_id'=>'fixture-race-operation'];$children=[];
for($i=0;$i<2;$i++){
 $pid=pcntl_fork();if($pid===-1)throw new RuntimeException('fork unavailable');
 if($pid===0){try{$GLOBALS['pdo']=connectFixture();$GLOBALS['input']=$raceInput;handle_assign_plan();exit(($GLOBALS['response']['operation_applied']??false)?0:1);}catch(Throwable $e){exit(1);}}
 $children[]=$pid;
}
foreach($children as $pid){pcntl_waitpid($pid,$status);check(pcntl_wifexited($status)&&pcntl_wexitstatus($status)===0,'concurrent same-operation requests both confirm the one committed result');}
$GLOBALS['pdo']=$pdo=connectFixture();
check((int)$pdo->query("SELECT COUNT(*) FROM student_plan_assignments WHERE student_id='receipt-race-S'")->fetchColumn()===2,'native duplicate request creates one new assignment and retains its predecessor');
check((int)$pdo->query("SELECT COUNT(*) FROM plan_operation_receipts WHERE operation_id='fixture-race-operation'")->fetchColumn()===1,'native concurrent requests share one durable receipt');
$pdo->exec("ALTER TABLE plan_operation_receipts ADD CONSTRAINT fixture_reject_receipt CHECK(operation_id<>'fixture-reject-receipt')");
$GLOBALS['input']=['student_id'=>'receipt-fail-S','plan_id'=>'Q','expected_assignment_id'=>'receipt-fail-A','start_segment_index'=>1,'operation_id'=>'fixture-reject-receipt'];$before=assignmentOperationSnapshot($pdo,'receipt-fail-S');
assignmentOperationFailure(fn()=>handle_assign_plan(),'fixture_reject_receipt');
check(assignmentOperationSnapshot($pdo,'receipt-fail-S')===$before,'native receipt constraint failure rolls back assignment writes without changing old records');

// Native queue failure after plan writes must also roll back the pending receipt.
$pdo->exec("INSERT INTO students(id,complex_id,phase_number,level) VALUES('receipt-sard-fail-S',1,1,'1');
 INSERT INTO student_plan_assignments(id,student_id,plan_id,status) VALUES('receipt-sard-fail-A','receipt-sard-fail-S','P','active');
 INSERT INTO segment_completions(id,student_id,plan_id,assignment_id,segment_index,task_type,completed_at) VALUES('receipt-sard-h1','receipt-sard-fail-S','P','receipt-sard-fail-A',1,'hifz','2026-10-01'),('receipt-sard-h2','receipt-sard-fail-S','P','receipt-sard-fail-A',2,'hifz','2026-10-02');");
app_state_upsert($pdo,'sard_queue',[['id'=>'fixture-native-queue','studentId'=>'receipt-sard-fail-S','assignmentId'=>'receipt-sard-fail-A','status'=>'scheduled']],1);
$pdo->exec("ALTER TABLE app_state ADD CONSTRAINT fixture_reject_queue CHECK(`key`<>'sard_queue' OR value NOT LIKE '%passed%')");
$GLOBALS['auth']=['role'=>'musammi','accountId'=>'fixture','complexId'=>1,'name'=>'fixture'];
$GLOBALS['input']=['student_id'=>'receipt-sard-fail-S','plan_id'=>'Q','expected_assignment_id'=>'receipt-sard-fail-A','start_segment_index'=>1,'operation_id'=>'fixture-native-queue-failure','sard_result'=>['id'=>'fixture-native-queue','percent'=>100,'phase'=>'full']];$before=assignmentOperationSnapshot($pdo,'receipt-sard-fail-S');
assignmentOperationFailure(fn()=>handle_assign_plan(),'fixture_reject_queue');
check(assignmentOperationSnapshot($pdo,'receipt-sard-fail-S')===$before&&(int)$pdo->query("SELECT COUNT(*) FROM plan_operation_receipts WHERE operation_id='fixture-native-queue-failure'")->fetchColumn()===0,'native sard queue failure rolls back closure, new plan and receipt together');

require __DIR__.'/completion-events-native-cases.php';completionNativeCases($pdo);

$GLOBALS['pdo']=$pdo=connectFixture();
require __DIR__.'/grade-cell-native-cases.php';

$GLOBALS['pdo']=$pdo=connectFixture();
require __DIR__.'/grade-plan-native-cases.php';
