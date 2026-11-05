<?php
declare(strict_types=1);
class BatchFailure extends RuntimeException {}
class BatchDatabase extends PDO {
    public function __construct() { parent::__construct('sqlite::memory:'); $this->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION); }
    public function prepare(string $query,array $options=[]):PDOStatement|false {
        $query=str_replace('ON DUPLICATE KEY UPDATE','ON CONFLICT DO UPDATE SET',$query);
        $query=preg_replace('/VALUES\((\w+)\)/','excluded.$1',$query);
        return parent::prepare($query,$options);
    }
}
function db():PDO{return $GLOBALS['pdo'];}
function require_auth():array{return ['complexId'=>1,'role'=>'manager'];}
function require_complex_id(array $auth):int{return 1;}
function json_input():array{return $GLOBALS['input'];}
function error_response(string $message,int $status=400):never{throw new BatchFailure('batch rejected '.$status);}
function json_response(array $response):void{$GLOBALS['response']=$response;}
function table_column_exists(PDO $pdo,string $table,string $column):bool{
    foreach($pdo->query('PRAGMA table_info('.$table.')')->fetchAll(PDO::FETCH_ASSOC)as$row)if($row['name']===$column)return true;return false;
}
require __DIR__.'/../api/routes/students.php';require __DIR__.'/../api/routes/halaqat.php';
function check(bool $ok,string $label):void{if(!$ok)throw new LogicException($label);echo "PASS: $label\n";}
function fixture():BatchDatabase{
    $pdo=new BatchDatabase();$GLOBALS['pdo']=$pdo;
    $pdo->exec('CREATE TABLE students(id TEXT PRIMARY KEY,complex_id INTEGER,name TEXT,halaqa_id INTEGER,national_id TEXT,parent_phone TEXT,student_phone TEXT,level TEXT,level_type TEXT,institute_level TEXT,phase_number INTEGER,assigned_to TEXT,assigned_assistant_code TEXT,memorized TEXT)');
    $pdo->exec('CREATE TABLE halaqat(complex_id INTEGER,id INTEGER PRIMARY KEY,name TEXT,is_talqeen INTEGER,teacher_name TEXT,teacher_code TEXT,assistant_name TEXT,assistant_code TEXT,extra_assistants TEXT)');
    return $pdo;
}
foreach(['students','halaqat']as$table){
    $pdo=fixture();$handler='handle_upsert_'.$table;
    $rows=$table==='students'?[['id'=>'fixture-1','name'=>'fixture','halaqa_id'=>1,'national_id'=>'fixture'],['id'=>'fixture-2','name'=>'second','halaqa_id'=>1,'national_id'=>'second']]:[['id'=>1,'name'=>'fixture'],['id'=>2,'name'=>'second']];
    $GLOBALS['input']=[$table=>$rows];$handler();$handler();
    check((int)$pdo->query('SELECT COUNT(*) FROM '.$table)->fetchColumn()===2,$table.' retry upserts without duplicate rows');
    $before=$pdo->query('SELECT * FROM '.$table.' ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
    $rows[0]['name']='must roll back';$GLOBALS['input']=[$table=>$rows];
    $second=$table==='students'?"'fixture-2'":'2';
    $pdo->exec('CREATE TRIGGER reject_second BEFORE UPDATE ON '.$table.' WHEN NEW.id='.$second." BEGIN SELECT RAISE(ABORT,'fixture second row failure'); END");
    try{$handler();throw new LogicException('Expected write failure');}catch(BatchFailure){}
    check(!$pdo->inTransaction()&&$pdo->query('SELECT * FROM '.$table.' ORDER BY id')->fetchAll(PDO::FETCH_ASSOC)===$before,$table.' second-row database failure rolls back first row and leaves history intact');
    $pdo->exec('DROP TRIGGER reject_second');
    $rows[1]['complex_id']=2;$GLOBALS['input']=[$table=>$rows];
    try{$handler();throw new LogicException('Expected validation failure');}catch(BatchFailure){}
    check($pdo->query('SELECT * FROM '.$table.' ORDER BY id')->fetchAll(PDO::FETCH_ASSOC)===$before,$table.' existing tenant validation runs before any batch write');
}
echo "SQLite validates transaction rollback and original field/tenant behavior; it does not prove MySQL locking or end-to-end import/link atomicity.\n";
