"""Back up only frontend entries about to be uploaded, outside the document root.

The archive and an extracted verification copy remain private on Hostinger.
Does not read or write the application database or publish any files.
"""
import ipaddress
import hashlib
import json
import os
import pathlib
import re
import shlex
import subprocess
import tempfile


def backup_arguments(env, entries):
    user = env['DEPLOY_USER'].strip()
    host = env['DEPLOY_HOST'].strip()
    ipaddress.IPv4Address(host)
    if not re.fullmatch(r'[a-zA-Z0-9_-]+', user):
        raise ValueError('Unsupported SSH username')
    sha = env['DEPLOY_SHA']
    if not re.fullmatch(r'[a-f0-9]{40}', sha):
        raise ValueError('Expected full commit SHA')
    front = env['DEPLOY_FRONTEND'].strip().rstrip('/')
    if not front.startswith('/home/' + user + '/') or '..' in pathlib.PurePosixPath(front).parts:
        raise ValueError('Frontend must be below the configured account home')
    if not entries or any('/' in name or name in ['', '.', '..', 'api'] or name.startswith('-') for name in entries):
        raise ValueError('Invalid frontend package manifest')
    backup = '/home/' + user + '/.qhp-release-backups/' + sha
    kind = env.get('DEPLOY_BACKUP_KIND', 'frontend')
    if kind not in ['frontend', 'api']:
        raise ValueError('Unsupported backup kind')
    backup += '/' + kind + '/' + hashlib.sha256(front.encode()).hexdigest()[:12]
    command = 'BACKUP_PACKAGE_KIND=' + kind + ' bash -s -- ' + ' '.join(shlex.quote(p) for p in [front, backup, *entries])
    return user + '@' + host, command


REMOTE_SCRIPT = r'''set -euo pipefail
stage=prepare
trap 'printf "BACKUP_FAILED:%s\n" "$stage" >&2' ERR
umask 077
front="$1"
backup="$2"
shift 2
test -d "$front"
mkdir -p "$backup"
if [ -f "$backup/verified" ]; then
  stage=verify-existing-archive
  tar -tzf "$backup/frontend.tgz" >/dev/null
  echo "Private frontend rollback archive already verified."
  exit 0
fi
existing=()
for name in "$@"; do
  if [ -e "$front/$name" ] || [ -L "$front/$name" ]; then
    if [ "${BACKUP_PACKAGE_KIND:-frontend}" = api ] && { [ -L "$front/$name" ] || [ -n "$(find "$front/$name" -type l -print -quit)" ]; }; then printf 'BACKUP_FAILED:symlink-check\n' >&2; exit 1; fi
    existing+=("$name")
  fi
done
test "${#existing[@]}" -gt 0
stage=create-archive
tar -czf "$backup/frontend.tgz" -C "$front" -- "${existing[@]}"
stage=extract-archive
mkdir -p "$backup/restore-check"
tar -xzf "$backup/frontend.tgz" -C "$backup/restore-check"
stage=compare-source
tar -dzf "$backup/frontend.tgz" -C "$front" >/dev/null
stage=compare-restored-index
if [ -f "$backup/restore-check/index.html" ]; then cmp "$front/index.html" "$backup/restore-check/index.html"; fi
stage=verify-archive
tar -tzf "$backup/frontend.tgz" >/dev/null
printf '%s\n' verified > "$backup/verified"
echo "Private frontend rollback archive created and extraction verified."
'''


def main():
    package = os.environ.get('DEPLOY_PACKAGE', 'dist/client')
    if package not in ['dist/client', 'dist/api-release']:
        raise ValueError('Unsupported deployment package')
    entries = sorted(p.name for p in pathlib.Path(package).iterdir())
    targets = [os.environ['DEPLOY_FRONTEND']]
    if os.environ.get('SEPARATE_SUBDOMAINS') == 'true':
        user = os.environ['DEPLOY_USER'].strip()
        suffix = '/api' if os.environ.get('DEPLOY_BACKUP_KIND') == 'api' else ''
        targets += ['/home/' + user + '/domains/' + sub + '.msht.io/public_html' + suffix for sub in ['m1', 'm2']]
    with tempfile.TemporaryDirectory() as tmp:
        askpass = pathlib.Path(tmp, 'askpass')
        askpass.write_text('#!/bin/sh\nprintf "%s\\n" "$DEPLOY_SSH_PASSWORD"\n')
        askpass.chmod(0o700)
        env = dict(os.environ, SSH_ASKPASS=str(askpass), SSH_ASKPASS_REQUIRE='force', DISPLAY=':0')
        for target in dict.fromkeys(targets):
            settings = dict(os.environ, DEPLOY_FRONTEND=target)
            host, command = backup_arguments(settings, entries)
            try:
                result = subprocess.run(['ssh', '-T', '-p', '65002', '-o', 'ConnectTimeout=30', '-o', 'ServerAliveInterval=15', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'NumberOfPasswordPrompts=1', host, command], input=REMOTE_SCRIPT.encode(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, timeout=180, start_new_session=True)
            except subprocess.TimeoutExpired:
                raise SystemExit('Deployment backup timed out; upload has not started.')
            if result.returncode:
                match = re.search(rb'BACKUP_FAILED:([a-z-]+)', result.stderr)
                stage = match.group(1).decode() if match else 'ssh-or-unknown'
                raise SystemExit('Deployment backup failed at ' + stage + '; upload has not started. Private details withheld.')
        print('Private deployment backup and isolated extraction verified; no database changes.')


if __name__ == '__main__':
    main()
