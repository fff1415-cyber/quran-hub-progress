"""Read only aggregate counts from the pinned live release."""
import ipaddress
import os
import pathlib
import re
import shlex
import subprocess
import tempfile

user = os.environ['DEPLOY_USER'].strip().split('@')[0]
host = str(ipaddress.IPv4Address(os.environ['DEPLOY_HOST'].strip()))
if not re.fullmatch(r'[A-Za-z0-9_-]+', user):
    raise SystemExit('Invalid audit scope')
root = '/home/' + user + '/domains/msht.io/public_html'
with tempfile.TemporaryDirectory() as folder:
    askpass = pathlib.Path(folder, 'askpass')
    askpass.write_text('#!/bin/sh\nprintf "%s\\n" "$DEPLOY_SSH_PASSWORD"\n')
    askpass.chmod(0o700)
    env = dict(os.environ, SSH_ASKPASS=str(askpass), SSH_ASKPASS_REQUIRE='force', DISPLAY=':0')
    cmd = shlex.join(['php','-d','display_errors=0','/dev/stdin',root])
    result = subprocess.run(['ssh','-T','-p','65002','-o','ConnectTimeout=20','-o','StrictHostKeyChecking=accept-new',
        '-o','NumberOfPasswordPrompts=1',user+'@'+host,cmd],
        input=pathlib.Path('scripts/audit-plan-save.php').read_text(encoding='utf-8'),
        env=env, encoding='utf-8',capture_output=True,timeout=100,start_new_session=True)
    print(result.stdout,end='')
    if result.returncode:
        raise SystemExit('Read-only audit failed')

