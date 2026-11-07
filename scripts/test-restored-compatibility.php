<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
umask(0077);$stage='verified_restore_identity';
try{
 $home=realpath($argv[2]??'');$api=realpath($argv[1]??'');$target='u112851217_msht_test';if(!$home||$api!==$home.'/domains/msht.io/public_html/api')throw new RuntimeException('unexpected_main_api_path');
 require $api.'/config.php';if(DB_NAME!=='u112851217_msht_io')throw new RuntimeException('unexpected_production_identity');
 $private=$home.'/.qhp-private';$config=$private.'/msht-test.php';$receiptPath=$private.'/restore-20261106T214933Z-bf6c641a1f-7601528055/verified.json';
 foreach([$private,$config,dirname($receiptPath),$receiptPath]as$p)if(realpath($p)!==$p||is_link($p)||(fileperms($p)&0077)!==0)throw new RuntimeException('unsafe_private_path');
 $receipt=json_decode((string)file_get_contents($receiptPath),true,512,JSON_THROW_ON_ERROR);
 if(($receipt['status']??null)!=='independent_restore_verified'||($receipt['restored_database']??null)!==$target||($receipt['source_sha256']??null)!=='9bb5a373ab64a9bd7ced51cd2e8b075e239b71044a48809ee821e1304dda8021'||($receipt['schema_and_values_roundtrip_match']??null)!==true)throw new RuntimeException('verified_restore_receipt_required');
 $settings=qhp_load_private_test_config((string)file_get_contents($config));if($settings['user']===DB_USER||!preg_match('/^[A-Za-z0-9.:-]+$/D',$settings['host']))throw new RuntimeException('test_credentials_not_independent');
 $lockPath=$private.'/test-restore.lock';if(is_link($lockPath))throw new RuntimeException('unsafe_restore_lock');$lock=fopen($lockPath,'c');if(!$lock||!flock($lock,LOCK_EX|LOCK_NB))throw new RuntimeException('test_operation_already_running');
 $pdo=new PDO('mysql:host='.$settings['host'].';dbname='.$target.';charset=utf8mb4',$settings['user'],$settings['password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::MYSQL_ATTR_MULTI_STATEMENTS=>false]);qhp_restore_identity($pdo,$target);
 $stage='additive_preconditions';$schema=schema_inspect($pdo);
 if($schema['missing_columns']||$schema['missing_unique_keys']!==['evaluation_settings(complex_id)']||!$schema['app_state_capacity_ready'])throw new RuntimeException('schema_not_exact_reviewed_shape');
 if((int)$pdo->query('SELECT COUNT(*) FROM (SELECT complex_id FROM evaluation_settings GROUP BY complex_id HAVING COUNT(*)>1) AS duplicate_complexes')->fetchColumn()!==0)throw new RuntimeException('duplicate_settings_not_modified');
 $directory=$private.'/compatibility-'.bin2hex(random_bytes(8));if(!mkdir($directory,0700))throw new RuntimeException('private_compatibility_directory_failed');
 $before=qhp_restore_archive(qhp_restore_dump($settings,$target,$directory,'before-index'));
 $expected=qhp_restore_archive(dirname($receiptPath).'/restored-roundtrip.sql.gz');
 if($before!==$expected)throw new RuntimeException('test_data_changed_since_verified_restore');
 $stage='test_index_only';qhp_restore_identity($pdo,$target);
 $pdo->exec('ALTER TABLE evaluation_settings ADD UNIQUE KEY uk_qhp_evaluation_complex_id (complex_id), ALGORITHM=INPLACE, LOCK=NONE');
 $stage='compatibility_verification';$after=qhp_restore_archive(qhp_restore_dump($settings,$target,$directory,'after-index'));$schema=schema_inspect($pdo);
 if(array_keys($before)!==array_keys($after)||!$schema['ready'])throw new RuntimeException('candidate_schema_not_ready');
 foreach($before as$table=>$meta){$actual=$after[$table];if($meta['row_count']!==$actual['row_count']||!hash_equals($meta['data_sha256'],$actual['data_sha256'])||($table!=='evaluation_settings'&&$meta['schema_sha256']!==$actual['schema_sha256']))throw new RuntimeException('unexpected_test_table_change');}
 $report=['status'=>'test_compatibility_verified','test_index_added'=>true,'candidate_schema_ready'=>true,'all_row_values_unchanged'=>true,'rows_verified'=>array_sum(array_column($after,'row_count')),'table_count'=>count($after),'production_database_connected'=>false,'production_writes'=>false,'retry_delay_configurable'=>$schema['retry_delay_configurable']];
 file_put_contents($directory.'/verified.json',json_encode($report,JSON_THROW_ON_ERROR)."\n",LOCK_EX);echo json_encode($report,JSON_THROW_ON_ERROR)."\n";
}catch(Throwable $e){echo json_encode(['status'=>'test_compatibility_incomplete','stage'=>$stage,'reason'=>$e instanceof RuntimeException&&!$e instanceof PDOException&&preg_match('/^[a-z_]+$/D',$e->getMessage())?$e->getMessage():null,'errno'=>$e instanceof PDOException?(int)($e->errorInfo[1]??0):null,'production_writes'=>false])."\n";exit(1);}
