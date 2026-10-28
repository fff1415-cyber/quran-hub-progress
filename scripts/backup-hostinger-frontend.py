"""Back up only frontend entries about to be uploaded, outside the document root.

The archive and an extracted verification copy remain private on Hostinger.
Does not read or write the application database or publish any files.
"""
import ipaddress
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
    command = 'bash -s -- ' + ' '.join(shlex.quote(p) for p in [front, backup, *entries])
    return user + '@' + host, command


REMOTE_SCRIPT = r'''set -euo pipefail
umask 077
front="$1"
backup="$2"
shift 2
test -d "$front"
mkdir -p "$backup"
if [ -f "$backup/verified" ]; then
  echo "Private frontend rollback archive already verified."
  exit 0
fi
existing=()
for name in "$@"; do
  if [ -e "$front/$name" ] || [ -L "$front/$name" ]; then existing+=("$name"); fi
done
test "${#existing[@]}" -gt 0
tar -czf "$backup/frontend.tgz" -C "$front" -- "${existing[@]}"
mkdir -p "$backup/restore-check"
tar -xzf "$backup/frontend.tgz" -C "$backup/restore-check"
if [ -f "$front/index.html" ]; then cmp "$front/index.html" "$backup/restore-check/index.html"; fi
tar -tzf "$backup/frontend.tgz" >/dev/null
printf '%s\n' verified > "$backup/verified"
echo "Private frontend rollback archive created and extraction verified."
'''


def main():
    entries = sorted(p.name for p in pathlib.Path('dist/client').iterdir())
    host, command = backup_arguments(os.environ, entries)
    with tempfile.TemporaryDirectory() as tmp:
        askpass = pathlib.Path(tmp, 'askpass')
        askpass.write_text('#!/bin/sh\nprintf "%s\\n" "$DEPLOY_SSH_PASSWORD"\n')
        askpass.chmod(0o700)
        env = dict(os.environ, SSH_ASKPASS=str(askpass), SSH_ASKPASS_REQUIRE='force', DISPLAY=':0')
        try:
            result = subprocess.run(['ssh', '-T', '-p', '65002', '-o', 'ConnectTimeout=30', '-o', 'ServerAliveInterval=15', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'NumberOfPasswordPrompts=1', host, command], input=REMOTE_SCRIPT.encode(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, timeout=180, start_new_session=True)
        except subprocess.TimeoutExpired:
            raise SystemExit('Frontend backup timed out; upload has not started.')
        if result.returncode:
            raise SystemExit('Frontend backup or restore verification failed; upload has not started. Private details withheld.')
        print('Private frontend backup and isolated extraction verified; no database changes.')


if __name__ == '__main__':
    main()
