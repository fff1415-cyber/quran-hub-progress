"""Revert orchestration while retaining no-reset readers/writers and all new user records."""
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

BASE = 'a5b7744afb34928d8e83aa8eaeb300dd447270ba'

def fallback_false(source, name):
    start = source.index('export function '+name+'(')
    end = source.index('\n}', start)+2
    signature = source[start:source.index('{', start)]
    return source[:start]+signature+'{\n  return false;\n}'+source[end:]

def prepare(root, target):
    archive = subprocess.run(['git','archive',BASE],cwd=root,check=True,stdout=subprocess.PIPE).stdout
    with tarfile.open(fileobj=io.BytesIO(archive)) as bundle:
        bundle.extractall(target,filter='data')
    # Old full-sync orchestration and teacher UI are restored, never a data-reset implementation.
    for file, function in [('src/lib/mock-data.ts','ensureGradesSemester'),('src/lib/weekly-tests.ts','ensureWeeklyTestsSemester'),('src/lib/tarbawi-program.ts','ensureTarbawiSemester')]:
        (target/file).write_text(fallback_false((root/file).read_text(),function))
    (target/'src/components/SemesterSetupForm.tsx').write_text((root/'src/components/SemesterSetupForm.tsx').read_text())
    # Minimal independent server fallback: reject destructive empty snapshots before any write.
    state = (target/'api/routes/app_state.php').read_text()
    current = (root/'api/routes/app_state.php').read_text()
    start = current.index('function app_state_store_has_records(')
    end = current.index('\nfunction app_state_save_without_reset(',start)
    state = state.replace('\nfunction handle_set_app_state(): void','\n'+current[start:end]+'\nfunction handle_set_app_state(): void',1)
    offset = state.index('function handle_set_app_state(): void')
    needle = '    $pdo = db();'
    position = state.index(needle,offset)
    state = state[:position]+'''    if (in_array($key, ['grades','weekly_tests','scientific_grades','tarbawi_program'], true) && !app_state_store_has_records($key, $input['value'] ?? null)) {
        error_response('رُفض الطلب لأنه سيصفّر السجلات الحالية؛ لم تتغير البيانات المحفوظة', 409);
    }

'''+state[position:]
    (target/'api/routes/app_state.php').write_text(state)
    (target/'node_modules').symlink_to((root/'node_modules').resolve(),target_is_directory=True)
    return target

if __name__ == '__main__':
    root=pathlib.Path.cwd()
    with tempfile.TemporaryDirectory() as temporary:
        target=prepare(root,pathlib.Path(temporary,'rollback'))
        for test in ['continuity-client-regression.cjs','continuity-sync-regression.cjs']:
            subprocess.run(['node',str(root/'tests'/test),str(target)],cwd=root,check=True)
        subprocess.run(['node',str(root/'tests/evaluation-reference-regression.cjs'),str(target/'src/routes/musammi.tsx')],cwd=root,check=True)
        subprocess.run(['node',str(root/'tests/local-transfer-rollback.cjs'),str(target)],cwd=root,check=True)
        env={**os.environ,'AUDIT_APP_STATE_SOURCE':str(target/'api/routes/app_state.php')}
        subprocess.run(['php',str(root/'tests/backend-continuity-fallback.php')],cwd=root,env=env,check=True)
        subprocess.run(['php','-l',str(target/'api/routes/app_state.php')],check=True)
        with tempfile.TemporaryFile(mode='w+') as log:
            result=subprocess.run(['npm','run','build:hostinger'],cwd=target,stdout=log,stderr=subprocess.STDOUT)
            if result.returncode:
                log.seek(0);print(log.read()[-4000:]);raise SystemExit('Compatible continuity fallback build failed')
        output=root/'dist/continuity-compatible-rollback';output.mkdir(parents=True,exist_ok=True)
        shutil.make_archive(str(output/'frontend'),'zip',target/'dist/client')
        with zipfile.ZipFile(output/'api-only.zip','w') as archive:
            archive.write(target/'api/routes/app_state.php','api/routes/app_state.php')
        for file in ['frontend.zip','api-only.zip']:
            with zipfile.ZipFile(output/file) as archive:
                assert archive.testzip() is None
                if file=='frontend.zip':assert 'index.html' in archive.namelist()
                else:assert archive.read('api/routes/app_state.php')==(target/'api/routes/app_state.php').read_bytes()
        (output/'manifest.json').write_text(json.dumps({'base':BASE,'database_restore':False,'sha256':{file.name:hashlib.sha256(file.read_bytes()).hexdigest() for file in output.glob('*.zip')}},indent=2))
        print('PASS: compatible fallback restores old orchestration without reset, attribution, archive or loss of new writes; real client/PHP fixtures and archive extraction verified.')
