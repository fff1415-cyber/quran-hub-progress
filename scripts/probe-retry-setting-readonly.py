"""One bounded metadata/SELECT probe over SSH; no application handlers or server writes."""
import hashlib,json,os,pathlib,re,shlex,subprocess,tempfile,ipaddress
user=os.environ['DEPLOY_USER'].strip().split('@')[0];host=os.environ['DEPLOY_HOST'].strip();ipaddress.IPv4Address(host)
assert re.fullmatch(r'[A-Za-z0-9_-]+',user)
root='/'+os.environ['DEPLOY_API_PATH'].strip().strip('/')
if not root.startswith('/home/'):root='/home/'+user+root
assert root.startswith('/home/'+user+'/') and '..' not in pathlib.PurePosixPath(root).parts
code=r'''
$stage='config';
try {
 require $argv[1].'/config.php';
 $stage='connection';$pdo=new PDO('mysql:host='.DB_HOST.';dbname='.DB_NAME.';charset='.DB_CHARSET,DB_USER,DB_PASS,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
 $stage='readonly';$pdo->exec('SET TRANSACTION READ ONLY');$pdo->beginTransaction();
 $stage='metadata';$q=$pdo->prepare("SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='evaluation_settings'");$q->execute();$cols=$q->fetchAll(PDO::FETCH_COLUMN);
 $stage='select';$retry=in_array('retry_delay_days',$cols,true);$errno=null;
 try {$pdo->query('SELECT retry_delay_days FROM evaluation_settings LIMIT 0');}catch(PDOException $e){$errno=(int)($e->errorInfo[1]??0);if($errno!==1054)throw $e;}
 $pdo->rollBack();
 echo json_encode(['table_present'=>count($cols)>0,'retry_column_present'=>$retry,'complex_column_present'=>in_array('complex_id',$cols,true),'select_errno'=>$errno,'settings_code_sha256'=>hash_file('sha256',$argv[1].'/routes/evaluation_settings.php')])."\n";
} catch(Throwable $e) {echo json_encode(['probe_failed_stage'=>$stage,'error_class'=>get_class($e),'driver_errno'=>$e instanceof PDOException?(int)($e->errorInfo[1]??0):null])."\n";exit(1);}
'''
expected=hashlib.sha256(subprocess.run(['git','show','f6d9d65d56618999b5aac2db38053ac701ab4b95:api/routes/evaluation_settings.php'],check=True,stdout=subprocess.PIPE).stdout).hexdigest()
with tempfile.TemporaryDirectory() as folder:
 ask=pathlib.Path(folder,'askpass');ask.write_text('#!/bin/sh\nprintf "%s\\n" "$DEPLOY_SSH_PASSWORD"\n');ask.chmod(0o700)
 env=dict(os.environ,SSH_ASKPASS=str(ask),SSH_ASKPASS_REQUIRE='force',DISPLAY=':0')
 command='php -r '+shlex.quote(code)+' -- '+shlex.quote(root)
 result=subprocess.run(['ssh','-T','-p','65002','-o','ConnectTimeout=30','-o','StrictHostKeyChecking=accept-new',user+'@'+host,command],stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env,timeout=90,start_new_session=True)
 if result.returncode:
  try: detail=json.loads(result.stdout)
  except Exception: detail={'transport_exit':result.returncode}
  print(json.dumps(detail));raise SystemExit('Read-only probe failed; private details withheld')
 data=json.loads(result.stdout);assert data['settings_code_sha256']==expected,'published settings file differs from reviewed baseline'
 print(json.dumps(data));assert data['table_present']
 print('PASS: exact deployed baseline and production metadata/SELECT checked inside READ ONLY; no route invoked or records changed')
