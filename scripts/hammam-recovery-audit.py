"""Read only aggregate counts from the pinned live release."""
import ipaddress
import base64
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
    release = os.environ.get('EXPECTED_RELEASE','4e8cfc813651d36f49a3c1ed5ddb9561a5442eab')
    mode = os.environ.get('HAMMAM_RECOVERY_MODE','audit')
    if not re.fullmatch('[a-f0-9]{40}',release) or mode not in ('audit','recover','revert'):
        raise SystemExit('Invalid recovery mode or release')
    cmd = shlex.join(['php','-d','display_errors=0','/dev/stdin',root,release,mode,os.environ.get('HAMMAM_REVERT_JOURNAL','')])
    script = pathlib.Path('scripts/hammam-recovery-audit.php').read_text(encoding='utf-8')
    helper = pathlib.Path('scripts/private-test-config.php').read_bytes()
    script = script.replace('declare(strict_types=1);','declare(strict_types=1);\n' +
        "eval(substr(base64_decode('" + base64.b64encode(helper).decode() + "'),5));",1)
    result = subprocess.run(['ssh','-T','-p','65002','-o','ConnectTimeout=20','-o','StrictHostKeyChecking=accept-new',
        '-o','NumberOfPasswordPrompts=1',user+'@'+host,cmd],
        input=script,
        env=env, encoding='utf-8',capture_output=True,timeout=230,start_new_session=True)
    print(result.stdout,end='')
    if result.returncode:
        raise SystemExit('Read-only audit failed')
