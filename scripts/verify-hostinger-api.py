"""Verify changed API file bytes and PHP syntax over SSH; does not invoke application routes."""
import ipaddress
import json
import os
import pathlib
import re
import shlex
import subprocess
import tempfile

REMOTE_VERIFY = r'''set -euo pipefail
root="$1"
phase="$2"
shift 2
while [ "$#" -gt 0 ]; do
  file="$1"
  expected="$2"
  before="$3"
  shift 3
  if [ "$phase" = before ] && [ ! -e "$root/$file" ] && [ ! -L "$root/$file" ] && [ "$before" = MISSING ]; then continue; fi
  test -f "$root/$file"
  test ! -L "$root/$file"
  actual=$(sha256sum "$root/$file" | cut -d ' ' -f 1)
  if [ "$phase" = before ]; then test "$actual" = "$before" || test "$actual" = "$expected";
  else
    test "$actual" = "$expected"
    case "$file" in *.php) php -l "$root/$file" >/dev/null 2>&1 ;; esac
  fi
done
echo 'API byte checks completed without executing application code.'
'''


def verify_arguments(env, manifest):
    user = env['DEPLOY_USER'].strip()
    host = env['DEPLOY_HOST'].strip()
    ipaddress.IPv4Address(host)
    if not re.fullmatch(r'[a-zA-Z0-9_-]+', user):
        raise ValueError('Invalid SSH username')
    root = env['DEPLOY_API_PATH'].strip().rstrip('/')
    if not root.startswith('/home/' + user + '/') or '..' in pathlib.PurePosixPath(root).parts:
        raise ValueError('API must remain below the configured account home')
    phase = env.get('API_VERIFY_PHASE', 'after')
    if phase not in ['before', 'after']:
        raise ValueError('Invalid API verification phase')
    args = [root, phase]
    if not manifest:
        raise ValueError('Expected a changed-file API manifest')
    for entry in manifest:
        path = pathlib.PurePosixPath(entry['path'])
        if path.is_absolute() or '..' in path.parts or path.name in ['config.php', 'config.platform.php'] or not re.fullmatch(r'[a-f0-9]{64}', entry['sha256']):
            raise ValueError('Invalid API manifest')
        before = entry.get('beforeSha256')
        if before is not None and not re.fullmatch(r'[a-f0-9]{64}', before):
            raise ValueError('Invalid API baseline fingerprint')
        args += [str(path), entry['sha256'], before or 'MISSING']
    return user + '@' + host, 'bash -s -- ' + ' '.join(shlex.quote(arg) for arg in args)


if __name__ == '__main__':
    manifest = json.loads(pathlib.Path('dist/api-release-manifest.json').read_text())
    targets = [os.environ['DEPLOY_API_PATH']]
    if os.environ.get('SEPARATE_SUBDOMAINS') == 'true':
        user = os.environ['DEPLOY_USER'].strip()
        targets += ['/home/' + user + '/domains/' + sub + '.msht.io/public_html/api' for sub in ['m1', 'm2']]
    with tempfile.TemporaryDirectory() as tmp:
        askpass = pathlib.Path(tmp, 'askpass')
        askpass.write_text('#!/bin/sh\nprintf "%s\\n" "$DEPLOY_SSH_PASSWORD"\n')
        askpass.chmod(0o700)
        env = dict(os.environ, SSH_ASKPASS=str(askpass), SSH_ASKPASS_REQUIRE='force', DISPLAY=':0')
        for target in dict.fromkeys(targets):
            host, command = verify_arguments(dict(os.environ, DEPLOY_API_PATH=target), manifest)
            try:
                result = subprocess.run(['ssh', '-T', '-p', '65002', '-o', 'ConnectTimeout=30', '-o', 'ServerAliveInterval=15', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'NumberOfPasswordPrompts=1', host, command], input=REMOTE_VERIFY.encode(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, timeout=90, start_new_session=True)
            except subprocess.TimeoutExpired:
                raise SystemExit('API verification timed out; no application route was invoked.')
            if result.returncode:
                raise SystemExit('Changed API file verification failed; private paths/details withheld.')
        if os.environ.get('API_VERIFY_PHASE') == 'before':
            print('Verified approved API baseline/retry hashes without modifying files or invoking routes.')
        else:
            print('Verified', len(manifest), 'changed API file hashes and server PHP syntax without database calls.')
