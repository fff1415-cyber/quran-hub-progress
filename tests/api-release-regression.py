import hashlib
import importlib.util
import os
import pathlib
import shutil
import subprocess
import tempfile


def module(name, path):
    spec=importlib.util.spec_from_file_location(name,path)
    result=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


prepare=module('prepare_api','scripts/prepare-hostinger-api.py')
verify=module('verify_api','scripts/verify-hostinger-api.py')
backup=module('backup_api','scripts/backup-hostinger-frontend.py')
with tempfile.TemporaryDirectory() as temporary:
    root=pathlib.Path(temporary,'repository');root.mkdir()
    def git(*args):
        return subprocess.check_output(['git','-C',str(root),'-c','user.name=fixture','-c','user.email=fixture@example.test','-c','commit.gpgsign=false',*args],stderr=subprocess.PIPE).decode().strip()
    git('init','-q','--initial-branch=main')
    (root/'api/routes').mkdir(parents=True)
    before=b'<?php echo "old fixture";\n';after=b'<?php file_put_contents(__DIR__ . "/executed", "fixture"); echo "new fixture";\n'
    (root/'api/routes/route.php').write_bytes(before)
    (root/'api/auth.php').write_text('unchanged authentication fixture')
    git('add','.');git('commit','-qm','fixture base');base=git('rev-parse','HEAD')
    (root/'api/routes/route.php').write_bytes(after)
    (root/'api/routes/new.php').write_bytes(b'<?php echo "new file";\n')
    (root/'frontend.txt').write_text('unrelated')
    git('add','.');git('commit','-qm','fixture release');head=git('rev-parse','HEAD')
    (root/'api/auth.php').write_text('uncommitted authentication must never be uploaded')
    (root/'api/routes/route.php').write_text('uncommitted route must not be uploaded either')
    (root/'api/config.php').write_text('synthetic untracked configuration')
    manifest=prepare.prepare_api_release(root,base,head)
    assert [item['path'] for item in manifest]==['routes/new.php','routes/route.php']
    assert (root/'dist/api-release/routes/route.php').read_bytes()==after
    assert not (root/'dist/api-release/auth.php').exists()
    assert not (root/'dist/api-release/config.php').exists()
    assert manifest[1]['beforeSha256']==hashlib.sha256(before).hexdigest()
    target=pathlib.Path(temporary,'target');(target/'routes').mkdir(parents=True)
    (target/'routes/route.php').write_bytes(before)
    args=[value for item in manifest for value in [item['path'],item['sha256'],item['beforeSha256'] or 'MISSING']]
    def run(phase):
        return subprocess.run(['bash','-s','--',str(target),phase,*args],input=verify.REMOTE_VERIFY,text=True,capture_output=True)
    assert run('before').returncode==0,'approved previous source must pass the read-only preflight'
    (target/'routes/route.php').write_text('unreviewed server change')
    assert run('before').returncode!=0,'unexpected server changes must halt before replacement'
    shutil.copytree(root/'dist/api-release',target,dirs_exist_ok=True)
    assert run('before').returncode==0,'retry can recognize the already-approved new source'
    if shutil.which('php'):
        assert run('after').returncode==0,'actual PHP syntax and file hash validation must pass'
        assert not (target/'routes/executed').exists(),'php -l must not execute application code'
        invalid=b'<?php broken fixture syntax {{{'
        (target/'routes/route.php').write_bytes(invalid)
        args[args.index('routes/route.php')+1]=hashlib.sha256(invalid).hexdigest()
        assert run('after').returncode!=0,'even matching bytes must fail if PHP syntax is invalid'
    else:
        print('PHP CLI unavailable locally; the isolated CI runs the after-upload syntax fixture.')
    env={'DEPLOY_USER':'example','DEPLOY_HOST':'192.0.2.1','DEPLOY_API_PATH':'/home/example/domains/example.test/public_html/api'}
    verify.verify_arguments(env,manifest)
    try:verify.verify_arguments(env,[{'path':'../config.php','sha256':'a'*64}])
    except ValueError:pass
    else:raise AssertionError('manifest escaped the API root')
    # A package-specific backup cannot reuse the frontend's verification marker.
    backup_env={'DEPLOY_USER':'example','DEPLOY_HOST':'192.0.2.1','DEPLOY_SHA':'a'*40,'DEPLOY_FRONTEND':env['DEPLOY_API_PATH'],'DEPLOY_BACKUP_KIND':'api'}
    _,command=backup.backup_arguments(backup_env,['routes'])
    assert '/api/' in command and 'BACKUP_PACKAGE_KIND=api' in command
    archive=pathlib.Path(temporary,'api-backup')
    result=subprocess.run(['bash','-s','--',str(target),str(archive),'routes'],input=backup.REMOTE_SCRIPT,text=True,capture_output=True,env=dict(os.environ,BACKUP_PACKAGE_KIND='api'))
    assert result.returncode==0
    assert (archive/'restore-check/routes/new.php').is_file()
    # Tracked runtime configuration is rejected rather than deployed.
    git('add','api/config.php');git('commit','-qm','fixture forbidden config');bad=git('rev-parse','HEAD')
    try:prepare.prepare_api_release(root,base,bad)
    except ValueError as error:assert 'configuration' in str(error)
    else:raise AssertionError('runtime configuration was staged')
print('PASS: exact committed API diff only, authentication/config exclusion, baseline/hash guards, private backup and safe retry')
