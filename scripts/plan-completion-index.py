import base64
import ipaddress
import os
import pathlib
import re
import shlex
import subprocess
import tempfile

user = os.environ['DEPLOY_USER'].strip().split('@')[0]
host = str(ipaddress.IPv4Address(os.environ['DEPLOY_HOST'].strip()))
release = os.environ['EXPECTED_RELEASE']
mode = os.environ['COMPLETION_INDEX_MODE']
if not re.fullmatch(r'[A-Za-z0-9_-]+', user) or not re.fullmatch(r'[a-f0-9]{40}', release) or mode not in ('test', 'production'):
    raise SystemExit('Invalid completion index scope')
root = '/home/' + user + '/domains/msht.io/public_html'
script = pathlib.Path('scripts/plan-completion-index.php').read_text(encoding='utf-8')
helper = base64.b64encode(pathlib.Path('scripts/private-test-config.php').read_bytes()).decode()
script = script.replace('declare(strict_types=1);', "declare(strict_types=1);\neval(substr(base64_decode('" + helper + "'),5));", 1)
with tempfile.TemporaryDirectory() as folder:
    askpass = pathlib.Path(folder, 'askpass')
    askpass.write_text('#!/bin/sh\nprintf "%s\\n" "$DEPLOY_SSH_PASSWORD"\n')
    askpass.chmod(0o700)
    env = dict(os.environ, SSH_ASKPASS=str(askpass), SSH_ASKPASS_REQUIRE='force', DISPLAY=':0')
    command = shlex.join(['php', '-d', 'display_errors=0', '/dev/stdin', root, release, mode])
    result = subprocess.run(['ssh', '-T', '-p', '65002', '-o', 'ConnectTimeout=20', '-o', 'StrictHostKeyChecking=accept-new',
        '-o', 'NumberOfPasswordPrompts=1', user+'@'+host, command], input=script, env=env, encoding='utf-8',
        capture_output=True, timeout=180, start_new_session=True)
    print(result.stdout, end='')
    if result.returncode:
        raise SystemExit('Completion index verification did not pass')
