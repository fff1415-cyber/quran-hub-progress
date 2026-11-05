<?php
declare(strict_types=1);
class DateFailure extends RuntimeException {}
function require_auth():array{return $GLOBALS['auth'];}
function require_complex_id(array $auth):int{return 1;}
function json_input():array{return $GLOBALS['input'];}
function db():PDO{return $GLOBALS['pdo'];}
function error_response(string $message,int $status=400):never{throw new DateFailure($message,$status);}
function json_response(mixed $response):void{$GLOBALS['response']=$response;}
function new_uuid():string{return 'date-fixture-'.++$GLOBALS['uuid'];}
function assert_row_belongs_to_complex(?int $actual,int $expected):void{if($actual!==$expected)error_response('Forbidden',403);}
function table_column_exists(PDO $pdo,string $table,string $column):bool{foreach($pdo->query('PRAGMA table_info('.$table.')')->fetchAll(PDO::FETCH_ASSOC)as$row)if($row['name']===$column)return true;return false;}
function check(bool $ok,string $label):void{if(!$ok)throw new LogicException($label);echo "PASS: $label\n";}
function expectFailure(callable $fn,string $contains):void{try{$fn();}catch(DateFailure $e){check(str_contains($e->getMessage(),$contains),$contains);return;}throw new LogicException('Expected date rejection');}
require __DIR__.'/../api/routes/plans.php';
class DateDatabase extends PDO {
    public function __construct(){parent::__construct('sqlite::memory:');$this->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);$this->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE,PDO::FETCH_ASSOC);}
    public function prepare(string $query,array $options=[]):PDOStatement|false {
        if(str_contains($query,'information_schema.tables'))$query="SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?";
        $query=str_replace('ON DUPLICATE KEY UPDATE completed_at = VALUES(completed_at), recorded_by = VALUES(recorded_by), assignment_id = VALUES(assignment_id)','ON CONFLICT DO UPDATE SET completed_at=excluded.completed_at,recorded_by=excluded.recorded_by,assignment_id=excluded.assignment_id',$query);
        return parent::prepare($query,$options);
    }
}
$pdo=new DateDatabase();$GLOBALS['pdo']=$pdo;$GLOBALS['uuid']=0;
$GLOBALS['auth']=['role'=>'manager','complexId'=>1,'name'=>'fixture'];
$pdo->exec("CREATE TABLE students(id TEXT PRIMARY KEY,complex_id INTEGER);INSERT INTO students VALUES('S',1);
CREATE TABLE education_plans(id TEXT PRIMARY KEY,complex_id INTEGER,track TEXT,level_number INTEGER);INSERT INTO education_plans VALUES('P',1,'gold',1001);
CREATE TABLE student_plan_assignments(id TEXT PRIMARY KEY,student_id TEXT,plan_id TEXT,assigned_at TEXT,start_segment_index INTEGER,start_muraja_segment INTEGER,status TEXT,plan_start_date TEXT,transferred_at TEXT);INSERT INTO student_plan_assignments VALUES('A','S','P','2026-10-01 00:00:00',1,NULL,'active','2026-10-01',NULL);
CREATE TABLE plan_segments(plan_id TEXT,segment_index INTEGER);INSERT INTO plan_segments VALUES('P',1),('P',2);
CREATE TABLE segment_completions(id TEXT PRIMARY KEY,student_id TEXT,plan_id TEXT,segment_index INTEGER,task_type TEXT,completed_at TEXT,recorded_by TEXT,assignment_id TEXT,created_at TEXT DEFAULT '2026-10-02 00:00:00',UNIQUE(student_id,plan_id,segment_index,task_type));");
foreach(['hifz','rabt','muraja']as$task){
    $GLOBALS['input']=['student_id'=>'S','task_type'=>$task,'tap'=>'one','expected_assignment_id'=>'A','completed_at'=>'2026-10-05'];
    handle_apply_plan_input();
    $query=$pdo->prepare('SELECT completed_at,assignment_id FROM segment_completions WHERE task_type=?');$query->execute([$task]);$row=$query->fetch();
    check($row['completed_at']==='2026-10-05'&&$row['assignment_id']==='A',$task.' actual handler stores selected historical date and existing assignment identity');
}
$before=$pdo->query('SELECT * FROM segment_completions ORDER BY task_type')->fetchAll();
foreach(['2026-02-30','2026-2-01','not-a-date']as$invalid){$GLOBALS['input']['completed_at']=$invalid;expectFailure(fn()=>handle_apply_plan_input(),'تاريخ الإنجاز غير صالح');}
check($pdo->query('SELECT * FROM segment_completions ORDER BY task_type')->fetchAll()===$before,'invalid historical dates never alter existing completions');
echo "Partial date correction only: legacy apply/undo atomicity and idempotency are not claimed fixed.\n";
