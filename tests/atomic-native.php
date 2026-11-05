<?php
declare(strict_types=1);
if(getenv('AUDIT_MYSQL_DSN')!=='mysql:host=127.0.0.1;port=3307;dbname=audit_test;charset=utf8mb4')throw new RuntimeException('Only the disposable CI database is allowed');
function connectFixture():PDO{return new PDO(getenv('AUDIT_MYSQL_DSN'),'audit','audit_only',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);}
function table_column_exists(PDO $pdo,string $table,string $column):bool{$s=$pdo->prepare('SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?');$s->execute([$table,$column]);return (int)$s->fetchColumn()>0;}
function check(bool $ok,string $label):void{if(!$ok)throw new RuntimeException($label);echo "PASS: $label\n";}
require __DIR__.'/../api/routes/app_state.php';require __DIR__.'/../api/routes/plans.php';
$pdo=connectFixture();$pdo->exec('CREATE TABLE app_state(complex_id INT NOT NULL,`key` VARCHAR(100) NOT NULL,value LONGTEXT,UNIQUE(complex_id,`key`)) ENGINE=InnoDB;CREATE TABLE semesters(id INT PRIMARY KEY,complex_id INT,is_active INT) ENGINE=InnoDB;INSERT INTO semesters VALUES(1,1,1),(2,1,0),(3,2,1)');
require __DIR__.'/grade-cell-native-cases.php';
require __DIR__.'/atomic-plan-cases.php';atomicPlanCases($pdo);
