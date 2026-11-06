<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
umask(0077);$stage='scope';
try{
 $root=realpath($argv[1]??'');$home=realpath($argv[2]??'');
 if(!$root||!$home||!str_starts_with($root.'/',$home.'/')||str_contains($root,'/../'))throw new RuntimeException('Invalid scope');
 require $root.'/config.php';if(DB_NAME!=='u112851217_msht_io')throw new RuntimeException('Unexpected production identity');
 $setter=$qhpSetupSetter??file_get_contents($argv[3]??'');$parser=$qhpSetupParser??file_get_contents($argv[4]??'');if(!is_string($setter)||!is_string($parser)||!str_starts_with($setter,'<?php')||!str_starts_with($parser,'<?php'))throw new RuntimeException('Setup sources absent');
 $private=$home.'/.qhp-private';$file=$private.'/msht-test.php';$stage='private_directory';
 if(is_link($private)||is_link($file))throw new RuntimeException('Unsafe symlink');
 if(!is_dir($private)&&!mkdir($private,0700))throw new RuntimeException('Private directory unavailable');
 if(realpath($private)!==$private||str_starts_with($private.'/',$root.'/'))throw new RuntimeException('Unexpected private root');
 if(!chmod($private,0700))throw new RuntimeException('Directory permissions unavailable');
 $stage='configuration';$previous=is_file($file)?file_get_contents($file):null;$preserved=false;
 if($previous===null||trim($previous)===''){
  if($previous!==null){$backup=$file.'.before-setup-'.bin2hex(random_bytes(6));$h=fopen($backup,'x');if(!$h)throw new RuntimeException('Cannot preserve original');fwrite($h,$previous);fclose($h);chmod($backup,0600);$preserved=true;}
  $temporary=$file.'.setup-'.bin2hex(random_bytes(6));$h=fopen($temporary,'x');if(!$h)throw new RuntimeException('Cannot prepare configuration');$content="<?php\nreturn ".var_export(['host'=>DB_HOST,'database'=>'u112851217_msht_test','user'=>'','password'=>''],true).";\n";if(fwrite($h,$content)!==strlen($content))throw new RuntimeException('Incomplete configuration write');fclose($h);chmod($temporary,0600);
  if(is_link($file)||($previous===null?file_exists($file):!is_file($file)||!hash_equals(hash('sha256',$previous),(string)hash_file('sha256',$file))))throw new RuntimeException('Configuration changed during setup');
  if(!rename($temporary,$file))throw new RuntimeException('Cannot save configuration');
 }
 if(!chmod($file,0600))throw new RuntimeException('Cannot secure config');
 $stage='interactive_helper';$setter=str_replace('declare(strict_types=1);',"declare(strict_types=1);\nconst QHP_DEFAULT_TEST_HOST=".var_export(DB_HOST,true).";\nconst QHP_PRODUCTION_USER_SHA256=".var_export(hash('sha256',DB_USER),true).";",$setter);
 foreach(['configure-msht-test.php'=>$setter,'private-test-config.php'=>$parser]as$name=>$content){$path=$private.'/'.$name;if(is_link($path))throw new RuntimeException('Unsafe helper link');if(is_file($path)&&file_get_contents($path)!==$content)throw new RuntimeException('Existing helper differs; kept untouched');if(!is_file($path)){$h=fopen($path,'x');if(!$h)throw new RuntimeException('Cannot install helper');fwrite($h,$content);fclose($h);}chmod($path,0600);}
 clearstatcache();$secured=(fileperms($private)&0777)===0700&&(fileperms($file)&0777)===0600;foreach(['configure-msht-test.php','private-test-config.php']as$name)$secured=$secured&&(fileperms($private.'/'.$name)&0777)===0600;
 if(!$secured)throw new RuntimeException('Permissions not confirmed');
 eval(substr($parser,5));$settings=null;try{$settings=qhp_load_private_test_config((string)file_get_contents($file));}catch(Throwable){}
 $connection='needs_test_credentials';$tables=null;$stage='test_connection';
 if($settings!==null){if(hash_equals(hash('sha256',DB_USER),hash('sha256',$settings['user'])))throw new RuntimeException('Production user rejected');$pdo=new PDO('mysql:host='.$settings['host'].';dbname=u112851217_msht_test;charset=utf8mb4',$settings['user'],$settings['password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);if($pdo->query('SELECT DATABASE()')->fetchColumn()!=='u112851217_msht_test')throw new RuntimeException('Unexpected test identity');$pdo->exec('SET TRANSACTION READ ONLY');$pdo->beginTransaction();$tables=(int)$pdo->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND TABLE_TYPE='BASE TABLE'")->fetchColumn();$pdo->rollBack();$connection='verified_readonly';}
 echo json_encode(['status'=>'private_setup_ready','private_config_mode'=>'0600','private_directory_mode'=>'0700','existing_nonempty_config_preserved'=>$previous!==null&&trim($previous)!=='','previous_empty_file_preserved'=>$preserved,'interactive_helper_installed'=>true,'test_connection'=>$connection,'test_table_count'=>$tables,'production_credentials_reused'=>false,'production_writes'=>false,'test_writes'=>false])."\n";
}catch(Throwable $error){if(isset($pdo)&&$pdo->inTransaction())$pdo->rollBack();echo json_encode(['status'=>'setup_incomplete','stage'=>$stage,'errno'=>$error instanceof PDOException?(int)($error->errorInfo[1]??0):null,'production_writes'=>false,'test_writes'=>false])."\n";exit(1);}
