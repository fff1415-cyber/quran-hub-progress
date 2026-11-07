"""Create a private, consistent database rollback archive on the source server; never download or publish records."""
import ipaddress,os,pathlib,re,shlex,subprocess,tempfile
user=os.environ['DEPLOY_USER'].strip().split('@')[0];host=os.environ['DEPLOY_HOST'].strip();ipaddress.IPv4Address(host)
if not re.fullmatch(r'[A-Za-z0-9_-]+',user):raise ValueError('Invalid SSH user')
root='/'+os.environ['DEPLOY_API_PATH'].strip().strip('/')
if not root.startswith('/home/'):root='/home/'+user+root
if not root.startswith('/home/'+user+'/')or'..'in pathlib.PurePosixPath(root).parts or any('/'+s+'.msht.io/'in root for s in ['m1','m2']):raise ValueError('Invalid main root')
code=pathlib.Path('scripts/create-private-db-backup.php').read_text().removeprefix('<?php').strip()
with tempfile.TemporaryDirectory()as folder:
    ask=pathlib.Path(folder,'askpass');ask.write_text('#!/bin/sh\nprintf "%s\\n" "$DEPLOY_SSH_PASSWORD"\n');ask.chmod(0o700)
    environment=dict(os.environ,SSH_ASKPASS=str(ask),SSH_ASKPASS_REQUIRE='force',DISPLAY=':0')
    command='php -r '+shlex.quote(code)+' -- '+shlex.quote(root)+' '+shlex.quote('/home/'+user)
    result=subprocess.run(['ssh','-T','-p','65002','-o','ConnectTimeout=20','-o','StrictHostKeyChecking=accept-new',user+'@'+host,command],env=environment,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=180,start_new_session=True)
    print(result.stdout.decode())
    if result.returncode:raise SystemExit('Private backup incomplete; private server details withheld')
