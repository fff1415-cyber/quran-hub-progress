<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
umask(0077);$stage='scope';$indexAdded=false;
function qhp_verified_private_json(string $path):array{
 foreach([$path,dirname($path)]as$p)if(realpath($p)!==$p||is_link($p)||(fileperms($p)&0077)!==0)throw new RuntimeException('private_evidence_path_invalid');
 return json_decode((string)file_get_contents($path),true,512,JSON_THROW_ON_ERROR);
}
function qhp_eval_snapshot(PDO $pdo):array{
 $pdo->exec('SET TRANSACTION READ ONLY');$pdo->beginTransaction();
 try{
  $nulls=(int)$pdo->query('SELECT COUNT(*) FROM evaluation_settings WHERE complex_id IS NULL')->fetchColumn();
  $duplicates=(int)$pdo->query('SELECT COUNT(*) FROM (SELECT complex_id FROM evaluation_settings GROUP BY complex_id HAVING COUNT(*)>1) AS duplicate_groups')->fetchColumn();
  $rows=$pdo->query('SELECT * FROM evaluation_settings ORDER BY complex_id')->fetchAll(PDO::FETCH_ASSOC);
  return ['nulls'=>$nulls,'duplicate_groups'=>$duplicates,'count'=>count($rows),'hash'=>hash('sha256',serialize($rows))];
 }finally{$pdo->rollBack();}
}
try{
 $api=realpath($argv[1]??'');$home=realpath($argv[2]??'');$backupId=$argv[3]??'';$sha=$argv[4]??'';$restoreDir=$argv[5]??'';$compatDir=$argv[6]??'';
 if(!$home||$api!==$home.'/domains/msht.io/public_html/api'||!preg_match('/^\d{8}T\d{6}Z-[a-f0-9]{10}$/D',$backupId)||!preg_match('/^[a-f0-9]{64}$/D',$sha)||!preg_match('/^restore-'.preg_quote($backupId,'/').'-[a-f0-9]{10}$/D',$restoreDir)||!preg_match('/^compatibility-[a-f0-9]{16}$/D',$compatDir))throw new RuntimeException('invalid_evidence_or_root');
 require $api.'/config.php';if(DB_NAME!=='u112851217_msht_io')throw new RuntimeException('unexpected_production_database');
 $stage='fresh_restorable_backup';$backupDir=$home.'/.qhp-db-backups/'.$backupId;$manifest=qhp_verified_private_json($backupDir.'/manifest.json');$archive=$backupDir.'/production.sql.gz';
 $restore=qhp_verified_private_json($home.'/.qhp-private/'.$restoreDir.'/verified.json');$compat=qhp_verified_private_json($home.'/.qhp-private/'.$compatDir.'/verified.json');
 $created=strtotime($manifest['created_at_utc']??'');
 if(!$created||$created>time()||time()-$created>1800||realpath($archive)!==$archive||is_link($archive)||(fileperms($archive)&0077)!==0||($manifest['backup_id']??null)!==$backupId||($manifest['sha256']??null)!==$sha||($manifest['consistent_snapshot']??false)!==true||!hash_equals($sha,(string)hash_file('sha256',$archive)))throw new RuntimeException('fresh_archive_not_verified');
 if(($restore['status']??null)!=='independent_restore_verified'||($restore['source_sha256']??null)!==$sha||($restore['restored_database']??null)!=='u112851217_msht_test'||($restore['schema_and_values_roundtrip_match']??false)!==true||($compat['status']??null)!=='test_compatibility_verified'||($compat['source_sha256']??null)!==$sha||($compat['all_row_values_unchanged']??false)!==true||($compat['candidate_schema_ready']??false)!==true)throw new RuntimeException('fresh_test_acceptance_required');
 $stage='production_preconditions';$pdo=new PDO('mysql:host='.DB_HOST.(defined('DB_PORT')?';port='.DB_PORT:'').';dbname='.DB_NAME.';charset='.DB_CHARSET,DB_USER,DB_PASS,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::MYSQL_ATTR_MULTI_STATEMENTS=>false]);
 if($pdo->query('SELECT DATABASE()')->fetchColumn()!=='u112851217_msht_io')throw new RuntimeException('production_identity_mismatch');
 $schema=schema_inspect($pdo);if($schema['missing_columns']||$schema['missing_unique_keys']!==['evaluation_settings(complex_id)']||!$schema['app_state_capacity_ready'])throw new RuntimeException('production_schema_not_reviewed_shape');
 $engine=$pdo->query("SELECT ENGINE FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='evaluation_settings'")->fetchColumn();if(strcasecmp((string)$engine,'InnoDB')!==0)throw new RuntimeException('online_engine_not_confirmed');
 $pdo->exec('SET SESSION lock_wait_timeout=3');if((int)$pdo->query('SELECT @@SESSION.lock_wait_timeout')->fetchColumn()!==3)throw new RuntimeException('short_metadata_timeout_not_confirmed');
 $before=qhp_eval_snapshot($pdo);if($before['nulls']!==0||$before['duplicate_groups']!==0)throw new RuntimeException('duplicate_or_null_values_refused');
 $stage='only_approved_online_index';$started=microtime(true);
 $pdo->exec('ALTER TABLE `u112851217_msht_io`.`evaluation_settings` ADD UNIQUE KEY `uk_qhp_evaluation_complex_id` (`complex_id`), ALGORITHM=INPLACE, LOCK=NONE');$indexAdded=true;
 $milliseconds=(int)round((microtime(true)-$started)*1000);
 $stage='production_postcheck';$after=qhp_eval_snapshot($pdo);$schema=schema_inspect($pdo);
 $same=$before===$after;$report=['status'=>$same&&$schema['ready']?'approved_production_index_verified':'production_index_postcheck_requires_review','backup_id'=>$backupId,'backup_sha256'=>$sha,'fresh_backup_restored_in_test'=>true,'schema_ready'=>$schema['ready'],'rows_unchanged'=>$same,'evaluation_rows'=>$after['count'],'nulls'=>$after['nulls'],'duplicate_groups'=>$after['duplicate_groups'],'online_lock_none'=>true,'metadata_lock_wait_limit_seconds'=>3,'ddl_elapsed_ms'=>$milliseconds,'production_row_writes_by_tool'=>false];
 echo json_encode($report,JSON_THROW_ON_ERROR)."\n";if(!$same||!$schema['ready'])exit(1);
}catch(Throwable $error){echo json_encode(['status'=>'production_index_incomplete','stage'=>$stage,'reason'=>$error instanceof RuntimeException&&!$error instanceof PDOException&&preg_match('/^[a-z_]+$/D',$error->getMessage())?$error->getMessage():null,'errno'=>$error instanceof PDOException?(int)($error->errorInfo[1]??0):null,'index_statement_returned_success'=>$indexAdded,'production_row_writes_by_tool'=>false])."\n";exit(1);}
