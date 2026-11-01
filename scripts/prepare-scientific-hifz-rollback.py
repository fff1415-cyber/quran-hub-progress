"""Build/test a compatible frontend retaining validity guards and every native record format."""
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

BASE = '26c16bfe3cea9df88e52ff76c1b2dc827ade2b0e'
root = pathlib.Path.cwd()
source = (root / 'src/lib/scientific-grades.ts').read_text()
original = '  return value === "half" || value === "one" || value === "two";'
independent = '''  switch (value) {
    case "half":
    case "one":
    case "two":
      return true;
    default:
      return false;
  }'''
assert source.count(original) == 1
fallback = source.replace(original, independent)
with tempfile.TemporaryDirectory() as temporary:
    target = pathlib.Path(temporary, 'compatible')
    archive = subprocess.run(['git', 'archive', BASE], check=True, stdout=subprocess.PIPE).stdout
    with tarfile.open(fileobj=io.BytesIO(archive)) as package:
        package.extractall(target, filter='data')
    (target / 'src/lib/scientific-grades.ts').write_text(fallback)
    (target / 'node_modules').symlink_to((root / 'node_modules').resolve(), target_is_directory=True)
    for name in ['scientific-hifz-regression.cjs', 'scientific-atomic-regression.cjs', 'scientific-clear-marker-regression.cjs']:
        subprocess.run(['node', str(root / 'tests' / name), str(target / 'src/lib/scientific-grades.ts')], cwd=root, check=True)
    for name in ['continuity-client-regression.cjs', 'plan-response-client-regression.cjs']:
        if not (root / 'tests' / name).exists():
            raise SystemExit('Required rollback regression is absent: ' + name)
        subprocess.run(['node', str(root / 'tests' / name)], cwd=target, check=True)
    with tempfile.TemporaryFile(mode='w+') as log:
        result = subprocess.run(['npm', 'run', 'build:hostinger'], cwd=target, stdout=log, stderr=subprocess.STDOUT)
        if result.returncode:
            log.seek(0)
            print(log.read()[-4000:])
            raise SystemExit('Compatible scientific frontend build failed')
    feature = os.environ['AUDIT_FEATURE_SHA']
    assert len(feature) == 40 and all(c in '0123456789abcdef' for c in feature)
    manifest = {
        'base': BASE, 'feature': feature,
        'variant': 'scientific-hifz-compatible-independent-predicate',
        'database_restore': False, 'api_replacement': False,
        'scientific_source_sha256': hashlib.sha256(fallback.encode()).hexdigest(),
    }
    (target / 'dist/client/deploy-sha.txt').write_text(feature + '\n')
    (target / 'dist/client/compatibility-release.json').write_text(json.dumps(manifest, indent=2))
    output = root / 'dist/scientific-hifz-compatible-rollback'
    output.mkdir(parents=True, exist_ok=True)
    shutil.make_archive(str(output / 'frontend'), 'zip', target / 'dist/client')
    with zipfile.ZipFile(output / 'frontend.zip') as package:
        assert package.testzip() is None and 'index.html' in package.namelist()
        assert not any(name.startswith('api/') for name in package.namelist())
        assert json.loads(package.read('compatibility-release.json')) == manifest
    manifest['package_sha256'] = hashlib.sha256((output / 'frontend.zip').read_bytes()).hexdigest()
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2))
print('PASS: compatible frontend built and archive verified; independent hifz predicate preserves current scores/manual edits, pending work and native formats without any database restore or API replacement')
