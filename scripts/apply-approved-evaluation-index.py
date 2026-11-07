"""Apply only the explicitly approved online evaluation index after matching fresh evidence."""
import base64, ipaddress, json, os, pathlib, re, shlex, subprocess, tempfile

def evidence(name): return json.loads(pathlib.Path(os.environ[name]).read_text())
backup=evidence('BACKUP_RESULT_FILE');restore=evidence('RESTORE_RESULT_FILE');compat=evidence('COMPAT_RESULT_FILE')
if (backup.get('status'),restore.get('status'),compat.get('status'))!=('backup_created','independent_restore_verified','test_compatibility_verified') or len({backup['sha256'],restore['source_sha256'],compat['source_sha256']})!=1 or len({backup['backup_id'],restore['source_backup_id'],compat['source_backup_id']})!=1:raise SystemExit('Matching fresh restoration and test acceptance required')
user=os.environ['DEPLOY_USER'].strip().split('@')[0];host=str(ipaddress.IPv4Address(os.environ['DEPLOY_HOST'].strip()))
if not re.fullmatch(r'[A-Za-z0-9_-]+',user):raise SystemExit('Invalid SSH user')
home='/home/'+user;root='/'+os.environ['DEPLOY_API_PATH'].strip().strip('/')
if not root.startswith('/home/'):root=home+root
if root!=home+'/domains/msht.io/public_html/api':raise SystemExit('Main API root mismatch')
def read_site(path):
    return subprocess.check_output(['curl','-fsS','--connect-timeout','12','--max-time','20','--resolve','msht.io:443:'+host,'https://msht.io'+path],stderr=subprocess.DEVNULL)
marker=read_site('/deploy-sha.txt').decode().strip()
if marker!='5ab482d8aa213c097e3b6c835b81ac2d439f0803' or json.loads(read_site('/api/r.php?path=%2Fhealth')).get('ok') is not True:raise SystemExit('The verified live baseline has changed; no index executed')
code=pathlib.Path('scripts/apply-approved-evaluation-index.php').read_text().removeprefix('<?php').strip();schema=base64.b64encode(pathlib.Path('api/schema.php').read_bytes()).decode()
code=code.replace('declare(strict_types=1);',"declare(strict_types=1);\neval(substr(base64_decode('"+schema+"'),5));",1)
with tempfile.TemporaryDirectory() as directory:
    ask=pathlib.Path(directory,'askpass');ask.write_text('#!/bin/sh\nprintf "%s\\n" "$DEPLOY_SSH_PASSWORD"\n');ask.chmod(0o700)
    env=dict(os.environ,SSH_ASKPASS=str(ask),SSH_ASKPASS_REQUIRE='force',DISPLAY=':0')
    args=[root,home,backup['backup_id'],backup['sha256'],restore['private_test_backup_location'],compat['private_compatibility_location']]
    command='php -d display_errors=0 -r '+shlex.quote(code)+' -- '+' '.join(map(shlex.quote,args))
    result=subprocess.run(['ssh','-T','-p','65002','-o','ConnectTimeout=20','-o','StrictHostKeyChecking=accept-new',user+'@'+host,command],env=env,capture_output=True,timeout=120,start_new_session=True)
    print(result.stdout.decode(),flush=True)
    if result.returncode:raise SystemExit('Index did not complete verified; no release will follow')
if read_site('/deploy-sha.txt').decode().strip()!=marker or json.loads(read_site('/api/r.php?path=%2Fhealth')).get('ok') is not True:raise SystemExit('Production health after index requires review')
print(json.dumps({'status':'site_healthy_after_index','published_sha':marker,'application_deployed':False}))
