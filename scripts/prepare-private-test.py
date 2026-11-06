"""Prepare private test configuration and a hidden-input CLI helper using existing SSH; no database writes."""
import ipaddress
import base64
import os
import pathlib
import re
import shlex
import subprocess
import tempfile

user=os.environ['DEPLOY_USER'].strip().split('@')[0]
host=os.environ['DEPLOY_HOST'].strip()
ipaddress.IPv4Address(host)
if not re.fullmatch(r'[A-Za-z0-9_-]+',user): raise ValueError('Invalid SSH user')
root='/'+os.environ['DEPLOY_API_PATH'].strip().strip('/')
if not root.startswith('/home/'): root='/home/'+user+root
if not root.startswith('/home/'+user+'/') or '..' in pathlib.PurePosixPath(root).parts or any('/'+sub+'.msht.io/' in root for sub in ['m1','m2']): raise ValueError('Invalid main root')
code=pathlib.Path('scripts/prepare-private-test.php').read_text().removeprefix('<?php').strip()
helper=base64.b64encode(pathlib.Path('scripts/private-test-config.php').read_bytes()).decode()
setter=base64.b64encode(pathlib.Path('scripts/configure-private-test.php').read_bytes()).decode()
code=code.replace('declare(strict_types=1);',"declare(strict_types=1);\n$qhpSetupParser=base64_decode('"+helper+"');\n$qhpSetupSetter=base64_decode('"+setter+"');",1)
with tempfile.TemporaryDirectory() as folder:
    ask=pathlib.Path(folder,'askpass')
    ask.write_text('#!/bin/sh\nprintf "%s\\n" "$DEPLOY_SSH_PASSWORD"\n')
    ask.chmod(0o700)
    environment=dict(os.environ,SSH_ASKPASS=str(ask),SSH_ASKPASS_REQUIRE='force',DISPLAY=':0')
    command='php -r '+shlex.quote(code)+' -- '+shlex.quote(root)+' '+shlex.quote('/home/'+user)
    result=subprocess.run(['ssh','-T','-p','65002','-o','ConnectTimeout=20','-o','StrictHostKeyChecking=accept-new',user+'@'+host,command],env=environment,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=180,start_new_session=True)
    # Verifier outputs only controlled metadata, counts and equality booleans, never records or credentials.
    print(result.stdout.decode())
    if result.returncode: raise SystemExit('Private test setup incomplete; private connection details withheld')
