"""Stage, verify, and publish a pinned rollback with a verified code fallback."""
import hashlib
import ipaddress
import json
import os
import pathlib
import re
import shlex
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.parse

mode, base, target = sys.argv[1:4]
host = str(ipaddress.IPv4Address(os.environ['DEPLOY_HOST'].strip()))
user = os.environ['DEPLOY_USER'].strip().split('@')[0]
if mode not in ('check', 'publish', 'revert') or not re.fullmatch(r'[A-Za-z0-9_-]+', user) or not all(
        re.fullmatch(r'[0-9a-f]{40}', sha) for sha in (base, target)):
    raise SystemExit('Invalid protected rollback parameters')
home = '/home/' + user
stage = home + '/.qhp-private/qalaid-release-' + target
repo = pathlib.Path.cwd()
candidate = repo / 'candidate'
client = candidate / 'dist/client'

def git(*args):
    return subprocess.check_output(['git', *args], cwd=repo)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def site(path, method='GET'):
    result = subprocess.run(['curl', '-sS', '--connect-timeout', '10', '--max-time', '16',
        '--resolve', 'msht.io:443:' + host, '-H', 'Cache-Control: no-cache', '-X', method,
        '-w', '\n%{http_code}', 'https://msht.io' + path], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    if result.returncode:
        return 0, b''
    body, code = result.stdout.rsplit(b'\n', 1)
    return int(code), body

def live_marker():
    status, body = site('/deploy-sha.txt?rollback_check=' + str(time.time_ns()))
    return body.decode().strip() if status == 200 else ''

def health():
    status, body = site('/api/r.php?path=%2Fhealth&rollback_check=' + str(time.time_ns()))
    if status != 200:
        return False
    try:
        data = json.loads(body)
        return data.get('ok') is True and data['checks'].get('grade_protocol') == 'atomic' and data['checks'].get('grade_workers_reloadable') is True
    except (ValueError, KeyError, AttributeError):
        return False

def live_acceptance():
    if live_marker() != target or not health():
        return False
    for route in ('/m6/teacher?h=1&w=1&view=programs', '/mm/teacher', '/mm/manager'):
        separator = '&' if '?' in route else '?'
        status, html = site(route + separator + 'rollback_check=' + str(time.time_ns()))
        if status != 200 or ('<!-- qhp-grade-release:' + target + ' -->').encode() not in html:
            return False
    status, body = site('/api/r.php?' + urllib.parse.urlencode({'path':'/tenant-resolve','q':'mm'}))
    if status != 200:
        return False
    status, _ = site('/api/r.php?path=%2Fapp-state&key=grades&grade_protocol=1')
    if status != 401:
        return False
    published = (client / 'index.html').read_bytes()
    paths = set(re.findall(rb'(?:src|href)="(/assets/[a-zA-Z0-9_.-]+\.(?:js|css))"', published))
    if not paths:
        return False
    program_assets = list((client / 'assets').glob('TeacherHalaqaProgramsPanel-*.js'))
    if len(program_assets) != 1:
        return False
    paths.add(('/assets/' + program_assets[0].name).encode())
    for path in paths:
        relative = path.decode()
        status, body = site(relative)
        if status != 200 or digest(body) != digest((client / relative.lstrip('/')).read_bytes()):
            return False
    return True

if mode == 'revert':
    if live_marker() == base and health():
        print('LIVE_OK previous code already active')
        raise SystemExit(0)
    if live_marker() != target:
        raise SystemExit('Refusing rollback because the live release has moved')
    with tempfile.TemporaryDirectory() as temp:
        ask = pathlib.Path(temp) / 'askpass'
        ask.write_text('#!/bin/sh\nprintf "%s\\n" "$DEPLOY_SSH_PASSWORD"\n')
        ask.chmod(0o700)
        env = dict(os.environ, SSH_ASKPASS=str(ask), SSH_ASKPASS_REQUIRE='force', DISPLAY=':0')
        ssh = ['ssh','-T','-p','65002','-o','ConnectTimeout=20','-o','StrictHostKeyChecking=accept-new',
               '-o','NumberOfPasswordPrompts=1',user+'@'+host]
        command = shlex.join(['php','-d','display_errors=0',stage+'/protected-rollback-release.php','revert',home,base,target])
        subprocess.run(ssh+[command], env=env, start_new_session=True, timeout=100, check=True)
    if live_marker() != base or not health():
        raise SystemExit('Rollback has not passed live verification')
    print('LIVE_OK previous code restored; database untouched')
    raise SystemExit(0)

if git('rev-parse', target + '^{tree}').decode().strip() != pathlib.Path('scripts/safe-legacy-tree.txt').read_text().strip():
    raise SystemExit('The approved release tree does not match the tested source')
if not health() or live_marker() != base:
    raise SystemExit('Production has moved or the atomic baseline is unhealthy')

changes = git('diff', '--name-status', '--no-renames', base, target, '--', 'api/').decode().splitlines()
if git('diff', '--name-only', base, target, '--', 'public/', '.env.hostinger'):
    raise SystemExit('Unexpected shared public files or hosting configuration changes')
retired = 'api/lib/plan-profile.php'
retire_profile = 'D\t' + retired in changes
with tempfile.TemporaryDirectory() as temp:
    tmp = pathlib.Path(temp)
    package = tmp / 'package'
    package.mkdir()
    records = []
    for change in changes:
        status, path = change.split('\t')
        if status == 'D' and path == retired:
            continue
        if status != 'M' or not re.fullmatch(r'api/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+\.php', path) or pathlib.Path(path).name in ('config.php','config.platform.php'):
            raise SystemExit('Unexpected API path change: ' + path)
        old, new = (git('show', sha+':'+path) for sha in (base, target))
        dest = package / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(new)
        subprocess.run(['php','-l',str(dest)], check=True, stdout=subprocess.DEVNULL)
        records.append({'path':path.removeprefix('api/'),'beforeSha256':digest(old),'sha256':digest(new)})
    (package/'api.json').write_text(json.dumps(records))
    (package/'retired-sha.txt').write_text(digest(git('show', base+':'+retired)) if retire_profile else '')
    (package/'index.html').write_bytes((client/'index.html').read_bytes())
    for path in ('grade-release-entry.php','protected-rollback-release.php'):
        (package/path).write_bytes((repo/'scripts'/path).read_bytes())
    assets = list((client/'assets').iterdir())
    if not assets or any(not item.is_file() or item.is_symlink() or not re.fullmatch(r'[A-Za-z0-9_.-]+', item.name) for item in assets):
        raise SystemExit('Unexpected frontend asset layout')
    bundle = tmp/'package.tgz'
    with tarfile.open(bundle,'w:gz') as archive:
        for item in sorted(package.iterdir()):
            archive.add(item, arcname=item.name)
        for asset in assets:
            archive.add(asset, arcname='assets/'+asset.name, recursive=False)
    ask = tmp/'askpass'
    ask.write_text('#!/bin/sh\nprintf "%s\\n" "$DEPLOY_SSH_PASSWORD"\n')
    ask.chmod(0o700)
    env = dict(os.environ, SSH_ASKPASS=str(ask), SSH_ASKPASS_REQUIRE='force', DISPLAY=':0')
    ssh = ['ssh','-T','-p','65002','-o','ConnectTimeout=20','-o','StrictHostKeyChecking=accept-new',
           '-o','NumberOfPasswordPrompts=1',user+'@'+host]
    upload = 'umask 077; test ! -L {stage} && mkdir -m 700 -p {stage} && test ! -e {previous} && tar -xzf - -C {stage}'.format(
        stage=shlex.quote(stage),previous=shlex.quote(stage+'/previous'))
    with bundle.open('rb') as stream:
        subprocess.run(ssh+[upload], stdin=stream, env=env, start_new_session=True, timeout=100, check=True)

    def remote(command):
        args = ['php','-d','display_errors=0',stage+'/protected-rollback-release.php',command,home,base,target]
        try:
            result = subprocess.run(ssh+[shlex.join(args)], env=env, start_new_session=True,
                                    timeout=100, capture_output=True, text=True)
        except subprocess.TimeoutExpired:
            print('Remote command timed out; checking the live marker', flush=True)
            return False
        print(result.stdout, end='', flush=True)
        return result.returncode == 0

    if not remote('check'):
        raise SystemExit('Production preflight did not match the approved baseline')
    if mode == 'check':
        raise SystemExit(0)
    result = remote('publish')
    if result:
        for _ in range(12):
            if live_acceptance():
                break
            time.sleep(5)
        else:
            result = False
    if not result:
        if live_marker() == target and remote('revert') and live_marker() == base and health():
            raise SystemExit('Candidate did not pass live verification. Previous code was restored.')
        if live_marker() == base and health():
            raise SystemExit('Candidate was not activated. Previous code is still healthy.')
        raise SystemExit('Release verification needs immediate investigation.')
    time.sleep(31)  # allow existing OPcache workers to release the prior include
    if not remote('finish') or not live_acceptance():
        if remote('revert') and live_marker() == base and health():
            raise SystemExit('Final live verification failed. Previous code was restored.')
        raise SystemExit('Final release verification needs immediate investigation.')
    print('LIVE_OK protected rollback, main site only, atomic grade API active')
