<?php
declare(strict_types=1);
require __DIR__.'/../private-test-config.php';
$expected=['host'=>'127.0.0.1','database'=>'u112851217_msht_test','user'=>'fixture','password'=>"quote' slash\\ dollar\$ newline\n"];
$array="<?php\nreturn ".var_export($expected,true).';';
if(qhp_load_private_test_config($array)!==$expected)throw new LogicException('Literal return array mismatch');
$defines="<?php\n";foreach(['DB_HOST'=>'host','DB_NAME'=>'database','DB_USER'=>'user','DB_PASS'=>'password']as$name=>$key)$defines.='define('.var_export($name,true).','.var_export($expected[$key],true).");\n";
if(qhp_load_private_test_config($defines)!==$expected)throw new LogicException('Legacy definitions mismatch');
$assignments="<?php\n";foreach($expected as$key=>$value)$assignments.='$'.$key.'='.var_export($value,true).";\n";
if(qhp_load_private_test_config($assignments)!==$expected)throw new LogicException('Literal variables mismatch');
$GLOBALS['config_side_effect']=false;
qhp_load_private_test_config($array.' $GLOBALS["config_side_effect"]=true;');
if($GLOBALS['config_side_effect'])throw new LogicException('Configuration was executed');
foreach([str_replace('msht_test','msht_io',$array),"<?php return ['password' => getenv('ANY_SECRET')];",$array."define('DB_HOST','ambiguous');"]as$invalid){try{qhp_load_private_test_config($invalid);throw new LogicException('Unsafe config accepted');}catch(RuntimeException){}}
echo "PASS: private return/define/variable formats, literal escaping and exact test identity; no configuration execution, guessed fields or ambiguous credentials\n";
