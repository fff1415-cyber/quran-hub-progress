"""Restore only through the test-scoped user; private archive and rows never leave Hostinger."""
import base64, ipaddress, os, pathlib, re, shlex, subprocess, tempfile

user=os.environ['DEPLOY_USER'].strip().split('@')[0]
host=os.environ['DEPLOY_HOST'].strip()
ipaddress.IPv4Address(host)
if not re.fullmatch(r'[A-Za-z0-9_-]+',user):raise ValueError('Invalid SSH user')
home='/home/'+user
root='/'+os.environ['DEPLOY_API_PATH'].strip().strip('/')
if not root.startswith('/home/'):root=home+root
if root!=home+'/domains/msht.io/public_html/api':raise ValueError('Main API root does not match the intended site')
code=pathlib.Path('scripts/restore-hostinger-test.php').read_text().removeprefix('<?php').strip()
for file in ['scripts/private-test-config.php','scripts/private-snapshot-restore.php','api/schema.php']:
    encoded=base64.b64encode(pathlib.Path(file).read_bytes()).decode()
    code=code.replace('declare(strict_types=1);',"declare(strict_types=1);\neval(substr(base64_decode('"+encoded+"'),5));",1)
with tempfile.TemporaryDirectory() as folder:
    ask=pathlib.Path(folder,'askpass');ask.write_text('#!/bin/sh\nprintf "%s\\n" "$DEPLOY_SSH_PASSWORD"\n');ask.chmod(0o700)
    env=dict(os.environ,SSH_ASKPASS=str(ask),SSH_ASKPASS_REQUIRE='force',DISPLAY=':0')
    preserve=' preserve-empty-grade-tables' if os.environ.get('PRESERVE_EMPTY_GRADE_TABLES')=='1' else ''
    command='php -d display_errors=0 -r '+shlex.quote(code)+' -- '+shlex.quote(root)+' '+shlex.quote(home)+preserve
    result=subprocess.run(['ssh','-T','-p','65002','-o','ConnectTimeout=20','-o','StrictHostKeyChecking=accept-new',user+'@'+host,command],env=env,capture_output=True,timeout=360,start_new_session=True)
    print(result.stdout.decode())
    if result.returncode:raise SystemExit('Independent restoration incomplete; details and data stay on Hostinger')
