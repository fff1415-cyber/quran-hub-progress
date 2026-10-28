<?php
declare(strict_types=1);
class IndependentFailure extends RuntimeException {}
class SettingsFixture extends PDO {
    public function __construct() { parent::__construct('sqlite::memory:'); $this->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $this->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC); }
    public function prepare(string $query, array $options=[]): PDOStatement|false {
        if (str_contains($query,'information_schema.tables')) $query="SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?";
        return parent::prepare(str_replace('INSERT IGNORE','INSERT OR IGNORE',$query),$options);
    }
    public function exec(string $statement): int|false { return parent::exec(str_replace('INSERT IGNORE','INSERT OR IGNORE',$statement)); }
}
function table_column_exists(PDO $pdo,string $table,string $column):bool { foreach($pdo->query("PRAGMA table_info($table)")->fetchAll() as $row)if($row['name']===$column)return true;return false; }
function db():PDO { return $GLOBALS['pdo']; }
function require_auth():array {return $GLOBALS['auth'];}
function require_complex_id(array $auth):int {return $auth['complexId'];}
function json_input():array {return $GLOBALS['input'];}
function json_response(mixed $value):void {$GLOBALS['response']=$value;}
function error_response(string $message,int $status=400):never {throw new IndependentFailure($message,$status);}
function check(bool $ok,string $label):void {if(!$ok)throw new RuntimeException($label);echo "PASS: $label\n";}
require __DIR__.'/../api/routes/evaluation_settings.php';
$GLOBALS['pdo']=$pdo=new SettingsFixture();$GLOBALS['auth']=['role'=>'manager','complexId'=>1];
$columns=[];foreach(eval_settings_defaults() as $key=>$value)$columns[]="$key NUMERIC DEFAULT $value";
$pdo->exec('CREATE TABLE evaluation_settings(complex_id INTEGER PRIMARY KEY,'.implode(',',$columns).')');
handle_get_evaluation_settings();check((int)$pdo->query('SELECT COUNT(*) FROM evaluation_settings')->fetchColumn()===0,'GET returns server defaults without writing a row');
$GLOBALS['input']=['settings'=>array_merge(eval_settings_defaults(),['error_deduction'=>0])];handle_put_evaluation_settings();
check($GLOBALS['response']['settings']['error_deduction']===0,'confirmed settings preserve a valid zero');
$pdo->exec("CREATE TRIGGER fail_settings_update BEFORE UPDATE ON evaluation_settings BEGIN SELECT RAISE(ABORT,'fixture failed update'); END");
$GLOBALS['auth']['complexId']=2;$GLOBALS['input']['settings']['error_deduction']=7;unset($GLOBALS['response']);
try {handle_put_evaluation_settings();throw new RuntimeException('expected fixture failure');}catch(PDOException $error){check(str_contains($error->getMessage(),'fixture failed update'),'PUT failure reaches the caller');}
check(!isset($GLOBALS['response'])&&(int)$pdo->query('SELECT COUNT(*) FROM evaluation_settings WHERE complex_id=2')->fetchColumn()===0,'failed first save rolls back initialization and never confirms');
check((int)$pdo->query('SELECT error_deduction FROM evaluation_settings WHERE complex_id=1')->fetchColumn()===0,'another complex settings remain untouched');
foreach(['supervisor','musammi','teacher','student','parent'] as $role){$GLOBALS['auth']['role']=$role;try{handle_put_evaluation_settings();throw new RuntimeException('unexpected role grant');}catch(IndependentFailure $error){check($error->getCode()===403,'existing '.$role.' write refusal preserved');}}
$pdo->exec('DROP TABLE evaluation_settings');$pdo->exec('CREATE TABLE evaluation_settings(id INTEGER PRIMARY KEY,'.implode(',',$columns).')');
$GLOBALS['auth']=['role'=>'manager','complexId'=>1];handle_get_evaluation_settings();check((int)$pdo->query('SELECT COUNT(*) FROM evaluation_settings')->fetchColumn()===0,'legacy global-schema GET is read-only too');
handle_put_evaluation_settings();check((int)$pdo->query('SELECT COUNT(*) FROM evaluation_settings')->fetchColumn()===1&&$GLOBALS['response']['settings']['error_deduction']===7,'legacy global-schema explicit PUT still works');
