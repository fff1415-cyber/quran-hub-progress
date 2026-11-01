"""Build a compatible API with independent receipt routines, retaining all pending request readers."""
import hashlib
import io
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tarfile
import tempfile
import zipfile

BASE='ca3d341abc3d63e4c4110cef3c65bb51cf4c3c0e'
root=pathlib.Path.cwd();output=root/'dist/assignment-operation-compatible-rollback';output.mkdir(parents=True,exist_ok=True)
source=(root/'api/routes/plans.php').read_text();start=source.index('function plans_operation_payload(');end=source.index('function handle_assign_plan()',start)
routines=(root/'tests/fixtures/assignment-receipt-fallback.php').read_text().removeprefix('<?php\n')
fallback=source[:start]+routines+'\n'+source[end:]
target=output/'api/routes/plans.php';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(fallback)
module=(root/'api/lib/plan-completion-events.php').read_bytes();module_path=output/'api/lib/plan-completion-events.php';module_path.parent.mkdir(parents=True,exist_ok=True);module_path.write_bytes(module)
subprocess.run(['php','-l',str(target)],check=True)
environment=dict(os.environ,AUDIT_PLAN_SOURCE=str(target))
subprocess.run(['php','tests/backend-assignment-operation.php'],env=environment,check=True,stdout=subprocess.DEVNULL)
print('PASS: independent receipt fallback passes real legacy/current handlers, duplicate probes and partial-failure rollback on SQLite.')
if '--api-only' in sys.argv:raise SystemExit(0)
with tempfile.TemporaryDirectory() as temporary:
    folder=pathlib.Path(temporary,'compatible');archive=subprocess.run(['git','archive',BASE],check=True,stdout=subprocess.PIPE).stdout
    with tarfile.open(fileobj=io.BytesIO(archive)) as bundle:bundle.extractall(folder,filter='data')
    for name in ['src/lib/plans-service.ts','src/lib/plan-assignment-requests.ts','api/lib/plan-completion-events.php']:
        path=folder/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes((root/name).read_bytes())
    (folder/'api/routes/plans.php').write_text(fallback)
    (folder/'node_modules').symlink_to((root/'node_modules').resolve(),target_is_directory=True)
    for name in ['assignment-operation-client-regression.cjs','plan-server-confirmation.cjs']:
        subprocess.run(['node',str(root/'tests'/name)],cwd=folder,check=True)
    subprocess.run(['node',str(root/'tests/scientific-hifz-regression.cjs'),str(folder/'src/lib/scientific-grades.ts')],cwd=root,check=True)
    with tempfile.TemporaryFile(mode='w+') as log:
        result=subprocess.run(['npm','run','build:hostinger'],cwd=folder,stdout=log,stderr=subprocess.STDOUT)
        if result.returncode:log.seek(0);print(log.read()[-4000:]);raise SystemExit('Compatible assignment package build failed')
    feature=os.environ['AUDIT_FEATURE_SHA'];assert len(feature)==40 and all(c in '0123456789abcdef' for c in feature)
    manifest={'base':BASE,'feature':feature,'variant':'assignment-receipts-independent-api','database_restore':False,'api_sha256':hashlib.sha256(fallback.encode()).hexdigest()}
    (folder/'dist/client/deploy-sha.txt').write_text(feature+'\n');(folder/'dist/client/compatibility-release.json').write_text(json.dumps(manifest,indent=2))
    shutil.make_archive(str(output/'frontend'),'zip',folder/'dist/client')
    with zipfile.ZipFile(output/'api-only.zip','w') as package:
        package.writestr('api/routes/plans.php',fallback);package.writestr('api/lib/plan-completion-events.php',module)
    for file in ['frontend.zip','api-only.zip']:
        with zipfile.ZipFile(output/file) as package:assert package.testzip() is None
    with zipfile.ZipFile(output/'api-only.zip') as package:assert set(package.namelist())=={'api/routes/plans.php','api/lib/plan-completion-events.php'} and package.read('api/routes/plans.php').decode()==fallback and package.read('api/lib/plan-completion-events.php')==module
    manifest['archives']={name:hashlib.sha256((output/name).read_bytes()).hexdigest() for name in ['frontend.zip','api-only.zip']};(output/'manifest.json').write_text(json.dumps(manifest,indent=2))
print('PASS: compatible frontend keeps pending drafts/receipt readers and earlier no-reset/scientific-rule safeguards; API/archive identity checked without restoring any database.')
