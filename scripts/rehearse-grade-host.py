"""Run the pinned candidate against Hostinger test only, without exposing records."""
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

def body(file):
    source = pathlib.Path(file).read_text(encoding='utf-8')
    source = re.sub(r'^require_once .*;\s*$', '', source, flags=re.MULTILINE)
    return source.removeprefix('<?php').replace('declare(strict_types=1);', '')

files = ['scripts/private-test-config.php', 'scripts/private-snapshot-restore.php',
         *('candidate/api/' + item for item in ('schema.php', 'diagnostics.php', 'lib/grade-cell-operations.php',
           'lib/grade-plan-effect.php', 'lib/grade-write-api.php', 'lib/plan-profile.php', 'routes/app_state.php', 'routes/plans.php')),
         'scripts/rehearse-grade-host.php']
code = '<?php\ndeclare(strict_types=1);\n' + '\n'.join(map(body, files))
with tempfile.TemporaryDirectory() as folder:
    ask = pathlib.Path(folder, 'askpass')
    ask.write_text('#!/bin/sh\nprintf "%s\\n" "$DEPLOY_SSH_PASSWORD"\n')
    ask.chmod(0o700)
    env = dict(os.environ, SSH_ASKPASS=str(ask), SSH_ASKPASS_REQUIRE='force', DISPLAY=':0')
    command = 'php -d display_errors=0 /dev/stdin ' + shlex.quote('/home/' + user)
    result = subprocess.run(['ssh', '-T', '-p', '65002', '-o', 'ConnectTimeout=20', '-o', 'StrictHostKeyChecking=accept-new',
                             user + '@' + host, command], input=code, encoding='utf-8', env=env,
                            capture_output=True, timeout=90, start_new_session=True)
    print(result.stdout, end='')
    if result.returncode:
        raise SystemExit('Independent grade rehearsal did not complete')
