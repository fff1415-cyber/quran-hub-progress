import importlib.util
import pathlib
import subprocess
import tempfile

spec=importlib.util.spec_from_file_location('release_base','scripts/select-hostinger-release-base.py')
release_base=importlib.util.module_from_spec(spec)
spec.loader.exec_module(release_base)
with tempfile.TemporaryDirectory() as temporary:
    root=pathlib.Path(temporary)
    def git(*args):
        return subprocess.check_output(['git','-C',str(root),'-c','user.name=fixture','-c','user.email=fixture@example.test','-c','commit.gpgsign=false',*args],stderr=subprocess.PIPE).decode().strip()
    git('init','-q','--initial-branch=main')
    (root/'api').mkdir();(root/'api/route.php').write_text('previous published source')
    git('add','.');git('commit','-qm','published fixture');published=git('rev-parse','HEAD')
    (root/'api/route.php').write_text('approved source, upload failed before API')
    git('add','.');git('commit','-qm','failed deployment fixture');failed=git('rev-parse','HEAD')
    (root/'deployment.txt').write_text('deployment-only correction')
    git('add','.');git('commit','-qm','retry fixture');retry=git('rev-parse','HEAD')
    assert git('diff','--name-only',failed,retry,'--','api/')==''
    result=release_base.select_release_base(root,published+'\n',retry)
    assert result=={'base_sha':published,'api_changed':'true'},'retry must include unpublished API even when the latest push changes only deployment files'
    assert release_base.select_release_base(root,retry,retry)['api_changed']=='false','a fully published retry needs no API re-upload'
    for invalid in ['', 'unknown', '0'*40, published+'\n'+retry]:
        try:release_base.select_release_base(root,invalid,retry)
        except ValueError:pass
        else:raise AssertionError('unknown published baseline was accepted')
    git('checkout','-qb','divergent',published)
    (root/'other.txt').write_text('unapproved history')
    git('add','.');git('commit','-qm','divergent fixture');other=git('rev-parse','HEAD')
    try:release_base.select_release_base(root,other,retry)
    except ValueError:pass
    else:raise AssertionError('divergent marker was accepted')
workflow=pathlib.Path('.github/workflows/deploy.yml').read_text()
assert 'https://msht.io/deploy-sha.txt?release_base=' in workflow
assert 'PUBLISHED_SHA: ${{ steps.changes.outputs.base_sha }}' in workflow
assert 'github.event.before' not in workflow,'previous push is not evidence of a successful publication'
assert 'Verify existing API files before replacement' in workflow and 'Back up API code before upload' in workflow
assert workflow.index('Verify changed API files before frontend upload')<workflow.index('Sync frontend (SFTP primary)')
print('PASS: failed-push retry includes unpublished API; known ancestor marker required; static marker only, no application routes or database')
