"""Prepare the previous API only. Native schema and every existing stored format stay identical."""
import hashlib
import json
import pathlib
import subprocess
import tempfile
import zipfile

BASE='67ef44143824ac5fb4757817b8f44cdff7f68217'
if __name__=='__main__':
    root=pathlib.Path.cwd()
    source=subprocess.run(['git','show',BASE+':api/routes/plans.php'],check=True,stdout=subprocess.PIPE).stdout
    output=root/'dist/catalog-noop-compatible-rollback';output.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory() as temporary:
        target=pathlib.Path(temporary,'plans.php');target.write_bytes(source)
        subprocess.run(['php','-l',str(target)],check=True)
        subprocess.run(['php','tests/backend-catalog-noop.php',str(target)],cwd=root,check=True)
    with zipfile.ZipFile(output/'api-only.zip','w') as archive:archive.writestr('api/routes/plans.php',source)
    with zipfile.ZipFile(output/'api-only.zip') as archive:
        assert archive.testzip() is None and archive.namelist()==['api/routes/plans.php']
        assert archive.read('api/routes/plans.php')==source
    (output/'manifest.json').write_text(json.dumps({'base':BASE,'database_restore':False,'frontend_replacement':False,'sha256':hashlib.sha256((output/'api-only.zip').read_bytes()).hexdigest()},indent=2))
    print('PASS: previous API reads preserved IDs and all current records; exact single-file rollback package verified without any database restore.')
