"""Preserve the exact deployed frontend/API privately and report only aggregates."""
import ipaddress
import os
import pathlib
import re
import shlex
import subprocess
import tempfile

user = os.environ['DEPLOY_USER'].strip().split('@')[0]
host = str(ipaddress.IPv4Address(os.environ['DEPLOY_HOST'].strip()))
sha = os.environ['EXPECTED_RELEASE']
if not re.fullmatch(r'[A-Za-z0-9_-]+', user) or not re.fullmatch(r'[a-f0-9]{40}', sha):
    raise SystemExit('Invalid rollback audit scope')
home = '/home/' + user
root = home + '/domains/msht.io/public_html'
archive_script = '''set -euo pipefail
umask 077
root="$1"; home="$2"; sha="$3"
test "$(realpath "$root")" = "$root"
test "$(cat "$root/deploy-sha.txt")" = "$sha"
backup="$home/.qhp-rollback-audit"
test ! -L "$backup"
mkdir -p -m 700 "$backup"
test "$(stat -c %a "$backup")" = 700
dest="$(mktemp -d "$backup/${sha:0:12}-XXXXXXXX")"
tar -czf "$dest/current-site.tgz" -C "$root" -- index.html deploy-sha.txt .htaccess assets api
gzip -t "$dest/current-site.tgz"
tar -dzf "$dest/current-site.tgz" -C "$root" >/dev/null
test "$(tar -xOzf "$dest/current-site.tgz" deploy-sha.txt)" = "$sha"
printf 'private_code_backup=%s\n' "${dest##*/}"
'''
with tempfile.TemporaryDirectory() as folder:
    askpass = pathlib.Path(folder, 'askpass')
    askpass.write_text('#!/bin/sh\nprintf "%s\\n" "$DEPLOY_SSH_PASSWORD"\n')
    askpass.chmod(0o700)
    env = dict(os.environ, SSH_ASKPASS=str(askpass), SSH_ASKPASS_REQUIRE='force', DISPLAY=':0')
    args = ['ssh','-T','-p','65002','-o','ConnectTimeout=30','-o','StrictHostKeyChecking=accept-new',
            '-o','NumberOfPasswordPrompts=1',user+'@'+host]
    def remote(command, data):
        result = subprocess.run(args+[command], input=data, env=env, encoding='utf-8',
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=155, start_new_session=True)
        print(result.stdout, end='')
        if result.returncode:
            raise SystemExit('Private rollback audit step failed; production was not modified')
    remote('bash -s -- ' + shlex.join([root,home,sha]), archive_script)
    remote('php -d display_errors=0 /dev/stdin ' + shlex.join([root,sha]),
           pathlib.Path('scripts/rollback-summary.php').read_text(encoding='utf-8'))
