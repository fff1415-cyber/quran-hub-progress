<?php
declare(strict_types=1);
if(getenv('AUDIT_MYSQL_DSN')!=='mysql:host=127.0.0.1;port=3307;dbname=audit_test;charset=utf8mb4')throw new RuntimeException('Only disposable CI database allowed');
define('QHP_GRADE_WRITES_V1',true);define('QHP_SHARED_GRADE_WRITES_V1',true);define('QHP_SEMESTER_STORES_V1',true);
function connectFixture():PDO{return new PDO(getenv('AUDIT_MYSQL_DSN'),'audit','audit_only',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);}
function table_column_exists(PDO $pdo,string $table,string $column):bool{$q=$pdo->prepare('SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?');$q->execute([$table,$column]);return (int)$q->fetchColumn()>0;}
function check(bool $ok,string $label):void{if(!$ok)throw new LogicException($label);echo "PASS: $label\n";}
require __DIR__.'/../api/routes/app_state.php';require __DIR__.'/../api/routes/plans.php';require __DIR__.'/grade-cell-cases.php';
$pdo=connectFixture();$pdo->exec('CREATE TABLE app_state(complex_id INT NOT NULL,`key` VARCHAR(100) NOT NULL,value LONGTEXT,UNIQUE(complex_id,`key`)) ENGINE=InnoDB;CREATE TABLE semesters(id INT PRIMARY KEY,complex_id INT,is_active INT) ENGINE=InnoDB;INSERT INTO semesters VALUES(1,1,1),(2,1,0)');$pdo->exec(file_get_contents(__DIR__.'/fixtures/grade-cell-operations.sql'));
app_state_upsert($pdo,'grades',(object)['historic'=>(object)['zero'=>0]],1);app_state_upsert($pdo,'scientific_grades',json_decode('{"configs":{"1":{"visible":true}},"data":{"historic":{"keep":0}},"overrides":{}}'),1);
$paths=[['S','1','muraja','0'],['S','1','muraja','1']];$snap=grade_cells_capture($pdo,1,'weekly_tests',$paths);$children=[];
for($i=0;$i<2;$i++){$pid=pcntl_fork();if($pid<0)throw new RuntimeException('fork failed');if($pid===0){try{$db=connectFixture();grade_cells_apply($db,1,'weekly_tests','semester-concurrent-'.$i,$snap['calendar_context'],[gradeCellChange($snap,$i,$i===0?'pass':'fail')]);exit(0);}catch(Throwable $e){fwrite(STDERR,$e->getMessage());exit(1);}}$children[]=$pid;}
foreach($children as$pid){pcntl_waitpid($pid,$status);check(pcntl_wifexited($status)&&pcntl_wexitstatus($status)===0,'native independent weekly worker committed');}
$pdo=connectFixture();$value=grade_write_snapshot($pdo,1,'','weekly_tests')['value'];check($value->S->{'1'}->muraja===['pass','fail'],'native concurrent first writes retain both array slots');
$paths=[['data','1','S','1','sun','hifz'],['overrides','1','S','1','sun','hifz']];$snap=grade_cells_capture($pdo,1,'scientific_grades',$paths);$changes=[gradeCellChange($snap,0,'0'),gradeCellChange($snap,1,true)];
$pdo->exec("ALTER TABLE grade_operation_receipts ADD CONSTRAINT semester_receipt_failure CHECK(operation_id<>'semester-receipt-failure')");
try{grade_cells_apply($pdo,1,'scientific_grades','semester-receipt-failure',$snap['calendar_context'],$changes);throw new LogicException('Expected receipt failure');}catch(PDOException $e){check(str_contains($e->getMessage(),'semester_receipt_failure'),'native late receipt CHECK reached');}
$value=grade_write_snapshot($pdo,1,'','scientific_grades')['value'];check(!isset($value->data->S)&&!isset($value->overrides->S)&&gradeCellRaw($pdo,1,'term:1:scientific_grades')==='','native science value/override/store/version/receipt all roll back');
$receipt=grade_cells_apply($pdo,1,'scientific_grades','semester-science-pass',$snap['calendar_context'],$changes);$old=gradeCellRaw($pdo,1,'term:1:scientific_grades');
$pdo->exec('UPDATE semesters SET is_active=CASE WHEN id=2 THEN 1 ELSE 0 END');$value=grade_write_snapshot($pdo,1,'','scientific_grades')['value'];check(get_object_vars($value->data)===[]&&get_object_vars($value->overrides)===[]&&$value->configs->{'1'}->visible===true,'native next semester inherits only settings, never prior scores or overrides');
$replay=grade_cells_apply($pdo,1,'scientific_grades','semester-science-pass',$snap['calendar_context'],$changes);check($replay['replayed']&&gradeCellRaw($pdo,1,'term:1:scientific_grades')===$old&&gradeCellRaw($pdo,1,'term:2:scientific_grades')==='','native old receipt never writes into the new semester');
check(json_decode(gradeCellRaw($pdo,1),false)->historic->zero===0&&json_decode(gradeCellRaw($pdo,1,'scientific_grades'),false)->data->historic->keep===0,'native unassigned historical blobs are byte-preserved');
