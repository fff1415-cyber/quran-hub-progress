"""Stage only API blobs changed in the approved commit range; never copy runtime configuration."""
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys


def prepare_api_release(repository, base, head):
    root = pathlib.Path(repository).resolve()
    def git(*args):
        return subprocess.check_output(['git', '-C', str(root), *args])
    for ref in [base, head]:
        git('rev-parse', '--verify', ref + '^{commit}')
    removed = git('diff', '--name-only', '-z', '--diff-filter=D', base, head, '--', 'api/')
    if removed:
        raise ValueError('API deletion requires a separate reviewed deployment plan')
    paths = [value.decode() for value in git('diff', '--name-only', '-z', '--diff-filter=ACMR', base, head, '--', 'api/').split(b'\0') if value]
    destination = root / 'dist' / 'api-release'
    if destination.is_symlink() or not destination.resolve().is_relative_to(root):
        raise ValueError('Unsafe API staging destination')
    staged = []
    for path in paths:
        relative = pathlib.PurePosixPath(path).relative_to('api')
        if '..' in relative.parts or relative.name in ['config.php', 'config.platform.php']:
            raise ValueError('Runtime configuration cannot be deployed by the changed-file package')
        mode = git('ls-tree', head, '--', path).decode().split()[0]
        if mode not in ['100644', '100755']:
            raise ValueError('API symlinks/submodules require separate review')
        content = git('show', head + ':' + path)
        previous = git('ls-tree', base, '--', path)
        before_hash = hashlib.sha256(git('show', base + ':' + path)).hexdigest() if previous else None
        staged.append((relative, content, before_hash))
    if not staged:
        raise ValueError('No changed API files to deploy')
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True)
    manifest = []
    for relative, content, before_hash in staged:
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        manifest.append({'path': str(relative), 'sha256': hashlib.sha256(content).hexdigest(), 'beforeSha256': before_hash})
    (root / 'dist' / 'api-release-manifest.json').write_text(json.dumps(manifest))
    return manifest


if __name__ == '__main__':
    result = prepare_api_release(pathlib.Path.cwd(), sys.argv[1], sys.argv[2])
    print('Prepared', len(result), 'changed API files from the approved commit; no runtime configuration included.')
