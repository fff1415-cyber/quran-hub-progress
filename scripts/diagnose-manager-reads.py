"""Execute deployed read handlers inside a database read-only transaction."""
import ipaddress
import json
import os
import pathlib
import re
import shlex
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor

user = os.environ['DEPLOY_USER'].strip().split('@')[0]
host = str(ipaddress.IPv4Address(os.environ['DEPLOY_HOST'].strip()))
if not re.fullmatch(r'[A-Za-z0-9_-]+', user):
    raise SystemExit('Unexpected SSH user')
root = '/home/' + user + '/domains/msht.io/public_html'
candidate = os.environ['RELEASE_CANDIDATE']
if not re.fullmatch(r'[0-9a-f]{40}', candidate):
    raise SystemExit('Unexpected release identifier')
script = pathlib.Path('scripts/diagnose-manager-reads.php').read_text(encoding='utf-8')
with tempfile.TemporaryDirectory() as folder:
    ask = pathlib.Path(folder, 'askpass')
    ask.write_text('#!/bin/sh\nprintf "%s\\n" "$DEPLOY_SSH_PASSWORD"\n')
    ask.chmod(0o700)
    env = dict(os.environ, SSH_ASKPASS=str(ask), SSH_ASKPASS_REQUIRE='force', DISPLAY=':0')
    result = subprocess.run(['ssh','-T','-p','65002','-o','ConnectTimeout=20','-o','StrictHostKeyChecking=accept-new',
        user + '@' + host, 'php -d display_errors=0 /dev/stdin ' + shlex.quote(root) + ' ' + shlex.quote(candidate)],
        input=script, encoding='utf-8', env=env, capture_output=True, timeout=65, start_new_session=True)
    print(result.stdout, end='')
    if result.returncode:
        raise SystemExit('Manager read probe did not complete')

report = json.loads(result.stdout)
def check_entry(page):
    response = subprocess.check_output(['curl','-sS','--connect-timeout','12','--max-time','18',
        '--resolve','msht.io:443:'+host,'-w','\n%{http_code}','https://msht.io'+page], stderr=subprocess.DEVNULL)
    html, code = response.rsplit(b'\n',1)
    return {'status': int(code), 'published_entry': ('<!-- qhp-grade-release:'+candidate+' -->').encode() in html,
        'server_error_page': b'Something went wrong on our end' in html}

pages = ['/mm/manager', *['/mm/teacher?h='+str(int(value)) for value in report['halaqa_shapes']]]
with ThreadPoolExecutor(max_workers=3) as executor:
    checks = dict(zip(pages, executor.map(check_entry,pages)))
print(json.dumps({'status':'halaqa_public_entry_reads','routes':checks,'production_writes':False}))
