"""Apply the pinned grade protocol DDL only to the verified independent restore."""
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
if not re.fullmatch(r'[A-Za-z0-9_-]+', user):
    raise SystemExit('Unexpected SSH user')
home = '/home/' + user
api = '/' + os.environ['DEPLOY_API_PATH'].strip().strip('/')
if not api.startswith('/home/'):
    api = home + api
if api != home + '/domains/msht.io/public_html/api':
    raise SystemExit('Unexpected main API root')

def php_body(file):
    return pathlib.Path(file).read_text(encoding='utf-8').removeprefix('<?php')

helpers = [php_body('scripts/' + file) for file in ('private-test-config.php', 'private-snapshot-restore.php')]
body = php_body('scripts/test-grade-schema.php').replace('declare(strict_types=1);', '')
script = '<?php\ndeclare(strict_types=1);\n' + '\n'.join(helpers).replace('declare(strict_types=1);', '') + body
ddl = base64.b64encode(pathlib.Path('candidate/tests/fixtures/grade-cell-operations.sql').read_bytes()).decode()
command = 'php -d display_errors=0 /dev/stdin ' + ' '.join(map(shlex.quote, [home, api, ddl]))
with tempfile.TemporaryDirectory() as folder:
    ask = pathlib.Path(folder, 'askpass')
    ask.write_text('#!/bin/sh\nprintf "%s\\n" "$DEPLOY_SSH_PASSWORD"\n')
    ask.chmod(0o700)
    env = dict(os.environ, SSH_ASKPASS=str(ask), SSH_ASKPASS_REQUIRE='force', DISPLAY=':0')
    result = subprocess.run(['ssh', '-T', '-p', '65002', '-o', 'ConnectTimeout=20', '-o', 'StrictHostKeyChecking=accept-new',
                             user + '@' + host, command], input=script, encoding='utf-8',
                            env=env, capture_output=True, timeout=180, start_new_session=True)
    print(result.stdout, end='')
    if result.returncode:
        raise SystemExit('Independent grade schema check did not complete; no production database connection')
