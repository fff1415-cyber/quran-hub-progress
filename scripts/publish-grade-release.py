"""Stage fenced PHP and publish a same-origin, protocol-compatible HTML entry."""
import base64
import ipaddress
import json
import os
import pathlib
import re
import shlex
import subprocess
import sys
import tempfile
import time

mode = sys.argv[1]
user = os.environ['DEPLOY_USER'].strip().split('@')[0]
host = str(ipaddress.IPv4Address(os.environ['DEPLOY_HOST'].strip()))
base, target = (os.environ[k] for k in ('PUBLISHED_SHA', 'DEPLOY_SHA'))
if not re.fullmatch(r'[A-Za-z0-9_-]+', user) or not all(re.fullmatch(r'[a-f0-9]{40}', v) for v in (base, target)):
    raise SystemExit('Invalid main release parameters')

def health(expected):
    value = subprocess.check_output(['curl', '-fsS', '--connect-timeout', '12', '--max-time', '20',
        '--resolve', 'msht.io:443:' + host, '-H', 'Cache-Control: no-cache',
        'https://msht.io/api/r.php?path=%2Fhealth&cutover_check=' + str(time.time_ns())], stderr=subprocess.DEVNULL)
    data = json.loads(value)
    checks = data.get('checks', {})
    return data.get('ok') is True and checks.get('grade_protocol') == expected and checks.get('grade_workers_reloadable') is True

args = [mode, '/home/' + user, base, target]
payload = ''
if mode == 'api':
    items = json.loads(pathlib.Path('dist/api-release-manifest.json').read_text())
    for item in items:
        file = pathlib.Path('dist/api-release', item['path'])
        subprocess.run(['php', '-l', str(file)], check=True, stdout=subprocess.DEVNULL)
        item['content'] = base64.b64encode(file.read_bytes()).decode()
    payload = json.dumps(items)
elif mode == 'publish':
    expected = 'legacy' if base == 'c2d339b801cbb666ef91b1e704a5606267468d63' else 'atomic'
    if not health(expected):
        raise SystemExit('The live PHP fence has not reported the expected pre-publish mode')
    # Give workers that loaded the old code before staging time to finish. The server
    # additionally drains already connected sessions and takes an exclusive request lock.
    if expected == 'legacy':
        time.sleep(35)
        if not health(expected):
            raise SystemExit('The staged legacy mode did not remain healthy')
    args.append(base64.b64encode(pathlib.Path(os.environ['GRADE_ENTRY']).read_bytes()).decode())
elif mode == 'stage-fallback':
    args.append(base64.b64encode(pathlib.Path(os.environ['GRADE_FALLBACK_ENTRY']).read_bytes()).decode())
elif mode == 'rollback':
    if not health('atomic'):
        raise SystemExit('Fallback requires the active atomic API')
elif mode != 'prepare':
    raise SystemExit('Unsupported grade release operation')

code = pathlib.Path('scripts/grade-release-entry.php').read_text().removeprefix('<?php').strip()
with tempfile.TemporaryDirectory() as folder:
    ask = pathlib.Path(folder, 'askpass')
    ask.write_text('#!/bin/sh\nprintf "%s\\n" "$DEPLOY_SSH_PASSWORD"\n')
    ask.chmod(0o700)
    env = dict(os.environ, SSH_ASKPASS=str(ask), SSH_ASKPASS_REQUIRE='force', DISPLAY=':0')
    command = 'php -d display_errors=0 -r ' + shlex.quote(code) + ' -- ' + ' '.join(map(shlex.quote, args))
    result = subprocess.run(['ssh', '-T', '-p', '65002', '-o', 'ConnectTimeout=20', '-o', 'StrictHostKeyChecking=accept-new',
                             user + '@' + host, command], input=payload, encoding='utf-8', env=env,
                            capture_output=True, timeout=100, start_new_session=True)
    print(result.stdout, end='')
    if result.returncode:
        raise SystemExit('Grade release did not complete; check the safe status before retrying')
if mode in {'publish', 'rollback'} and not health('atomic'):
    raise SystemExit('The published entry did not verify atomic API mode')
