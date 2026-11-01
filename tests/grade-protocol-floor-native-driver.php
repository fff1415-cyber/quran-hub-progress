<?php
declare(strict_types=1);
$dsn=getenv('AUDIT_MYSQL_DSN')?:'';
if(!str_contains($dsn,'port=3307;dbname=audit_test'))throw new RuntimeException('isolated database only');
$pdo=new PDO($dsn,'audit','audit_only',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
$GLOBALS['pdo']=$pdo;$GLOBALS['auth']=['role'=>'manager','complexId'=>1];
function db():PDO {return $GLOBALS['pdo'];}
function require_auth():array {return $GLOBALS['auth'];}
function require_role(array $roles):array {$auth=require_auth();if(!in_array($auth['role'],$roles,true))error_response('forbidden',403);return $auth;}
function require_complex_id(array $auth):int {return (int)$auth['complexId'];}
function json_input():array {return $GLOBALS['input']??[];}
function json_response(array $data,int $status=200):void {$GLOBALS['response']=$data;}
function error_response(string $message,int $status=400):never {throw new RuntimeException($message,$status);}
function check(bool $condition,string $message):void {if(!$condition)throw new RuntimeException($message);echo "PASS: ".$message."\n";}
function table_column_exists(PDO $pdo,string $table,string $column):bool {$q=$pdo->prepare('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?');$q->execute([$table,$column]);return $q->fetchColumn()!==false;}
require $argv[1];
require __DIR__.'/grade-protocol-floor-cases.php';
gradeProtocolFloorCases($pdo);
