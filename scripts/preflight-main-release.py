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
if os.environ.get('REQUIRE_PUBLISHED_CANDIDATE')=='true':
    for path in ['/api/r.php?path=%2Fstudents','/api/r.php?path=%2Fapp-state&key=grades']:
        status=subprocess.check_output(['curl','-sS','-o','/dev/null','-w','%{http_code}','--connect-timeout','15','--max-time','25','--resolve','msht.io:443:'+host,'https://msht.io'+path],stderr=subprocess.DEVNULL).decode()
        if status not in ['401','403']:raise SystemExit('An authenticated data endpoint did not reject an anonymous request')
schema=base64.b64encode(pathlib.Path('api/schema.php').read_bytes()).decode()
code="eval(substr(base64_decode('"+schema+"'),5));"+r'''
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
 }$pdo->rollBack();
 $flags=[];foreach(['QHP_GRADE_WRITES_V1','QHP_SHARED_GRADE_WRITES_V1','QHP_SEMESTER_STORES_V1','QHP_TRANSFER_WRITES_V1']as$f)$flags[$f]=defined($f)&&constant($f)===true;
 echo json_encode(['status'=>'main_preflight','database_identity_confirmed'=>$identity,'main_roots_confirmed'=>true,'schema'=>$schema,'duplicate_evaluation_groups'=>$duplicates,'php_compatible'=>PHP_VERSION_ID>=80100,'flags'=>$flags,'read_only_counts'=>$rows,'production_writes'=>false])."\n";
 if(!$identity||!$schema['ready']||PHP_VERSION_ID<80100)exit(1);
}catch(Throwable){echo "{\"status\":\"main_preflight_incomplete\",\"production_writes\":false}\n";exit(1);}
'''
with tempfile.TemporaryDirectory() as directory:
    ask=pathlib.Path(directory,'askpass');ask.write_text('#!/bin/sh\nprintf "%s\\n" "$DEPLOY_SSH_PASSWORD"\n');ask.chmod(0o700)
    env=dict(os.environ,SSH_ASKPASS=str(ask),SSH_ASKPASS_REQUIRE='force',DISPLAY=':0')
    command='php -d display_errors=0 -r '+shlex.quote(code)+' -- '+shlex.quote(front)+' '+shlex.quote(api)
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
print(json.dumps({'status':'main_release_requires_tested_index' if index_pending else 'main_release_preflight_passed','published_sha':marker,'candidate_sha':target,'api_health':True,'api_baseline_verified':True,'production_writes':False,'uploaded':False}))
if index_pending:raise SystemExit('Deployment gate remains closed until the approved index is present in production')
