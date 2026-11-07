<?php
declare(strict_types=1);
if(getenv('QHP_RESTORE_FIXTURE')!=='1')throw new RuntimeException('Disposable fixture required');
require __DIR__.'/../private-snapshot-restore.php';umask(0077);
$dsn='mysql:host=127.0.0.1;port=3307;charset=utf8mb4';$options=[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::MYSQL_ATTR_MULTI_STATEMENTS=>false];
$admin=new PDO($dsn,'root','isolated_root_only',$options);
foreach(['audit_source','audit_target']as$name){$admin->exec('CREATE DATABASE '.$name.' CHARACTER SET utf8mb4');$admin->exec("CREATE USER '$name'@'%' IDENTIFIED BY 'isolated_fixture_only'");$admin->exec("GRANT ALL ON `$name`.* TO '$name'@'%'");}
$source=new PDO($dsn.';dbname=audit_source','audit_source','isolated_fixture_only',$options);$target=new PDO($dsn.';dbname=audit_target','audit_target','isolated_fixture_only',$options);
function settings(string $user):array{return ['host'=>'127.0.0.1','user'=>$user,'password'=>'isolated_fixture_only'];}
function checkRestore(bool $passed,string $label):void{if(!$passed)throw new LogicException($label);echo "PASS: $label\n";}
foreach([$source,$target]as$pdo)$pdo->exec('CREATE TABLE students(id INT PRIMARY KEY,note LONGTEXT,payload BLOB) ENGINE=InnoDB');
$insert=$source->prepare('INSERT INTO students VALUES(?,?,?)');$insert->execute([0,"نص ' مع \\ وقوس ),( وسطر\nجديد", "binary\x00"]);$insert->execute([2,null,null]);
$target->exec("INSERT INTO students VALUES(9,'old test state',NULL)");
$folder=sys_get_temp_dir().'/qhp-restore-fixture-'.bin2hex(random_bytes(8));mkdir($folder,0700);
$archive=qhp_restore_dump(settings('audit_source'),'audit_source',$folder,'fixture-source',3307,true);
$manifest=['status'=>'backup_created','consistent_snapshot'=>true,'sha256'=>hash_file('sha256',$archive),'table_count'=>1,'backup_id'=>'fixture'];
$dir=$folder.'/success';mkdir($dir,0700);$report=qhp_restore_apply($target,settings('audit_target'),'audit_target',$archive,$manifest,$dir,3307);
$select='SELECT * FROM students ORDER BY id';$rows=$source->query($select)->fetchAll(PDO::FETCH_ASSOC);
checkRestore($report['schema_and_values_roundtrip_match']&&$target->query($select)->fetchAll(PDO::FETCH_ASSOC)===$rows&&is_file($dir.'/test-before-restore.sql.gz'),'real dump restores exact Unicode, binary, zero/null and schema; prior test snapshot retained');
$badSql=str_replace("-- Dump completed", "INSERT INTO `students` VALUES (2,NULL,NULL);\n-- Dump completed",gzdecode(file_get_contents($archive)));
$bad=$folder.'/bad.sql.gz';file_put_contents($bad,gzencode($badSql));$fault=$manifest;$fault['sha256']=hash_file('sha256',$bad);$dir=$folder.'/failure';mkdir($dir,0700);
try{qhp_restore_apply($target,settings('audit_target'),'audit_target',$bad,$fault,$dir,3307);throw new LogicException('Expected failure');}catch(RuntimeException $error){checkRestore($error->getMessage()==='test_restore_failed_previous_test_state_verified'&&$target->query($select)->fetchAll(PDO::FETCH_ASSOC)===$rows,'late duplicate failure restores and verifies previous test state');}
foreach(["USE `audit_source`;", "INSERT INTO `students` VALUES (1,SELECT secret,NULL);", "DROP TABLE IF EXISTS `audit_source`.`students`;"]as$statement){$bad=$folder.'/unsupported.sql.gz';file_put_contents($bad,gzencode(str_replace('-- Dump completed',$statement."\n-- Dump completed",gzdecode(file_get_contents($archive)))));try{qhp_restore_archive($bad);throw new LogicException('Unsafe SQL accepted');}catch(RuntimeException){}}
checkRestore(true,'cross-schema commands and nonliteral insert values are refused before writes');
$admin->exec("GRANT SELECT ON `audit_source`.* TO 'audit_target'@'%'");
$target=new PDO($dsn.';dbname=audit_target','audit_target','isolated_fixture_only',$options);
try{qhp_restore_identity($target,'audit_target');throw new LogicException('Broader grant accepted');}catch(RuntimeException $error){checkRestore($error->getMessage()==='test_user_has_other_scope','broader account grants are refused');}
checkRestore($source->query($select)->fetchAll(PDO::FETCH_ASSOC)===$rows,'source remained byte-for-value unchanged');
