import importlib.util
import pathlib
import subprocess
import tempfile

spec = importlib.util.spec_from_file_location('backup', 'scripts/backup-hostinger-frontend.py')
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)
env = {'DEPLOY_USER':'example', 'DEPLOY_HOST':'192.0.2.1', 'DEPLOY_SHA':'a'*40, 'DEPLOY_FRONTEND':'/home/example/domains/example.test/public_html'}
host, cmd = backup.backup_arguments(env, ['index.html','.htaccess','assets'])
assert host == 'example@192.0.2.1' and '.qhp-release-backups/' in cmd
for entries in [['api'],['../config.php'],['--remove-files'],[]]:
    try: backup.backup_arguments(env, entries)
    except ValueError: pass
    else: raise AssertionError('Unsafe manifest accepted')
with tempfile.TemporaryDirectory() as tmp:
    front=pathlib.Path(tmp,'front');front.mkdir()
    archive=pathlib.Path(tmp,'private-backup')
    (front/'index.html').write_text('previous frontend')
    (front/'assets').mkdir();(front/'assets'/'old.js').write_text('previous asset')
    (front/'api').mkdir();(front/'api'/'config.php').write_text('synthetic fixture only')
    for _ in range(2):
        subprocess.run(['bash','-s','--',str(front),str(archive),'index.html','assets','new-file.txt'],input=backup.REMOTE_SCRIPT,text=True,check=True,capture_output=True)
    assert (archive/'restore-check'/'index.html').read_text()=='previous frontend'
    assert not (archive/'restore-check'/'api').exists()
    assert (front/'api'/'config.php').read_text()=='synthetic fixture only'
    assert (archive/'verified').is_file()
print('PASS: frontend backup extraction/idempotency and manifest boundaries; API untouched')
