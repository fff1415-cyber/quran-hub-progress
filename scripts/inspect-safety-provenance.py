"""Bounded metadata only: no DB connection, private configuration execution, writes or secret values."""
import ipaddress,json,os,pathlib,re,shlex,subprocess,tempfile
user=os.environ['DEPLOY_USER'].strip().split('@')[0];host=os.environ['DEPLOY_HOST'].strip()
ipaddress.IPv4Address(host)
if not re.fullmatch(r'[A-Za-z0-9_-]+',user):raise ValueError('Invalid SSH identity')
code=r'''
$home=$argv[1];$private=$home.'/.qhp-private/msht-test.php';$out=['test_config'=>['exists'=>is_file($private)],'roots'=>[]];
$out['alternative_test_configuration_candidates']=[];
foreach(['msht-test.php.txt','msht_test.php','msht-test.json','msht-test.ini','msht-test.env','test-db.php']as$label){
 $path=$home.'/.qhp-private/'.$label;
 if(is_file($path)&&!is_link($path)&&filesize($path)<=65536){$text=file_get_contents($path);$out['alternative_test_configuration_candidates'][]=['label'=>$label,'nonempty'=>strlen(trim($text))>0,'secured'=>(fileperms($path)&0077)===0,'explicit_test_database'=>str_contains($text,'u112851217_msht_test')];}
}
$mysqlConfig=$home.'/.my.cnf';$out['dedicated_mysql_test_group_present']=false;
if(is_file($mysqlConfig)&&!is_link($mysqlConfig)&&filesize($mysqlConfig)<=65536){$text=file_get_contents($mysqlConfig);$out['dedicated_mysql_test_group_present']=(bool)preg_match('/^\s*\[client_msht_test\]\s*$/m',$text);}
if(is_file($private)&&!is_link($private)&&filesize($private)<=65536){
 $text=file_get_contents($private);$trim=trim($text);
 $out['test_config']+=['nonempty'=>strlen($trim)>0,'php_opening'=>str_starts_with($trim,'<?php'),'json_opening'=>str_starts_with($trim,'{'),'secured'=>(fileperms($private)&0077)===0,'contains_expected_test_database'=>str_contains($text,'u112851217_msht_test'),'contains_placeholder_marker'=>(bool)preg_match('/CHANGE_ME|YOUR_PASSWORD|YOUR_USER|PLACEHOLDER/i',$text)];
 foreach(['host'=>['DB_HOST','host'],'database'=>['DB_NAME','database','dbname'],'user'=>['DB_USER','user','username'],'password'=>['DB_PASS','password','pass']]as$key=>$names){$found=false;foreach($names as$name)if(preg_match('/[\x27\x22$]'.preg_quote($name,'/').'[\x27\x22\s=]/i',$text))$found=true;$out['test_config']['recognized_field_labels'][$key]=$found;}
}
$main=realpath($home.'/domains/msht.io/public_html');
foreach(['m1','m2']as$sub){foreach(['separate'=>$home.'/domains/'.$sub.'.msht.io/public_html','under_main'=>$home.'/domains/msht.io/public_html/'.$sub,'under_main_host'=>$home.'/domains/msht.io/public_html/'.$sub.'.msht.io']as$label=>$path){$real=realpath($path);$out['roots'][$sub][$label]=['exists'=>$real!==false,'same_as_main'=>$real!==false&&$real===$main,'symlink'=>is_link($path),'has_api_config'=>is_file($path.'/api/config.php')];}}
foreach(['msht.io','m1.msht.io','m2.msht.io']as$domain){$path=$home.'/domains/'.$domain.'/public_html/.htaccess';if(is_file($path)&&filesize($path)<=65536){$text=file_get_contents($path);$out['htaccess'][$domain]=['mentions_m1'=>str_contains($text,'m1.msht.io'),'mentions_m2'=>str_contains($text,'m2.msht.io')];}}
$out['production_writes']=false;$out['test_connection_attempted']=false;$out['vhost_isolation_proven']=false;
$out['readable_target_vhost_files']=[];
foreach(['apache'=>'/etc/apache2/sites-enabled/msht.io.conf','nginx'=>'/etc/nginx/sites-enabled/msht.io','litespeed'=>'/usr/local/lsws/conf/vhosts/msht.io/vhconf.conf']as$label=>$path){if(is_file($path)&&is_readable($path)&&filesize($path)<=65536){$text=file_get_contents($path);$out['readable_target_vhost_files'][]=['type'=>$label,'mentions_main_host'=>str_contains($text,'msht.io'),'mentions_m2_host'=>str_contains($text,'m2.msht.io')];}}
echo json_encode($out,JSON_PRETTY_PRINT)."\n";
'''
with tempfile.TemporaryDirectory() as folder:
 ask=pathlib.Path(folder,'askpass');ask.write_text('#!/bin/sh\nprintf "%s\\n" "$DEPLOY_SSH_PASSWORD"\n');ask.chmod(0o700)
 env=dict(os.environ,SSH_ASKPASS=str(ask),SSH_ASKPASS_REQUIRE='force',DISPLAY=':0')
 command='php -r '+shlex.quote(code)+' -- '+shlex.quote('/home/'+user)
 result=subprocess.run(['ssh','-T','-p','65002','-o','ConnectTimeout=20','-o','StrictHostKeyChecking=accept-new',user+'@'+host,command],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=60,start_new_session=True)
 if result.returncode:raise SystemExit('Private inspection failed; output withheld')
 summary=json.loads(result.stdout);print(json.dumps(summary,indent=2))
