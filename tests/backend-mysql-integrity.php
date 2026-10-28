<?php
declare(strict_types=1);
// This harness has no production configuration import. Refuse every other DSN.
const AUDIT_DSN = 'mysql:host=127.0.0.1;port=3307;dbname=audit_test;charset=utf8mb4';
function connectAudit(): PDO {
    if (getenv('AUDIT_MYSQL_DSN') !== AUDIT_DSN) throw new RuntimeException('Isolated audit_test DSN required');
    return new PDO(AUDIT_DSN, 'audit', 'audit_only', [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
}
function db(): PDO {return $GLOBALS['pdo'];}
function require_auth(): array {return ['role'=>'manager','complexId'=>1,'name'=>'isolated'];}
function require_complex_id(array $a): int {return 1;}
function json_input(): array {return $GLOBALS['input'];}
function json_response(mixed $r): void {$GLOBALS['response']=$r;}
function error_response(string $message, int $status=400): never {throw new RuntimeException($message,$status);}
function assert_row_belongs_to_complex(?int $a, int $b): void {if ($a!==$b) throw new RuntimeException('scope');}
function new_uuid(): string {return bin2hex(random_bytes(16));}
function table_column_exists(PDO $pdo,string $table,string $column): bool {
    $s=$pdo->prepare('SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?');$s->execute([$table,$column]);return (bool)$s->fetchColumn();
}
require __DIR__.'/../api/routes/app_state.php';
require __DIR__.'/../api/routes/plans.php';
function check(bool $ok,string $label): void {if(!$ok)throw new RuntimeException($label);echo "PASS: $label\n";}
$pdo=connectAudit();$GLOBALS['pdo']=$pdo;
$pdo->exec(file_get_contents(__DIR__.'/../database/migrate-education-plans.sql'));
$pdo->exec("ALTER TABLE education_plans ADD COLUMN complex_id INT DEFAULT 1;
 CREATE TABLE students(id VARCHAR(50) PRIMARY KEY, complex_id INT DEFAULT 1, phase_number INT DEFAULT 1, level VARCHAR(20) DEFAULT '1');
 CREATE TABLE app_state(complex_id INT NOT NULL, `key` VARCHAR(100) NOT NULL, value LONGTEXT, UNIQUE KEY state_key(complex_id, `key`));
 INSERT INTO students(id) VALUES('S');
 INSERT INTO education_plans(id,track,level_number,title,segment_count) VALUES('P','gold',1001,'test',4);
 INSERT INTO student_plan_assignments(id,student_id,plan_id) VALUES('A','S','P');
 INSERT INTO plan_segments(id,plan_id,segment_index,hifz_plan,rabt_plan,muraja_plan) VALUES('s1','P',1,'h1','r1','m1'),('s2','P',2,'h2','r2','m2'),('s3','P',3,'h3','r3','m3'),('s4','P',4,'h4','r4','m4');
 INSERT INTO segment_completions(id,student_id,plan_id,assignment_id,segment_index,task_type,completed_at) VALUES('explicit','S','P','A',3,'hifz','2026-10-12'),('unknown','S','P',NULL,4,'hifz','2026-10-12');");
$sql=file_get_contents(__DIR__.'/../database/migrate-audit-plan-integrity.sql');
$pdo->exec($sql);$pdo->exec($sql);
check((int)$pdo->query('SELECT COUNT(*) FROM plan_assignment_completions')->fetchColumn()===1,'rerunnable migration copies only verified explicit assignment');
check((int)$pdo->query('SELECT COUNT(*) FROM segment_completions')->fetchColumn()===2,'migration preserves every legacy row');
check((int)$pdo->query('SELECT COUNT(*) FROM plan_legacy_completion_review')->fetchColumn()===1,'unknown provenance remains in review');
// Fork with independent connections; exercise real InnoDB student row locking.
function runConcurrent(array $ids): void {
    $children=[];
    foreach($ids as $id) {
        $pid=pcntl_fork();
        if($pid===-1)throw new RuntimeException('fork failed');
        if($pid===0) {
            try {$GLOBALS['pdo']=connectAudit();$GLOBALS['input']=['student_id'=>'S','expected_assignment_id'=>'A','task_type'=>'hifz','tap'=>'one','completed_at'=>'2026-10-13','operation_id'=>$id];handle_apply_plan_input();exit(0);}
            catch(Throwable $e){fwrite(STDERR,$e->getMessage()."\n");exit(1);}
        }
        $children[]=$pid;
    }
    foreach($children as $pid){pcntl_waitpid($pid,$status);check(pcntl_wexitstatus($status)===0,'concurrent worker commits');}
    $GLOBALS['pdo']=connectAudit();
}
runConcurrent(['retry-operation-0001','retry-operation-0001']);$pdo=$GLOBALS['pdo'];
check((int)$pdo->query('SELECT COUNT(*) FROM plan_operations')->fetchColumn()===1,'same request commits once under contention');
check((int)$pdo->query('SELECT COUNT(*) FROM plan_assignment_completions')->fetchColumn()===2,'lost response does not advance another segment');
runConcurrent(['distinct-operation-001','distinct-operation-002']);$pdo=$GLOBALS['pdo'];
check((int)$pdo->query('SELECT COUNT(*) FROM plan_assignment_completions')->fetchColumn()===4,'different concurrent requests preserve both completions');
echo "MySQL migration and InnoDB concurrency acceptance complete.\n";
$pdo->exec(file_get_contents(__DIR__.'/../database/migrate-audit-diary-events.sql'));
$pdo->exec(file_get_contents(__DIR__.'/../database/migrate-audit-diary-events.sql'));
$pdo->exec(file_get_contents(__DIR__.'/../database/migrate-audit-current-assignment-constraint.sql'));
$pdo->exec(file_get_contents(__DIR__.'/../database/migrate-audit-current-assignment-constraint.sql'));
try{$pdo->exec("INSERT INTO student_plan_assignments(id,student_id,plan_id,status) VALUES('duplicate','S','P','frozen')");throw new RuntimeException('duplicate unexpectedly accepted');}
catch(PDOException $error){check($error->getCode()==='23000','database constraint rejects a second active/frozen assignment');}
$pdo->exec("CREATE TABLE semesters(id CHAR(36) PRIMARY KEY,complex_id INT,is_active INT);INSERT INTO semesters VALUES('term-A',1,1),('term-B',1,0);
 CREATE TABLE academic_weeks(semester_id CHAR(36),week_number INT,start_date DATE,end_date DATE);INSERT INTO academic_weeks VALUES('term-A',1,'2026-10-11','2026-10-15');
 INSERT INTO students(id) VALUES('diary-S');INSERT INTO student_plan_assignments(id,student_id,plan_id,status) VALUES('diary-A','diary-S','P','active');");
$children=[];
foreach([['sun','2026-10-11'],['mon','2026-10-12']] as [$day,$date]){
 $pid=pcntl_fork();if($pid===0){try{$p=connectAudit();plans_record_diary($p,1,require_auth(),['student_id'=>'diary-S','expected_assignment_id'=>'diary-A','operation_id'=>'concurrent-diary-'.$day,'task_type'=>'hifz','tap'=>'one','diary'=>['semester_id'=>'term-A','week_number'=>1,'day_key'=>$day,'date'=>$date,'field'=>'hifz','base'=>'','value'=>'one']]);exit(0);}catch(Throwable $e){fwrite(STDERR,$e->getMessage()."\n");exit(1);}}$children[]=$pid;
}
foreach($children as $pid){pcntl_waitpid($pid,$status);check(pcntl_wexitstatus($status)===0,'concurrent diary worker commits');}
$pdo=connectAudit();$GLOBALS['pdo']=$pdo;
check((int)$pdo->query("SELECT COUNT(*) FROM plan_assignment_completions WHERE student_id='diary-S' AND revoked_at IS NULL")->fetchColumn()===2,'real InnoDB contention preserves two dated diary completions');
$e=json_decode($pdo->query("SELECT value FROM app_state WHERE `key`='grades'")->fetchColumn(),true);
check(count($e['scopes']['term-A']['diary-S'][1]['days'])===2,'both grades remain in their semester after concurrent recording');
$pdo->exec("CREATE TRIGGER reject_grade BEFORE UPDATE ON app_state FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='isolated grade failure'");
$failed=['student_id'=>'diary-S','expected_assignment_id'=>'diary-A','operation_id'=>'mysql-partial-failure','task_type'=>'hifz','tap'=>'one','diary'=>['semester_id'=>'term-A','week_number'=>1,'day_key'=>'tue','date'=>'2026-10-13','field'=>'hifz','base'=>'','value'=>'one']];
try{plans_record_diary($pdo,1,require_auth(),$failed);throw new RuntimeException('injected failure not detected');}catch(PDOException $error){check(str_contains($error->getMessage(),'isolated grade failure'),'real MySQL grade failure is surfaced');}
$pdo->exec('DROP TRIGGER reject_grade');
check((int)$pdo->query("SELECT COUNT(*) FROM plan_assignment_completions WHERE student_id='diary-S' AND revoked_at IS NULL")->fetchColumn()===2,'MySQL rollback leaves neither extra grade nor extra completion');
echo "MySQL diary migration, unique-current constraint, concurrency and rollback acceptance complete.\n";
