<?php
declare(strict_types=1);
const LOCK_ROLLBACK_DSN='mysql:host=127.0.0.1;port=3307;dbname=audit_test;charset=utf8mb4';
if(getenv('AUDIT_MYSQL_DSN')!==LOCK_ROLLBACK_DSN||!isset($argv[1],$argv[2])||!in_array($argv[2],['candidate-write','compatible-write','read'],true))throw new RuntimeException('isolated rollback fixture required');
$GLOBALS['pdo']=$pdo=new PDO(LOCK_ROLLBACK_DSN,'audit','audit_only',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
function db():PDO{return $GLOBALS['pdo'];}
function table_column_exists(PDO $pdo,string $table,string $column):bool{$query=$pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?');$query->execute([$table,$column]);return (bool)$query->fetchColumn();}
function require_auth():array{return ['role'=>'manager','complexId'=>1];}
function require_complex_id(array $auth):int{return 1;}
function json_input():array{return $GLOBALS['input'];}
function json_response(mixed $value):void{$GLOBALS['response']=$value;}
function error_response(string $message,int $status=400):never{throw new RuntimeException($message,$status);}
function check(bool $ok,string $message):void{if(!$ok)throw new RuntimeException($message);echo 'PASS: '.$message."\n";}
require $argv[1];
$raw=$pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='grades'")->fetchColumn();
if($argv[2]==='candidate-write') {
    $pdo->exec('CREATE TABLE fixture_existing_grade_lock_backup(id INT PRIMARY KEY,raw_value LONGTEXT NOT NULL)');
    $pdo->prepare('INSERT INTO fixture_existing_grade_lock_backup VALUES(1,?)')->execute([$raw]);
}
$expected=json_decode($pdo->query('SELECT raw_value FROM fixture_existing_grade_lock_backup WHERE id=1')->fetchColumn(),false,512,JSON_THROW_ON_ERROR);
if(!($expected instanceof stdClass))throw new RuntimeException('fixture grade root is not an object');
if($argv[2]!=='candidate-write')$expected->{'fixture-lock-candidate'}=(object)['zero'=>0,'blank'=>'','unknown'=>null];
if($argv[2]==='read')$expected->{'fixture-lock-compatible'}=(object)['zero'=>0,'blank'=>'','unknown'=>null];
check(json_encode(json_decode($raw,false),JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)===json_encode($expected,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),'selected API reads all prior and newer grade fields without replacing their values');
if($argv[2]!=='read') {
    $expected->{$argv[2]==='candidate-write'?'fixture-lock-candidate':'fixture-lock-compatible'}=(object)['zero'=>0,'blank'=>'','unknown'=>null];
    $GLOBALS['input']=['key'=>'grades','value'=>get_object_vars($expected)];handle_set_app_state();
    $actual=$pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='grades'")->fetchColumn();
    check(json_encode(json_decode($actual,false),JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)===json_encode($expected,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),'compatible/native save keeps every existing/new field, zero, blank, null and object shape');
}
