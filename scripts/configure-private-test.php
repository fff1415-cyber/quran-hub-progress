<?php
declare(strict_types=1);
// Installed outside every website; invoked manually through an interactive SSH terminal.
if(PHP_SAPI!=='cli'||!stream_isatty(STDIN)){fwrite(STDERR,"Run through an interactive SSH terminal.\n");exit(1);}
umask(0077);
require __DIR__.'/private-test-config.php';
$file=__DIR__.'/msht-test.php';
if(is_link(__DIR__)||is_link($file)||realpath(__DIR__)!==dirname(__FILE__)||(fileperms(__DIR__)&0077)!==0){fwrite(STDERR,"Private directory needs review.\n");exit(1);}
$original=is_file($file)?file_get_contents($file):null;$host=QHP_DEFAULT_TEST_HOST;$user='';
if(is_string($original)&&trim($original)!==''){try{$prior=qhp_load_private_test_config($original);$host=$prior['host'];$user=$prior['user'];}catch(Throwable){}}
fwrite(STDOUT,'Test database host ['.$host.']: ');$answer=trim((string)fgets(STDIN));if($answer!=='')$host=$answer;
fwrite(STDOUT,'Test database username'.($user!==''?' ['.$user.']':'').': ');$answer=trim((string)fgets(STDIN));if($answer!=='')$user=$answer;
if($user===''||hash_equals(QHP_PRODUCTION_USER_SHA256,hash('sha256',$user))){fwrite(STDERR,"Use the separate test database user. Original file unchanged.\n");exit(1);}
$mode=trim((string)shell_exec('stty -g 2>/dev/null'));if($mode===''){fwrite(STDERR,"Cannot hide password input; stopped.\n");exit(1);}
system('stty -echo',$hiddenStatus);if($hiddenStatus!==0){system('stty '.escapeshellarg($mode));fwrite(STDERR,"Cannot hide password input; stopped before reading it.\n");exit(1);}
$password='';try{fwrite(STDOUT,'Test password (hidden): ');$password=rtrim((string)fgets(STDIN),"\r\n");}finally{system('stty '.escapeshellarg($mode));fwrite(STDOUT,"\n");}
try{
 if($password==='')throw new RuntimeException('Empty test password');
 $settings=['host'=>$host,'database'=>'u112851217_msht_test','user'=>$user,'password'=>$password];
 $pdo=new PDO('mysql:host='.$host.';dbname=u112851217_msht_test;charset=utf8mb4',$user,$password,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
 if($pdo->query('SELECT DATABASE()')->fetchColumn()!=='u112851217_msht_test')throw new RuntimeException('Unexpected identity');
 $pdo->exec('SET TRANSACTION READ ONLY');$pdo->beginTransaction();$tables=(int)$pdo->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND TABLE_TYPE='BASE TABLE'")->fetchColumn();$pdo->rollBack();
 if(is_link($file)||($original!==null&&(!is_file($file)||!hash_equals(hash('sha256',$original),(string)hash_file('sha256',$file)))))throw new RuntimeException('Configuration changed');
 $suffix=bin2hex(random_bytes(8));$temporary=$file.'.pending-'.$suffix;$h=fopen($temporary,'x');if(!$h)throw new RuntimeException('Private write failed');fwrite($h,"<?php\nreturn ".var_export($settings,true).";\n");fclose($h);chmod($temporary,0600);
 if($original!==null){$backup=$file.'.before-credentials-'.$suffix;$h=fopen($backup,'x');if(!$h)throw new RuntimeException('Preservation failed');fwrite($h,$original);fclose($h);chmod($backup,0600);}
 if(!rename($temporary,$file))throw new RuntimeException('Atomic configuration save failed');
 echo json_encode(['status'=>'test_connection_verified','database'=>'u112851217_msht_test','table_count'=>$tables,'private_mode'=>'0600','production_writes'=>false,'test_writes'=>false])."\n";
}catch(Throwable $error){if(isset($pdo)&&$pdo->inTransaction())$pdo->rollBack();if(isset($temporary)&&is_file($temporary))unlink($temporary);fwrite(STDERR,"Test connection or private save failed; no database records changed. Details withheld.\n");exit(1);}
