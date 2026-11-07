"""Read-only production preparation. No file upload, release merge, DDL or record writes."""
import base64, ipaddress, json, os, pathlib, re, shlex, subprocess, tempfile

user=os.environ['DEPLOY_USER'].strip().split('@')[0]
host=str(ipaddress.IPv4Address(os.environ['DEPLOY_HOST'].strip()))
if not re.fullmatch(r'[A-Za-z0-9_-]+',user):raise SystemExit('Invalid SSH user')
home='/home/'+user
def rooted(value):
    path='/'+value.strip().strip('/')
    return path if path.startswith('/home/') else home+path
front=rooted(os.environ['DEPLOY_FRONTEND']);api=rooted(os.environ['DEPLOY_API_PATH'])
if front!=home+'/domains/msht.io/public_html' or api!=front+'/api':raise SystemExit('Configured deployment roots are not the main site')
target=os.environ['RELEASE_CANDIDATE']
if not re.fullmatch(r'[a-f0-9]{40}',target):raise SystemExit('Invalid release candidate')
def http(path):
    return subprocess.check_output(['curl','-fsS','--connect-timeout','15','--max-time','30','--resolve','msht.io:443:'+host,'https://msht.io'+path],stderr=subprocess.DEVNULL)
marker=http('/deploy-sha.txt?preflight='+os.environ.get('GITHUB_RUN_ID','0')).decode().strip()
if not re.fullmatch(r'[a-f0-9]{40}',marker):raise SystemExit('Invalid published marker')
if os.environ.get('REQUIRE_PUBLISHED_CANDIDATE')=='true' and marker!=target:raise SystemExit('Expected candidate is not the published release')
subprocess.run(['git','merge-base','--is-ancestor',marker,target],check=True)
health=json.loads(http('/api/r.php?path=%2Fhealth'))
if health.get('ok') is not True:raise SystemExit('Current main site API health failed')
if os.environ.get('REQUIRE_ATOMIC_GRADE_MODE')=='true' and health.get('checks',{}).get('grade_protocol')!='atomic':raise SystemExit('The published API has not confirmed atomic grade mode')
if os.environ.get('REQUIRE_PUBLISHED_CANDIDATE')=='true':
    for path in ['/api/r.php?path=%2Fstudents','/api/r.php?path=%2Fapp-state&key=grades']:
        status=subprocess.check_output(['curl','-sS','-o','/dev/null','-w','%{http_code}','--connect-timeout','15','--max-time','25','--resolve','msht.io:443:'+host,'https://msht.io'+path],stderr=subprocess.DEVNULL).decode()
        if status not in ['401','403']:raise SystemExit('An authenticated data endpoint did not reject an anonymous request')
