<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
umask(0077);$stage='identity';
try{
 $root=realpath($argv[1]??'');$home=realpath($argv[2]??'');$target='u112851217_msht_test';
 if(!$root||!$home||$root!==$home.'/domains/msht.io/public_html/api')throw new RuntimeException('unexpected_main_api_root');
 require $root.'/config.php';if(DB_NAME!=='u112851217_msht_io')throw new RuntimeException('unexpected_production_identity');
 $private=$home.'/.qhp-private';$config=$private.'/msht-test.php';$backupRoot=$home.'/.qhp-db-backups';
 foreach([$private,$config,$backupRoot]as$path)if(realpath($path)!==$path||is_link($path)||(fileperms($path)&0077)!==0)throw new RuntimeException('unsafe_private_path');
 $settings=qhp_load_private_test_config((string)file_get_contents($config));
 if($settings['database']!==$target||$settings['user']===DB_USER||!preg_match('/^[A-Za-z0-9.:-]+$/D',$settings['host']))throw new RuntimeException('test_credentials_not_independent');
 $lockPath=$private.'/test-restore.lock';if(is_link($lockPath))throw new RuntimeException('unsafe_restore_lock');$lock=fopen($lockPath,'c');if(!$lock||!flock($lock,LOCK_EX|LOCK_NB))throw new RuntimeException('restore_already_running');
 $stage='latest_archive';$candidates=[];
 foreach(new DirectoryIterator($backupRoot)as$item)if($item->isDir()&&!$item->isLink()&&preg_match('/^\d{8}T\d{6}Z-[a-f0-9]{10}$/D',$item->getFilename()))$candidates[]=$item->getFilename();
 rsort($candidates,SORT_STRING);$source=null;$manifest=null;
 foreach($candidates as$id){$directory=$backupRoot.'/'.$id;$path=$directory.'/manifest.json';$candidate=$directory.'/production.sql.gz';if(!is_file($path))continue;foreach([$directory,$path,$candidate]as$p)if(realpath($p)!==$p||is_link($p)||(fileperms($p)&0077)!==0)throw new RuntimeException('unsafe_source_archive_path');$m=json_decode((string)file_get_contents($path),true,512,JSON_THROW_ON_ERROR);if(($m['backup_id']??null)!==$id||($m['production_record_writes']??null)!==false)throw new RuntimeException('unexpected_backup_manifest');$source=$candidate;$manifest=$m;break;}
 if($source===null)throw new RuntimeException('no_private_production_archive');
 $stage='test_grants';$pdo=new PDO('mysql:host='.$settings['host'].';dbname='.$target.';charset=utf8mb4',$settings['user'],$settings['password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::MYSQL_ATTR_MULTI_STATEMENTS=>false]);qhp_restore_identity($pdo,$target);
 $stage='private_test_restore';$directory=$private.'/restore-'.$manifest['backup_id'].'-'.bin2hex(random_bytes(5));if(!mkdir($directory,0700))throw new RuntimeException('private_restore_directory_unavailable');
 $report=qhp_restore_apply($pdo,$settings,$target,$source,$manifest,$directory);
 $stage='restored_schema_compatibility';$pdo->exec('SET TRANSACTION READ ONLY');$pdo->beginTransaction();$report['application_schema']=schema_inspect($pdo);$pdo->rollBack();
 $report['restored_database']=$target;$report['verified_at_utc']=gmdate('c');$report['private_test_backup_location']=basename($directory);$report['main_api_path_verified']=true;
 if(!file_put_contents($directory.'/verified.json',json_encode($report,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR)."\n",LOCK_EX))throw new RuntimeException('restore_receipt_write_failed');
 echo json_encode($report,JSON_THROW_ON_ERROR)."\n";
}catch(Throwable $error){
 if(isset($pdo)&&$pdo->inTransaction())$pdo->rollBack();
 $reason=$error instanceof RuntimeException&&!$error instanceof PDOException&&preg_match('/^[a-z_]+$/D',$error->getMessage())?$error->getMessage():null;
 echo json_encode(['status'=>'restore_incomplete','stage'=>$stage,'reason'=>$reason,'format'=>$error instanceof QhpDumpFormatException?$error->shape:null,'errno'=>$error instanceof PDOException?(int)($error->errorInfo[1]??0):null,'production_writes'=>false])."\n";exit(1);
}
