"""Build an independent compatible manual writer, retaining explicit blanks and all newer work."""
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

BASE='6646de92a1c3a355137d5e0f1ecd838e35174379'
WRITER='''export function setTeacherScientificDayScore(
  halaqaId: number,
  studentId: string,
  weekNum: number,
  dayKey: string,
  field: ScientificGradeField,
  value: string,
): void {
  const store = loadScientificGradesStore();
  const data = halaqaDataRoot(store, halaqaId);
  const weeks = data[studentId] ?? (data[studentId] = {});
  const days = weeks[weekNum] ?? (weeks[weekNum] = {});
  const day = days[dayKey] ?? (days[dayKey] = {});
  const normalized = value.trim();
  const guarded = isScientificScoreOverriddenInStore(store, halaqaId, studentId, weekNum, dayKey, field);
  if (Object.prototype.hasOwnProperty.call(day, field) && day[field] === normalized && guarded) return;
  day[field] = normalized;
  setScientificScoreOverrideInStore(store, halaqaId, studentId, weekNum, dayKey, field);
  saveScientificGradesStore(store);
}'''

if __name__=='__main__':
    root=pathlib.Path.cwd()
    with tempfile.TemporaryDirectory() as temporary:
        target=pathlib.Path(temporary,'rollback')
        archive=subprocess.run(['git','archive',BASE],check=True,stdout=subprocess.PIPE).stdout
        with tarfile.open(fileobj=io.BytesIO(archive)) as bundle:bundle.extractall(target,filter='data')
        path=target/'src/lib/scientific-grades.ts';source=path.read_text();start=source.index('export function setTeacherScientificDayScore(');end=source.index('\n}',start)+2;path.write_text(source[:start]+WRITER+source[end:])
        (target/'node_modules').symlink_to((root/'node_modules').resolve(),target_is_directory=True)
        for test in ['scientific-clear-marker-regression.cjs','scientific-atomic-regression.cjs']:
            subprocess.run(['node',str(root/'tests'/test),str(path)],cwd=root,check=True)
        subprocess.run(['node',str(root/'tests/evaluation-reference-regression.cjs'),str(target/'src/routes/musammi.tsx')],cwd=root,check=True)
        with tempfile.TemporaryFile(mode='w+') as log:
            result=subprocess.run(['npm','run','build:hostinger'],cwd=target,stdout=log,stderr=subprocess.STDOUT)
            if result.returncode:
                log.seek(0);print(log.read()[-4000:]);raise SystemExit('Scientific compatible fallback build failed')
        feature=os.environ['AUDIT_FEATURE_SHA'];assert len(feature)==40 and all(c in '0123456789abcdef' for c in feature)
        marker={'source_sha':feature,'api_base_sha':BASE,'variant':'explicit-scientific-clear-compatible-writer','writer_sha256':hashlib.sha256(WRITER.encode()).hexdigest(),'database_restore':False}
        (target/'dist/client/deploy-sha.txt').write_text(feature+'\n')
        (target/'dist/client/compatibility-release.json').write_text(json.dumps(marker,indent=2))
        output=root/'dist/scientific-clear-compatible-rollback';output.mkdir(parents=True,exist_ok=True)
        shutil.make_archive(str(output/'frontend'),'zip',target/'dist/client')
        with zipfile.ZipFile(output/'frontend.zip') as package:
            assert package.testzip() is None and 'index.html' in package.namelist()
            assert not any(file.startswith('api/') for file in package.namelist())
            assert json.loads(package.read('compatibility-release.json'))==marker
        marker['package_sha256']=hashlib.sha256((output/'frontend.zip').read_bytes()).hexdigest();(output/'manifest.json').write_text(json.dumps(marker,indent=2))
        print('PASS: independent scientific fallback writer preserves new explicit clears, zero, atomic guards and earlier no-reset/rule readers; build and package identity verified without data restore.')
