<?php
declare(strict_types=1);
define('DB_NAME','private-database-name');
require __DIR__ . '/../api/health-status.php';
class HealthFixture extends PDO {
    public function __construct(){parent::__construct('sqlite::memory:');}
    public function query(string $query, ?int $fetchMode=null, mixed ...$args): PDOStatement|false {
        if(str_contains($query,'information_schema')){
            $error=new PDOException('secret-host private-query');$error->errorInfo=['42S22',1054,'secret-host private-query'];throw $error;
        }
        return parent::query($query,$fetchMode,...$args);
    }
}
function db():PDO {
    if(!empty($GLOBALS['connection_fail'])){$error=new PDOException('secret-password');$error->errorInfo=['HY000',2002,'secret-password'];throw $error;}
    return new HealthFixture();
}
function json_response(mixed $data,int $status=200):void {$GLOBALS['response']=[$data,$status];}
handle_health_check();
[$body,$status]=$GLOBALS['response'];
if($status!==503||$body['checks']['db_connect']!=='ok'||$body['checks']['failure_category']!=='schema')throw new LogicException('Schema failure mislabeled as connection failure');
$encoded=json_encode($body);
foreach(['secret-','private-','db_host','tables','php'] as $forbidden)if(str_contains($encoded,$forbidden))throw new LogicException('Diagnostic leak');
echo "PASS: successful connection remains ok when later metadata SQL fails; no private response details\n";
$GLOBALS['connection_fail']=true;handle_health_check();
[$body,$status]=$GLOBALS['response'];
if($status!==503||$body['checks']['db_connect']!=='failed'||$body['checks']['failure_category']!=='connection')throw new LogicException('Connection failure not distinct');
echo "PASS: genuine connection failure identified separately\n";
