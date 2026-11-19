import base64,ipaddress,os,pathlib,re,shlex,subprocess,tempfile
user=os.environ['DEPLOY_USER'].strip().split('@')[0]
host=str(ipaddress.IPv4Address(os.environ['DEPLOY_HOST'].strip()))
if not re.fullmatch(r'[A-Za-z0-9_-]+',user):raise SystemExit('Invalid scope')
home='/home/'+user
source=pathlib.Path('scripts/secretary-attendance-probe.php').read_text()
helper=base64.b64encode(pathlib.Path('scripts/private-test-config.php').read_bytes()).decode()
source=source.replace('declare(strict_types=1);',"declare(strict_types=1);\neval(substr(base64_decode('"+helper+"'),5));",1)
with tempfile.TemporaryDirectory() as folder:
 ask=pathlib.Path(folder,'askpass');ask.write_text('#!/bin/sh\nprintf "%s\\n" "$DEPLOY_SSH_PASSWORD"\n');ask.chmod(0o700)
 env=dict(os.environ,SSH_ASKPASS=str(ask),SSH_ASKPASS_REQUIRE='force',DISPLAY=':0')
 result=subprocess.run(['ssh','-T','-p','65002','-o','ConnectTimeout=20','-o','StrictHostKeyChecking=accept-new','-o','NumberOfPasswordPrompts=1',user+'@'+host,shlex.join(['php','-d','display_errors=0','/dev/stdin',home])],input=source,env=env,text=True,capture_output=True,timeout=90,start_new_session=True)
 if result.returncode:raise SystemExit('Isolated read failed; private details withheld')
 subprocess.run(['node','scripts/secretary-attendance-probe.cjs'],input=result.stdout,text=True,check=True)
