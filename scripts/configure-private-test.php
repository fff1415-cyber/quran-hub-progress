<?php
declare(strict_types=1);
// Installed outside every website; invoked manually through an interactive SSH terminal.
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
ini_set('display_errors','0');
function qhp_private_input_failure(string $reason):never{echo json_encode(['status'=>'input_failed','reason'=>$reason,'original_config_unchanged'=>true,'production_writes'=>false,'test_writes'=>false])."\n";exit(1);}
if(!function_exists('stream_isatty')||!stream_isatty(STDIN))qhp_private_input_failure('interactive_terminal_required');
function qhp_terminal_command(array $arguments):array{
 if(!function_exists('proc_open'))throw new RuntimeException('terminal_process_unavailable');
 $binary=is_executable('/usr/bin/stty')?'/usr/bin/stty':(is_executable('/bin/stty')?'/bin/stty':null);if(!$binary)throw new RuntimeException('terminal_control_unavailable');
 $process=proc_open([$binary,...$arguments],[0=>STDIN,1=>['pipe','w'],2=>['file','/dev/null','w']],$pipes);if(!is_resource($process))throw new RuntimeException('terminal_process_failed');
 $output=stream_get_contents($pipes[1]);fclose($pipes[1]);return [proc_close($process),trim((string)$output)];
}
function qhp_hidden_password(string $prompt):string{
 [$status,$mode]=qhp_terminal_command(['-g']);if($status!==0||$mode==='')throw new RuntimeException('terminal_mode_unavailable');
 $restore=true;$reset=static function()use(&$restore,$mode):void{if($restore){qhp_terminal_command([$mode]);$restore=false;}};register_shutdown_function($reset);
 try{
  [$status]=qhp_terminal_command(['-echo','-echonl']);if($status!==0)throw new RuntimeException('cannot_hide_password');
  [$status,$flags]=qhp_terminal_command(['-a']);if($status!==0||!preg_match('/(?:^|[\s;])-echo(?:[\s;]|$)/',$flags)||!preg_match('/(?:^|[\s;])-echonl(?:[\s;]|$)/',$flags))throw new RuntimeException('hidden_input_not_confirmed');
  fwrite(STDOUT,$prompt);fflush(STDOUT);$value=fgets(STDIN);if($value===false)throw new RuntimeException('input_ended_before_password');return rtrim($value,"\r\n");
 }finally{$reset();fwrite(STDOUT,"\n");}
}
if(($argv[1]??'')==='--terminal-check'){
 // Synthetic terminal compatibility check only; never reads configuration credentials or connects to MySQL.
 $legacyMode=null;if(function_exists('shell_exec'))$legacyMode=trim((string)@shell_exec('stty -g 2>/dev/null'))!=='';
 echo json_encode(['status'=>'terminal_runtime','shell_exec_available'=>function_exists('shell_exec'),'system_available'=>function_exists('system'),'proc_open_available'=>function_exists('proc_open'),'legacy_stty_mode_available'=>$legacyMode])."\n";
 try{$value=qhp_hidden_password('Hidden terminal check: ');if($value!=='QHP_SYNTHETIC_TERMINAL_CHECK')throw new RuntimeException('unexpected_synthetic_input');echo "{\"status\":\"terminal_check_ok\",\"database_writes\":false}\n";exit;}
 catch(Throwable $error){qhp_private_input_failure(in_array($error->getMessage(),['terminal_process_unavailable','terminal_control_unavailable','terminal_process_failed','terminal_mode_unavailable','cannot_hide_password','hidden_input_not_confirmed','input_ended_before_password','unexpected_synthetic_input'],true)?$error->getMessage():'terminal_check_failed');}
}
umask(0077);
require __DIR__.'/private-test-config.php';
$file=__DIR__.'/msht-test.php';
if(is_link(__DIR__)||is_link($file)||realpath(__DIR__)!==dirname(__FILE__)||(fileperms(__DIR__)&0077)!==0){fwrite(STDERR,"Private directory needs review.\n");exit(1);}
$original=is_file($file)?file_get_contents($file):null;$host=QHP_DEFAULT_TEST_HOST;$user='';
if(is_string($original)&&trim($original)!==''){try{$prior=qhp_load_private_test_config($original);$host=$prior['host'];$user=$prior['user'];}catch(Throwable){}}
fwrite(STDOUT,'Test database host ['.$host.']: ');$answer=trim((string)fgets(STDIN));if($answer!=='')$host=$answer;
fwrite(STDOUT,'Test database username'.($user!==''?' ['.$user.']':'').': ');$answer=trim((string)fgets(STDIN));if($answer!=='')$user=$answer;
if($user==='')qhp_private_input_failure('test_username_required');
if(hash_equals(QHP_PRODUCTION_USER_SHA256,hash('sha256',$user)))qhp_private_input_failure('test_username_matches_production_account');
try{$password=qhp_hidden_password('Test password (hidden): ');}catch(Throwable $error){qhp_private_input_failure(in_array($error->getMessage(),['terminal_process_unavailable','terminal_control_unavailable','terminal_process_failed','terminal_mode_unavailable','cannot_hide_password','hidden_input_not_confirmed','input_ended_before_password'],true)?$error->getMessage():'hidden_input_failed');}
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
}catch(Throwable $error){if(isset($pdo)&&$pdo->inTransaction())$pdo->rollBack();if(isset($temporary)&&is_file($temporary))unlink($temporary);echo json_encode(['status'=>'test_connection_or_save_failed','errno'=>$error instanceof PDOException?(int)($error->errorInfo[1]??0):null,'production_writes'=>false,'test_writes'=>false])."\n";exit(1);}
