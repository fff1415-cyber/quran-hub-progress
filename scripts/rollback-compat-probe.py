"""Run pinned legacy handlers against the isolated MariaDB restore only."""
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
    raise SystemExit('Invalid isolated audit scope')
home = '/home/' + user
root = home + '/domains/msht.io/public_html/api'
old = '7e9adf1d4059f20289f182e31613e18fe2cf0877'
paths = ['api/tenant.php', 'api/routes/app_state.php', 'api/routes/students.php', 'api/routes/semesters.php', 'api/routes/plans.php']
pieces = [pathlib.Path(name).read_bytes() for name in ['scripts/private-test-config.php','scripts/private-snapshot-restore.php']]
probe = pathlib.Path('scripts/rollback-compat-probe.php').read_text(encoding='utf-8')
if os.environ.get('QHP_SAFE_LEGACY_CANDIDATE') == '1':
    candidate = pathlib.Path('candidate')
    libs = ['grade-cell-operations','grade-plan-effect','grade-cutover','grade-write-api']
    for name in ['api/lib/'+lib+'.php' for lib in libs] + paths:
        source = (candidate/name).read_text(encoding='utf-8')
        source = re.sub(r"(?m)^require_once __DIR__\.'[^'\n]*grade-(?:cell-operations|plan-effect|cutover|write-api)\.php';\n", '', source)
        pieces.append(source.encode())
    pieces.append(pathlib.Path('scripts/safe-legacy-restore-cases.php').read_bytes())
    probe = probe.replace("$stage = 'stale_write_reproduction';", "$stage = 'candidate_restore_cases'; test_safe_legacy_restore($pdo,$cid,$reads); exit(0);", 1)
    probe = probe.replace('declare(strict_types=1);', "declare(strict_types=1);\ndefine('QHP_GRADE_WRITES_V1', true);", 1)
else:
    pieces.extend(subprocess.check_output(['git','show',old+':'+name]) for name in paths)
loaded = ''.join("eval(substr(base64_decode('" + base64.b64encode(piece).decode() + "'),5));\n" for piece in pieces)
probe = probe.replace('declare(strict_types=1);', 'declare(strict_types=1);\n'+loaded, 1)
with tempfile.TemporaryDirectory() as folder:
    askpass = pathlib.Path(folder, 'askpass')
    askpass.write_text('#!/bin/sh\nprintf "%s\\n" "$DEPLOY_SSH_PASSWORD"\n')
    askpass.chmod(0o700)
    env = dict(os.environ, SSH_ASKPASS=str(askpass), SSH_ASKPASS_REQUIRE='force', DISPLAY=':0')
    command = 'php -d display_errors=0 /dev/stdin ' + shlex.join([home,root])
    result = subprocess.run(['ssh','-T','-p','65002','-o','ConnectTimeout=30','-o','StrictHostKeyChecking=accept-new',
        '-o','NumberOfPasswordPrompts=1',user+'@'+host,command], input=probe, env=env, encoding='utf-8',
        capture_output=True, timeout=100, start_new_session=True)
    print(result.stdout, end='')
    if result.returncode:
        raise SystemExit('Isolated legacy compatibility probe did not complete')
