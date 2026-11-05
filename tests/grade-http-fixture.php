<?php
declare(strict_types=1);
// Synthetic tokens and a file under the OS test directory only. Never loads production configuration.
$fixture=getenv('QHP_FIXTURE_DB');
if(!$fixture || !str_starts_with(basename($fixture),'qhp-atomic-') || !is_dir(dirname($fixture)))exit(1);
define('QHP_GRADE_WRITES_V1',true);
class HttpFixtureDatabase extends PDO {
 public function __construct(string $file){parent::__construct('sqlite:'.$file);$this->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);$this->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE,PDO::FETCH_ASSOC);}
 public function prepare(string $query,array $options=[]):PDOStatement|false{
  if(str_contains($query,'information_schema.tables'))$query="SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?";
  $query=str_replace(' FOR UPDATE','',$query);
  $query=str_replace('ON DUPLICATE KEY UPDATE value = ?','ON CONFLICT DO UPDATE SET value = ?',$query);
  $query=str_replace('ON DUPLICATE KEY UPDATE direct_version=?,subtree_version=?,updated_at=CURRENT_TIMESTAMP','ON CONFLICT(context_id,store_key,path_sha256) DO UPDATE SET direct_version=?,subtree_version=?,updated_at=CURRENT_TIMESTAMP',$query);
  return parent::prepare($query,$options);
 }
}
$pdo=new HttpFixtureDatabase($fixture);
function db():PDO{return $GLOBALS['pdo'];}
function table_column_exists(PDO $pdo,string $table,string $column):bool{foreach($pdo->query('PRAGMA table_info('.$table.')')->fetchAll()as$row)if($row['name']===$column)return true;return false;}
function require_auth():array{$token=$_SERVER['HTTP_AUTHORIZATION']??'';if(!in_array($token,['Bearer fixture-teacher','Bearer fixture-assistant'],true))error_response('Unauthenticated',401);return ['role'=>$token==='Bearer fixture-teacher'?'teacher':'assistant','complexId'=>1,'halaqaId'=>1];}
function require_complex_id(array $auth):int{return 1;}
function json_input():array{return json_decode(file_get_contents('php://input'),true,512,JSON_THROW_ON_ERROR);}
function error_response(string $message,int $status=400):never{http_response_code($status);json_response(['error'=>$message]);}
function json_response(mixed $value):never{header('Content-Type: application/json');echo json_encode($value,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);exit;}
require __DIR__.'/../api/routes/app_state.php';require __DIR__.'/../api/routes/plans.php';
if(PHP_SAPI==='cli'){
 $pdo->exec('CREATE TABLE app_state(complex_id INTEGER NOT NULL,`key` TEXT NOT NULL,value TEXT,UNIQUE(complex_id,`key`));CREATE TABLE semesters(id INTEGER PRIMARY KEY,complex_id INTEGER,is_active INTEGER);INSERT INTO semesters VALUES(1,1,1);CREATE TABLE grade_cell_versions(context_id INTEGER,store_key TEXT,path_sha256 TEXT,path_json TEXT,direct_version TEXT,subtree_version TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(context_id,store_key,path_sha256));CREATE TABLE grade_operation_receipts(context_id INTEGER,store_key TEXT,operation_id TEXT,input_sha256 TEXT,PRIMARY KEY(context_id,store_key,operation_id))');
 app_state_upsert($pdo,'grades',json_decode('{"S":{"1":{"days":{"sun":{"hifz":"","muraja":"","attendance":""}}}},"historic":{"8":{"keep":0}}}'),1);
 app_state_upsert($pdo,'grade_plan_event:fixture',(object)['internal'=>'fixture-preserved'],1);exit;
}
try{if($_SERVER['REQUEST_METHOD']==='GET')handle_list_app_state();else handle_set_app_state();}catch(Throwable $error){error_response($error->getMessage(),500);}
