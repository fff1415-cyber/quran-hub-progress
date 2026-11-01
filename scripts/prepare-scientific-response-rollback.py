"""Build a frontend alternative that retains the in-progress scientific draft guard."""
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
BASE='1bb0b54c4084877ab58d246fac57ed539f6fb607'
OLD=json.loads("\"export async function pushMergedScientificGrades(\\n  local: import(\\\"./scientific-grades\\\").ScientificGradesStore,\\n): Promise<import(\\\"./scientific-grades\\\").ScientificGradesStore> {\\n  const run = async (): Promise<import(\\\"./scientific-grades\\\").ScientificGradesStore> => {\\n    const { mergeScientificGradesStores, saveScientificGradesStore } = await import(\\\"./scientific-grades\\\");\\n    let cloud: import(\\\"./scientific-grades\\\").ScientificGradesStore = { configs: {}, data: {}, overrides: {} };\\n    try {\\n      cloud = await fetchCloudScientificGrades();\\n    } catch {\\n      cloud = { configs: {}, data: {}, overrides: {} };\\n    }\\n    const merged = mergeScientificGradesStores(cloud, local);\\n    await secureSetAppState({ data: { token: tokenOrThrow(), key: \\\"scientific_grades\\\", value: merged } });\\n    const prev = sessionStorage.getItem(\\\"qs_syncing\\\");\\n    sessionStorage.setItem(\\\"qs_syncing\\\", \\\"1\\\");\\n    try {\\n      saveScientificGradesStore(merged);\\n    } finally {\\n      if (prev) sessionStorage.setItem(\\\"qs_syncing\\\", prev);\\n      else sessionStorage.removeItem(\\\"qs_syncing\\\");\\n    }\\n    return merged;\\n  };\\n  const next = scientificPushQueue.then(run, run);\\n  scientificPushQueue = next.then(\\n    (v) => v,\\n    () => local,\\n  );\\n  return next;\\n}\\n\"")
CURRENT=json.loads("\"export async function pushMergedScientificGrades(\\n  local: import(\\\"./scientific-grades\\\").ScientificGradesStore,\\n): Promise<import(\\\"./scientific-grades\\\").ScientificGradesStore> {\\n  const submitted = JSON.stringify(local);\\n  const run = async (): Promise<import(\\\"./scientific-grades\\\").ScientificGradesStore> => {\\n    const { mergeScientificGradesStores, saveScientificGradesStore, loadScientificGradesStore } = await import(\\\"./scientific-grades\\\");\\n    let cloud: import(\\\"./scientific-grades\\\").ScientificGradesStore = { configs: {}, data: {}, overrides: {} };\\n    try {\\n      cloud = await fetchCloudScientificGrades();\\n    } catch {\\n      cloud = { configs: {}, data: {}, overrides: {} };\\n    }\\n    const merged = mergeScientificGradesStores(cloud, JSON.parse(submitted) as typeof local);\\n    await secureSetAppState({ data: { token: tokenOrThrow(), key: \\\"scientific_grades\\\", value: merged } });\\n    // A later local edit is still in progress; this ACK belongs only to the submitted snapshot.\\n    if (JSON.stringify(loadScientificGradesStore()) !== submitted) return merged;\\n    const prev = sessionStorage.getItem(\\\"qs_syncing\\\");\\n    sessionStorage.setItem(\\\"qs_syncing\\\", \\\"1\\\");\\n    try {\\n      saveScientificGradesStore(merged);\\n    } finally {\\n      if (prev) sessionStorage.setItem(\\\"qs_syncing\\\", prev);\\n      else sessionStorage.removeItem(\\\"qs_syncing\\\");\\n    }\\n    return merged;\\n  };\\n  const next = scientificPushQueue.then(run, run);\\n  scientificPushQueue = next.then(\\n    (v) => v,\\n    () => local,\\n  );\\n  return next;\\n}\\n\"")
ALTERNATIVE=json.loads("\"export async function pushMergedScientificGrades(\\n  local: import(\\\"./scientific-grades\\\").ScientificGradesStore,\\n): Promise<import(\\\"./scientific-grades\\\").ScientificGradesStore> {\\n  const submitted = JSON.stringify(local);\\n  const run = async (): Promise<import(\\\"./scientific-grades\\\").ScientificGradesStore> => {\\n    const { mergeScientificGradesStores, saveScientificGradesStore, loadScientificGradesStore } = await import(\\\"./scientific-grades\\\");\\n    let cloud: import(\\\"./scientific-grades\\\").ScientificGradesStore = { configs: {}, data: {}, overrides: {} };\\n    try {\\n      cloud = await fetchCloudScientificGrades();\\n    } catch {\\n      cloud = { configs: {}, data: {}, overrides: {} };\\n    }\\n    const merged = mergeScientificGradesStores(cloud, JSON.parse(submitted) as typeof local);\\n    await secureSetAppState({ data: { token: tokenOrThrow(), key: \\\"scientific_grades\\\", value: merged } });\\n    // A later local edit is still in progress; this ACK belongs only to the submitted snapshot.\\n    const localStillMatches = JSON.stringify(loadScientificGradesStore()) === submitted;\\n    if (!localStillMatches) return merged;\\n    const prev = sessionStorage.getItem(\\\"qs_syncing\\\");\\n    sessionStorage.setItem(\\\"qs_syncing\\\", \\\"1\\\");\\n    try {\\n      saveScientificGradesStore(merged);\\n    } finally {\\n      if (prev) sessionStorage.setItem(\\\"qs_syncing\\\", prev);\\n      else sessionStorage.removeItem(\\\"qs_syncing\\\");\\n    }\\n    return merged;\\n  };\\n  const next = scientificPushQueue.then(run, run);\\n  scientificPushQueue = next.then(\\n    (v) => v,\\n    () => local,\\n  );\\n  return next;\\n}\\n\"")
root=pathlib.Path.cwd()
source=(root/'src/lib/cloud-sync.ts').read_text()
assert source.count(CURRENT)==1
assert source.replace(CURRENT,OLD)==subprocess.run(['git','show',BASE+':src/lib/cloud-sync.ts'],check=True,stdout=subprocess.PIPE,text=True).stdout
with tempfile.TemporaryDirectory() as temporary:
    target=pathlib.Path(temporary,'rollback')
    archive=subprocess.run(['git','archive',BASE],check=True,stdout=subprocess.PIPE).stdout
    with tarfile.open(fileobj=io.BytesIO(archive)) as bundle:bundle.extractall(target,filter='data')
    (target/'node_modules').symlink_to((root/'node_modules').resolve(),target_is_directory=True)
    client=target/'src/lib/cloud-sync.ts';client.write_text(source.replace(CURRENT,ALTERNATIVE))
    subprocess.run(['node',str(root/'tests/scientific-response-regression.cjs'),str(client)],cwd=root,check=True)
    subprocess.run(['node',str(root/'tests/scientific-clear-marker-regression.cjs'),str(target/'src/lib/scientific-grades.ts')],cwd=root,check=True)
    subprocess.run(['node',str(root/'tests/scientific-hifz-regression.cjs'),str(target/'src/lib/scientific-grades.ts')],cwd=root,check=True)
    subprocess.run(['node',str(root/'tests/continuity-client-regression.cjs')],cwd=target,check=True)
    with tempfile.TemporaryFile(mode='w+') as log:
        result=subprocess.run(['npm','run','build:hostinger'],cwd=target,stdout=log,stderr=subprocess.STDOUT)
        if result.returncode:log.seek(0);print(log.read()[-4000:]);raise SystemExit('Scientific response compatible build failed')
    feature=os.environ['AUDIT_FEATURE_SHA'];assert len(feature)==40 and all(c in '0123456789abcdef' for c in feature)
    manifest={'base':BASE,'feature':feature,'variant':'retained-scientific-draft-confirmation-guard','retains_scientific_clear_marker':True,'retains_invalid_hifz_guard':True,'database_restore':False,'api_replacement':False}
    (target/'dist/client/deploy-sha.txt').write_text(feature+'\n');(target/'dist/client/compatibility-release.json').write_text(json.dumps(manifest,indent=2))
    output=root/'dist/scientific-response-compatible-rollback';output.mkdir(parents=True,exist_ok=True)
    shutil.make_archive(str(output/'frontend'),'zip',target/'dist/client')
    with zipfile.ZipFile(output/'frontend.zip') as package:
        assert package.testzip() is None and 'index.html' in package.namelist()
        assert not any(path.startswith('api/') for path in package.namelist())
        assert json.loads(package.read('compatibility-release.json'))==manifest
    manifest['package_sha256']=hashlib.sha256((output/'frontend.zip').read_bytes()).hexdigest();(output/'manifest.json').write_text(json.dumps(manifest,indent=2))
    print('PASS: scientific draft/zero/clear/manual guards retained in tested frontend alternative; package hash and extraction checked, no API/database restore')
