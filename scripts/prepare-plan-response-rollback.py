"""Build the current published compatible reader. This feedback-only release stores no new format."""
import hashlib
import io
import json
import os
import pathlib
import shutil
import subprocess
import tarfile
import tempfile
import zipfile

BASE='fa1cec6a55d4de88bf9eced6c17344987303f509'
if __name__=='__main__':
    root=pathlib.Path.cwd()
    with tempfile.TemporaryDirectory() as temporary:
        target=pathlib.Path(temporary,'rollback')
        archive=subprocess.run(['git','archive',BASE],check=True,stdout=subprocess.PIPE).stdout
        with tarfile.open(fileobj=io.BytesIO(archive)) as bundle:bundle.extractall(target,filter='data')
        (target/'node_modules').symlink_to((root/'node_modules').resolve(),target_is_directory=True)
        subprocess.run(['node',str(root/'tests/sard-refresh-regression.cjs'),str(target/'src/lib/sard-queue-refresh.ts')],cwd=root,check=True)
        subprocess.run(['node',str(root/'tests/evaluation-reference-regression.cjs'),str(target/'src/routes/musammi.tsx')],cwd=root,check=True)
        subprocess.run(['node',str(root/'tests/scientific-clear-marker-regression.cjs'),str(target/'src/lib/scientific-grades.ts')],cwd=root,check=True)
        subprocess.run(['node',str(root/'tests/continuity-client-regression.cjs')],cwd=target,check=True)
        with tempfile.TemporaryFile(mode='w+') as log:
            result=subprocess.run(['npm','run','build:hostinger'],cwd=target,stdout=log,stderr=subprocess.STDOUT)
            if result.returncode:log.seek(0);print(log.read()[-4000:]);raise SystemExit('Plan response rollback build failed')
        feature=os.environ['AUDIT_FEATURE_SHA'];assert len(feature)==40 and all(c in '0123456789abcdef' for c in feature)
        manifest={'base':BASE,'feature':feature,'variant':'plan-response-cache-compatible-baseline','database_restore':False,'api_replacement':False}
        (target/'dist/client/deploy-sha.txt').write_text(feature+'\n');(target/'dist/client/compatibility-release.json').write_text(json.dumps(manifest,indent=2))
        output=root/'dist/plan-response-compatible-rollback';output.mkdir(parents=True,exist_ok=True)
        shutil.make_archive(str(output/'frontend'),'zip',target/'dist/client')
        with zipfile.ZipFile(output/'frontend.zip') as package:
            assert package.testzip() is None and 'index.html' in package.namelist()
            assert not any(path.startswith('api/') for path in package.namelist())
            assert json.loads(package.read('compatibility-release.json'))==manifest
        manifest['package_sha256']=hashlib.sha256((output/'frontend.zip').read_bytes()).hexdigest();(output/'manifest.json').write_text(json.dumps(manifest,indent=2))
        print('PASS: published baseline preserves current queue/grades/attempts and pinned rules; compatible frontend package built and checked, no API/database restore.')
