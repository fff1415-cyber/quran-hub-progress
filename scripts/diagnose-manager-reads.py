"""Execute deployed read handlers inside a database read-only transaction."""
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
    raise SystemExit('Unexpected SSH user')
root = '/home/' + user + '/domains/msht.io/public_html'
script = pathlib.Path('scripts/diagnose-manager-reads.php').read_text(encoding='utf-8')
with tempfile.TemporaryDirectory() as folder:
    ask = pathlib.Path(folder, 'askpass')
    ask.write_text('#!/bin/sh\nprintf "%s\\n" "$DEPLOY_SSH_PASSWORD"\n')
    ask.chmod(0o700)
    env = dict(os.environ, SSH_ASKPASS=str(ask), SSH_ASKPASS_REQUIRE='force', DISPLAY=':0')
    result = subprocess.run(['ssh','-T','-p','65002','-o','ConnectTimeout=20','-o','StrictHostKeyChecking=accept-new',
        user + '@' + host, 'php -d display_errors=0 /dev/stdin ' + shlex.quote(root)],
        input=script, encoding='utf-8', env=env, capture_output=True, timeout=65, start_new_session=True)
    print(result.stdout, end='')
    if result.returncode:
        raise SystemExit('Manager read probe did not complete')
