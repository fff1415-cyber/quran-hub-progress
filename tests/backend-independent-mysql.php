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
 CREATE TABLE students(id VARCHAR(50) PRIMARY KEY,complex_id INT,phase_number INT,level VARCHAR(20));
 CREATE TABLE app_state(complex_id INT NOT NULL,`key` VARCHAR(100) NOT NULL,value LONGTEXT,UNIQUE KEY app_key(complex_id,`key`));
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
$pdo->exec('DROP TABLE evaluation_settings');$pdo->exec('CREATE TABLE evaluation_settings(id INT PRIMARY KEY,'.implode(',',$columns).') ENGINE=InnoDB');
$GLOBALS['input']['settings']['error_deduction']=7;handle_put_evaluation_settings();
check($GLOBALS['response']['settings']['error_deduction']===7&&(int)$pdo->query('SELECT COUNT(*) FROM evaluation_settings')->fetchColumn()===1,'original non-tenant schema still supports explicit confirmed save');
$records=[];for($i=0;$i<651;$i++)$records[]=['id'=>'fixture-'.$i,'percent'=>0,'unverified'=>null];
$GLOBALS['input']=['key'=>'sard_history','value'=>$records];handle_set_app_state();
$s=$pdo->prepare('SELECT value FROM app_state WHERE complex_id=? AND `key`=?');$s->execute([2,'sard_history']);
check(json_decode($s->fetchColumn(),true)===$records,'original shared-history format retains 651 exact records on the actual engine');
$GLOBALS['input']['value']=array_slice($records,0,500);
try{handle_set_app_state();throw new RuntimeException('old truncation accepted');}catch(RuntimeException $error){check($error->getCode()===409,'old 500-item writer is rejected on the actual engine');}
$s->execute([2,'sard_history']);check(json_decode($s->fetchColumn(),true)===$records,'old-client rejection retains all 651 stored records');
