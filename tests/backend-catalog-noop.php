<?php
declare(strict_types=1);
// Disposable SQLite only; no configuration, credentials, external requests or production connection.
class CatalogDatabase extends PDO {
 public function __construct(){parent::__construct('sqlite::memory:');$this->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);$this->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE,PDO::FETCH_ASSOC);}
 public function prepare(string $query,array $options=[]):PDOStatement|false {
  if(str_contains($query,'information_schema.tables'))$query="SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?";
  return parent::prepare(str_replace(' FOR UPDATE','',$query),$options);
 }
}
function db():PDO{return $GLOBALS['pdo'];}
function require_auth():array{return $GLOBALS['auth'];}
function require_complex_id(array $auth):int{return $auth['complexId'];}
function json_input():array{return $GLOBALS['input'];}
function json_response(mixed $value):void{$GLOBALS['response']=$value;}
function error_response(string $message,int $status=400):never{throw new RuntimeException($message,$status);}
function table_column_exists(PDO $pdo,string $table,string $column):bool {foreach($pdo->query("PRAGMA table_info($table)")->fetchAll() as $row)if($row['name']===$column)return true;return false;}
function new_uuid():string{return bin2hex(random_bytes(16));}
function check(bool $ok,string $label):void{if(!$ok)throw new RuntimeException($label);echo "PASS: $label\n";}
require $argv[1]??__DIR__.'/../api/routes/plans.php';
require __DIR__.'/catalog-noop-cases.php';
$GLOBALS['pdo']=$pdo=new CatalogDatabase();$GLOBALS['auth']=['role'=>'supervisor','complexId'=>1,'name'=>'fixture'];
$pdo->exec("CREATE TABLE education_plans(id TEXT PRIMARY KEY,complex_id INTEGER,track TEXT,level_number INTEGER,title TEXT,segment_count INTEGER,created_at TEXT,daily_hifz_faces INTEGER DEFAULT 1,daily_rabt_faces INTEGER DEFAULT 1,daily_muraja_faces INTEGER DEFAULT 1,faces_per_half INTEGER DEFAULT 1,faces_per_one INTEGER DEFAULT 1,faces_per_two INTEGER DEFAULT 2);
 CREATE TABLE plan_segments(id TEXT PRIMARY KEY,plan_id TEXT,segment_index INTEGER,hifz_plan TEXT,rabt_plan TEXT,muraja_plan TEXT,created_at TEXT);
 CREATE TABLE student_plan_assignments(id TEXT PRIMARY KEY,student_id TEXT,plan_id TEXT,status TEXT,start_segment_index INTEGER);
 CREATE TABLE segment_completions(id TEXT PRIMARY KEY,student_id TEXT,plan_id TEXT,assignment_id TEXT,segment_index INTEGER,task_type TEXT,completed_at TEXT);
 CREATE TABLE app_state(complex_id INTEGER,`key` TEXT,value TEXT);");
if(isset($argv[1])){
 // New release writes no new format. The previous reader must retain every subsequent row.
 catalogSeed($pdo);$before=catalogSnapshot($pdo);$_GET=['plan_id'=>'catalog-noop-P'];handle_plan_detail();
 check(array_column($GLOBALS['response']['segments'],'id')===['catalog-noop-seg1','catalog-noop-seg3'],'previous API reads the exact preserved new-release segment IDs');
 check(catalogSnapshot($pdo)===$before,'rollback reader preserves every new write and never restores an older database');
}else catalogNoopCases($pdo);
