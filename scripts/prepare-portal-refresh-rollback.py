"""Build the unchanged published baseline; this release introduces no new stored formats."""
import hashlib
import io
import json
import pathlib
import shutil
import subprocess
import tarfile
import tempfile
import zipfile

BASE = '9d843a4aac7282392ee4ee661c4f589488cbda49'

if __name__ == '__main__':
    root = pathlib.Path.cwd()
    archive = subprocess.run(['git', 'archive', BASE], check=True, stdout=subprocess.PIPE).stdout
    with tempfile.TemporaryDirectory() as temporary:
        target = pathlib.Path(temporary, 'rollback')
        with tarfile.open(fileobj=io.BytesIO(archive)) as source:
            source.extractall(target, filter='data')
        (target / 'node_modules').symlink_to((root / 'node_modules').resolve(), target_is_directory=True)
        subprocess.run(['node', str(root / 'tests/evaluation-reference-regression.cjs'), str(target / 'src/routes/musammi.tsx')], cwd=root, check=True)
        subprocess.run(['php', '-l', str(target / 'api/routes/app_state.php')], check=True)
        with tempfile.TemporaryFile(mode='w+') as log:
            result = subprocess.run(['npm', 'run', 'build:hostinger'], cwd=target, stdout=log, stderr=subprocess.STDOUT)
            if result.returncode:
                log.seek(0)
                print(log.read()[-4000:])
                raise SystemExit('Portal rollback build failed')
        output = root / 'dist/portal-refresh-compatible-rollback'
        output.mkdir(parents=True, exist_ok=True)
        shutil.make_archive(str(output / 'frontend'), 'zip', target / 'dist/client')
        with zipfile.ZipFile(output / 'api-only.zip', 'w') as backend:
            backend.write(target / 'api/routes/app_state.php', 'api/routes/app_state.php')
        with zipfile.ZipFile(output / 'api-only.zip') as backend:
            assert backend.namelist() == ['api/routes/app_state.php']
            assert backend.read(backend.namelist()[0]) == (target / 'api/routes/app_state.php').read_bytes()
        hashes = {file.name: hashlib.sha256(file.read_bytes()).hexdigest() for file in output.glob('*.zip')}
        (output / 'manifest.json').write_text(json.dumps({'base': BASE, 'sha256': hashes, 'database_restore': False}, indent=2))
        print('PASS: compatible published baseline built; pinned evaluation rules and complete histories retained; API archive round-trip exact. No database restore or production calls.')
