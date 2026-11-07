<?php
declare(strict_types=1);
define('QHP_GRADE_WRITES_V1',true);define('QHP_SHARED_GRADE_WRITES_V1',true);define('QHP_SEMESTER_STORES_V1',true);
class SemesterPlanDatabase extends PDO {
 public function __construct(){parent::__construct('sqlite::memory:');$this->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);$this->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE,PDO::FETCH_ASSOC);}
 public function prepare(string $query,array $options=[]):PDOStatement|false {
  if(str_contains($query,'information_schema.tables'))$query="SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?";
  $query=str_replace(' FOR UPDATE','',$query);$query=str_replace('ON DUPLICATE KEY UPDATE value = ?','ON CONFLICT DO UPDATE SET value = ?',$query);
  $query=str_replace('ON DUPLICATE KEY UPDATE direct_version=?,subtree_version=?,updated_at=CURRENT_TIMESTAMP','ON CONFLICT(context_id,store_key,path_sha256) DO UPDATE SET direct_version=?,subtree_version=?,updated_at=CURRENT_TIMESTAMP',$query);return parent::prepare($query,$options);
 }
}
function table_column_exists(PDO $pdo,string $table,string $column):bool{foreach($pdo->query('PRAGMA table_info('.$table.')')->fetchAll()as$row)if($row['name']===$column)return true;return false;}
function check(bool $ok,string $label):void{if(!$ok)throw new LogicException($label);echo "PASS: $label\n";}
require __DIR__.'/../api/routes/app_state.php';require __DIR__.'/../api/routes/plans.php';require __DIR__.'/grade-cell-cases.php';require __DIR__.'/semester-plan-cases.php';
$pdo=new SemesterPlanDatabase();$pdo->exec('CREATE TABLE app_state(complex_id INT,`key` TEXT,value TEXT,UNIQUE(complex_id,`key`));CREATE TABLE semesters(id INT PRIMARY KEY,complex_id INT,is_active INT);INSERT INTO semesters VALUES(1,1,1),(2,1,0);CREATE TABLE grade_cell_versions(context_id INT,store_key TEXT,path_sha256 TEXT,path_json TEXT,direct_version TEXT,subtree_version TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(context_id,store_key,path_sha256));CREATE TABLE grade_operation_receipts(context_id INT,store_key TEXT,operation_id TEXT,input_sha256 TEXT,PRIMARY KEY(context_id,store_key,operation_id))');semesterPlanCases($pdo);
