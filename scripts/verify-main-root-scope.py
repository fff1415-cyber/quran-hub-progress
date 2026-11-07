"""Read-only root provenance checks independent of test-database credentials."""
import ipaddress,json,os,pathlib,re,shlex,subprocess,tempfile,urllib.request
user=os.environ['DEPLOY_USER'].strip().split('@')[0];host=os.environ['DEPLOY_HOST'].strip()
ipaddress.IPv4Address(host)
if not re.fullmatch(r'[A-Za-z0-9_-]+',user): raise ValueError('Invalid SSH user')
def root_path(value):
    value='/'+value.strip().strip('/')
    if not value.startswith('/home/'): value='/home/'+user+value
    if not value.startswith('/home/'+user+'/') or '..' in pathlib.PurePosixPath(value).parts: raise ValueError('Invalid root')
    return value
api=root_path(os.environ['DEPLOY_API_PATH']);front=root_path(os.environ['DEPLOY_FRONTEND'])
code=r'''
$home=$argv[1];$mainFront=realpath($argv[2]);$mainApi=realpath($argv[3]);
$out=['main_front_exists'=>$mainFront!==false,'main_api_exists'=>$mainApi!==false,'api_below_front'=>$mainFront&&$mainApi&&str_starts_with($mainApi.'/',$mainFront.'/'),'excluded_hosts'=>[]];
foreach(['m1','m2'] as $sub){
  $candidate=$home.'/domains/'.$sub.'.msht.io/public_html';$other=realpath($candidate);$otherApi=realpath($candidate.'/api');
  $files=[];foreach(['index.html','deploy-sha.txt','api/index.php','api/r.php','api/health.php','api/config.php','.htaccess'] as $file){$files[$file]=is_file($candidate.'/'.$file);}
  $out['excluded_hosts'][$sub]=['expected_root_exists'=>$other!==false,'same_front_root'=>$other!==false&&$other===$mainFront,'same_api_root'=>$otherApi!==false&&$otherApi===$mainApi,'files_present'=>$files];
}
echo json_encode($out)."\n";
'''
with tempfile.TemporaryDirectory() as folder:
    ask=pathlib.Path(folder,'askpass');ask.write_text('#!/bin/sh\nprintf "%s\\n" "$DEPLOY_SSH_PASSWORD"\n');ask.chmod(0o700)
    env=dict(os.environ,SSH_ASKPASS=str(ask),SSH_ASKPASS_REQUIRE='force',DISPLAY=':0')
    command='php -r '+shlex.quote(code)+' -- '+' '.join(map(shlex.quote,['/home/'+user,front,api]))
    result=subprocess.run(['ssh','-T','-p','65002','-o','ConnectTimeout=20','-o','StrictHostKeyChecking=accept-new',user+'@'+host,command],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=60,start_new_session=True)
    if result.returncode: raise SystemExit('Root inspection failed; private details withheld')
    summary=json.loads(result.stdout)
summary['subdomain_sync_variable_enabled']=os.environ.get('SEPARATE_SUBDOMAINS')=='true'
summary['public_markers']={}
for domain in ['msht.io','m1.msht.io','m2.msht.io']:
    try:
        with urllib.request.urlopen('https://'+domain+'/deploy-sha.txt',timeout=20) as response:
            value=response.read(128).decode().strip()
            summary['public_markers'][domain]={'http':response.status,'sha':value if re.fullmatch(r'[0-9a-f]{40}',value) else None}
    except Exception:
        summary['public_markers'][domain]={'reachable':False}
summary['vhost_database_isolation']='not_established_by_path_checks_alone'
summary['writes_performed']=False
print(json.dumps(summary,indent=2))
