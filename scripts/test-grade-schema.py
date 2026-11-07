"""Apply the pinned grade protocol DDL only to the verified independent restore."""
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

production = sys.argv[1:] == ['prepare-production']
helpers = [] if production else [php_body('scripts/' + file) for file in ('private-test-config.php', 'private-snapshot-restore.php')]
body = php_body('scripts/prepare-production-grade-schema.php' if production else 'scripts/test-grade-schema.php').replace('declare(strict_types=1);', '')
script = '<?php\ndeclare(strict_types=1);\n' + '\n'.join(helpers).replace('declare(strict_types=1);', '') + body
ddl = base64.b64encode(pathlib.Path('candidate/tests/fixtures/grade-cell-operations.sql').read_bytes()).decode()
args = [home, api, ddl]
def evidence(name):
    return json.loads(pathlib.Path(os.environ[name]).read_text())

def live():
    def get(path):
        return subprocess.check_output(['curl', '-fsS', '--connect-timeout', '12', '--max-time', '20',
                                        '--resolve', 'msht.io:443:' + host, 'https://msht.io' + path], stderr=subprocess.DEVNULL)
    if (get('/deploy-sha.txt').decode().strip() != 'c2d339b801cbb666ef91b1e704a5606267468d63' or
            json.loads(get('/api/r.php?path=%2Fhealth')).get('ok') is not True):
        raise SystemExit('Expected live baseline and healthy API required')

if production:
    backup, test = evidence('BACKUP_RESULT_FILE'), evidence('GRADE_TEST_RESULT_FILE')
    args += [backup['backup_id'], backup['sha256'], test['evidence']]
    live()
elif os.environ.get('RESTORE_RESULT_FILE'):
    backup, restore = evidence('BACKUP_RESULT_FILE'), evidence('RESTORE_RESULT_FILE')
    if restore.get('status') != 'independent_restore_verified' or restore['source_sha256'] != backup['sha256'] or restore['source_backup_id'] != backup['backup_id']:
        raise SystemExit('Restore does not match the fresh backup')
    args += [restore['private_test_backup_location'], restore['source_sha256']]

command = 'php -d display_errors=0 /dev/stdin ' + ' '.join(map(shlex.quote, args))
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
        raise SystemExit('Grade schema preparation did not complete; see safe stage information')
if production:
    live()
    print(json.dumps({'status': 'site_healthy_after_additive_preparation', 'protocol_active': False}))