schema=base64.b64encode(pathlib.Path('api/schema.php').read_bytes()).decode()
code="eval(substr(base64_decode('"+schema+"'),5));"+r'''
function grade_log_summary(string $front, int $since): array {
 $home=dirname($front,3);
 $files=[$home.'/.logs/error_log_msht.io',$front.'/error_log',$front.'/api/error_log'];
 $dirs=[$home.'/.logs',dirname($front).'/logs',dirname($front).'/.logs',$front.'/.logs'];
 $summary=['readable_sources'=>0,'visible_log_directories'=>0,'recent_diagnostics'=>0,'grade_errors'=>[],'grade_php_fatals'=>0,'tail_truncated'=>false,'explicit_log_errors'=>null];
 foreach($dirs as $dir){
  $resolved=realpath($dir);
  if($resolved===false||!str_starts_with($resolved,$home.'/')||!is_dir($resolved)||!is_readable($resolved))continue;
  $summary['visible_log_directories']++;
  foreach(new DirectoryIterator($resolved) as $entry){
   if(preg_match('/^(?:error_log(?:_msht\.io)?|msht\.io\.error\.log|error\.log)(?:\.[0-9]+)?$/D',$entry->getFilename())){
    if($dir===$home.'/.logs'&&!str_contains($entry->getFilename(),'msht.io'))continue;
    $files[]=$entry->getPathname();
   }
  }
 }
 foreach([$front.'/.user.ini',$front.'/api/.user.ini'] as $settings){
  if(realpath($settings)===$settings&&is_readable($settings)){
   $body=@file_get_contents($settings,false,null,0,65536);
   if(is_string($body)&&preg_match_all('/^\s*log_errors\s*=\s*"?(on|off|true|false|1|0)"?\s*(?:;[^\r\n]*)?$/im',$body,$options)){
    $summary['explicit_log_errors']=in_array(strtolower(end($options[1])),['on','true','1'],true);
   }
  }
 }
 $seen=[];
 foreach(array_unique($files) as $file){
  if(!is_file($file)||!is_readable($file)||is_link($file)||realpath($file)!==$file)continue;
  $handle=@fopen($file,'rb');if(!$handle)continue;
  $summary['readable_sources']++;
  $stat=fstat($handle);
  if(($stat['size']??0)>2097152){fseek($handle,-2097152,SEEK_END);fgets($handle);$summary['tail_truncated']=true;}
  while(($line=fgets($handle,65536))!==false){
   if(!preg_match('/^\[([^\]]+)\]/',$line,$match))continue;
   $time=strtotime($match[1]);if($time===false||$time<$since)continue;
   $json=strpos($line,'{"event":"qhp_failure"');
   if($json!==false){
    $entry=json_decode(trim(substr($line,$json)),true);
    if(!is_array($entry))continue;
    $id=$entry['reference']??null;
    if(is_string($id)){if(isset($seen[$id]))continue;$seen[$id]=true;}
    $summary['recent_diagnostics']++;
    if(($entry['context']??null)==='grade_cells'){
     $category=$entry['category']??'other';
     if(!in_array($category,['connection','permission','schema','timeout','conflict','integrity','sql'],true))$category='other';
     $summary['grade_errors'][$category]=($summary['grade_errors'][$category]??0)+1;
    }
   }elseif(preg_match('/PHP (?:Fatal|Parse) error/i',$line)&&preg_match('/grade-(?:cutover|cell|write|plan)|routes\/app_state\.php/',$line)){
    $summary['grade_php_fatals']++;
   }
  }
  fclose($handle);
 }
 return $summary;
}
try {
 $front=$argv[1];$api=$argv[2];if(realpath($front)!==$front||realpath($api)!==$api)throw new RuntimeException('resolved_main_root_mismatch');
 foreach([$front.'/index.html',$front.'/.htaccess',$front.'/assets',$api.'/routes',$api.'/lib',$api.'/r.php']as$p)if(is_link($p))throw new RuntimeException('symlink_in_release_path');
 require $api.'/config.php';if(DB_NAME!=='u112851217_msht_io')throw new RuntimeException('wrong_main_database');
 $pdo=new PDO('mysql:host='.DB_HOST.(defined('DB_PORT')?';port='.DB_PORT:'').';dbname='.DB_NAME.';charset='.DB_CHARSET,DB_USER,DB_PASS,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
 $pdo->exec('SET TRANSACTION READ ONLY');$pdo->beginTransaction();$schema=schema_inspect($pdo);$identity=$pdo->query('SELECT DATABASE()')->fetchColumn()===DB_NAME;$duplicates=(int)$pdo->query('SELECT COUNT(*) FROM (SELECT complex_id FROM evaluation_settings GROUP BY complex_id HAVING COUNT(*)>1) AS duplicates')->fetchColumn();
 $rows=[];if($schema['ready']){
  foreach(['students','education_plans','student_plan_assignments','segment_completions','semesters','academic_weeks']as$t)$rows[$t]=(int)$pdo->query('SELECT COUNT(*) FROM `'.$t.'`')->fetchColumn();
  $rows['grade_and_history_stores']=(int)$pdo->query("SELECT COUNT(*) FROM app_state WHERE `key` IN ('grades','weekly_tests','scientific_grades','sard_queue','sard_history','academic_records')")->fetchColumn();
  $rows['teacher_halaqa_configs']=(int)$pdo->query("SELECT COUNT(*) FROM halaqat WHERE COALESCE(teacher_code,'')<>''")->fetchColumn();
  $rows['assistant_halaqa_configs']=(int)$pdo->query("SELECT COUNT(*) FROM halaqat WHERE COALESCE(assistant_code,'')<>'' OR COALESCE(extra_assistants,'') NOT IN ('','[]','null')")->fetchColumn();
  if(($argv[3]??'')==='atomic'){
   $rows['confirmed_grade_receipts']=(int)$pdo->query("SELECT COUNT(*) FROM grade_operation_receipts WHERE store_key='grades'")->fetchColumn();
   $rows['confirmed_browser_grade_receipts']=(int)$pdo->query("SELECT COUNT(*) FROM grade_operation_receipts WHERE store_key='grades' AND operation_id REGEXP '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'")->fetchColumn();
   $rows['confirmed_grade_plan_events']=(int)$pdo->query("SELECT COUNT(*) FROM app_state WHERE LEFT(`key`,17)='grade_plan_event:'")->fetchColumn();
   $first=$pdo->query("SELECT MIN(UNIX_TIMESTAMP(applied_at)) FROM grade_operation_receipts WHERE store_key='grades' AND operation_id REGEXP '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'")->fetchColumn();
   $rows['first_browser_receipt_utc']=$first===null?null:gmdate('c',(int)$first);
   $rows['grade_receipts_with_plan_event']=(int)$pdo->query("SELECT COUNT(*) FROM grade_operation_receipts r WHERE r.store_key='grades' AND EXISTS(SELECT 1 FROM app_state s WHERE s.complex_id=r.context_id AND s.`key`=CONCAT('grade_plan_event:',SHA2(r.operation_id,256)))")->fetchColumn();
  }
 }$pdo->rollBack();
 $logs=($argv[3]??'')==='atomic'?grade_log_summary($front,strtotime('2026-11-07T19:08:10Z')):null;
 $flags=[];foreach(['QHP_GRADE_WRITES_V1','QHP_SHARED_GRADE_WRITES_V1','QHP_SEMESTER_STORES_V1','QHP_TRANSFER_WRITES_V1']as$f)$flags[$f]=defined($f)&&constant($f)===true;
 echo json_encode(['status'=>'main_preflight','database_identity_confirmed'=>$identity,'main_roots_confirmed'=>true,'schema'=>$schema,'duplicate_evaluation_groups'=>$duplicates,'php_compatible'=>PHP_VERSION_ID>=80100,'flags'=>$flags,'read_only_counts'=>$rows,'php_log_summary'=>$logs,'production_writes'=>false])."\n";
 if(!$identity||!$schema['ready']||PHP_VERSION_ID<80100)exit(1);
}catch(Throwable){echo "{\"status\":\"main_preflight_incomplete\",\"production_writes\":false}\n";exit(1);}
'''
with tempfile.TemporaryDirectory() as directory:
    ask=pathlib.Path(directory,'askpass');ask.write_text('#!/bin/sh\nprintf "%s\\n" "$DEPLOY_SSH_PASSWORD"\n');ask.chmod(0o700)
    env=dict(os.environ,SSH_ASKPASS=str(ask),SSH_ASKPASS_REQUIRE='force',DISPLAY=':0')
    protocol=' atomic' if os.environ.get('REQUIRE_ATOMIC_GRADE_MODE')=='true' else ''
    command='php -d display_errors=0 -r '+shlex.quote(code)+' -- '+shlex.quote(front)+' '+shlex.quote(api)+protocol
    result=subprocess.run(['ssh','-T','-p','65002','-o','ConnectTimeout=20','-o','StrictHostKeyChecking=accept-new',user+'@'+host,command],env=env,capture_output=True,timeout=90,start_new_session=True)
    print(result.stdout.decode(),flush=True)
    metadata=json.loads(result.stdout)
    schema=metadata.get('schema',{})
    index_pending=(metadata.get('database_identity_confirmed') is True and metadata.get('main_roots_confirmed') is True and metadata.get('php_compatible') is True and metadata.get('duplicate_evaluation_groups')==0 and schema.get('missing_columns')==[] and schema.get('missing_unique_keys')==['evaluation_settings(complex_id)'] and schema.get('app_state_capacity_ready') is True)
    if result.returncode and not index_pending:raise SystemExit('Main compatibility not confirmed; no upload')
changes=subprocess.run(['git','diff','--quiet',marker,target,'--','api/']).returncode
if changes==1:
    subprocess.run(['python3','scripts/prepare-hostinger-api.py',marker,target],check=True)
    subprocess.run(['python3','scripts/verify-hostinger-api.py'],env=dict(os.environ,DEPLOY_USER=user,DEPLOY_API_PATH=api,API_VERIFY_PHASE='before',SEPARATE_SUBDOMAINS='false'),check=True)
elif changes!=0:raise SystemExit('Could not compare API')
print(json.dumps({'status':'main_release_requires_tested_index' if index_pending else 'main_release_preflight_passed','published_sha':marker,'candidate_sha':target,'api_health':True,'grade_protocol':health.get('checks',{}).get('grade_protocol'),'api_baseline_verified':True,'production_writes':False,'uploaded':False}))
if index_pending:raise SystemExit('Deployment gate remains closed until the approved index is present in production')
