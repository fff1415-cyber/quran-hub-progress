"""Build a private rollback package retaining rule readers/writers and full local history."""
import pathlib
import shutil
import subprocess
import tarfile
import tempfile

BASE='bfe3ef13d0451aa55584c28515d4249486298ff3'
KEEP=['src/lib/mock-data.ts','src/lib/evaluation-types.ts','src/lib/evaluation-rules-snapshot.ts','src/lib/sard-phased-flow.ts']


def compatible_route(source):
    assert source.count('  const { settings } = useEvaluationSettings();')==2
    source=source.replace('import { useEvaluationSettings } from "@/contexts/EvaluationSettingsContext";', 'import { useEvaluationSettings } from "@/contexts/EvaluationSettingsContext";\nimport { snapshotEvaluationRules, validEvaluationRules } from "@/lib/evaluation-rules-snapshot";')
    source=source.replace('  const { settings } = useEvaluationSettings();','  const { settings, verified } = useEvaluationSettings();',1)
    source=source.replace('  const { settings } = useEvaluationSettings();','  const current = useEvaluationSettings();\n  const hasRules = item.evaluationRules !== undefined;\n  const recorded = validEvaluationRules(item.evaluationRules);\n  const settings = recorded ? item.evaluationRules!.settings : current.settings;\n  const ready = hasRules ? recorded : current.verified;',1)
    source=source.replace('segmentCount, settings.retry_delay_days));','segmentCount, settings.retry_delay_days, snapshotEvaluationRules(settings)));',1)
    guard='    if (submitting.current || loadSardQueue().find(q => q.id === item.id)?.status === "passed") return;'
    assert source.count(guard)==2
    start=source.index('function SardEvaluatorReviewOnly(')
    source=source[:start].replace(guard,guard+'\n    if (!verified) return;',1)+source[start:].replace(guard,guard+'\n    if (!ready) return;',1)
    button='<button type="button" onClick={() => void submit()}'
    assert source.count(button)==2
    source=source.replace(button,button+' disabled={!verified}',1)
    start=source.index('function SardEvaluatorReviewOnly(')
    source=source[:start]+source[start:].replace(button,button+' disabled={!ready}',1)
    return source


def prepare(repository,destination):
    root=pathlib.Path(repository).resolve();target=pathlib.Path(destination).resolve()
    if target==root or root.is_relative_to(target):raise ValueError('Rollback must be prepared in an isolated directory')
    archive=subprocess.run(['git','-C',str(root),'archive',BASE],check=True,stdout=subprocess.PIPE).stdout
    with tempfile.TemporaryFile() as raw:
        raw.write(archive);raw.seek(0)
        with tarfile.open(fileobj=raw) as bundle:bundle.extractall(target,filter='data')
    for path in KEEP:
        (target/path).write_text((root/path).read_text())
    route=target/'src/routes/musammi.tsx';route.write_text(compatible_route(route.read_text()))
    (target/'node_modules').symlink_to((root/'node_modules').resolve(),target_is_directory=True)
    return target


if __name__=='__main__':
    root=pathlib.Path.cwd()
    with tempfile.TemporaryDirectory() as temporary:
        target=prepare(root,pathlib.Path(temporary,'rollback'))
        # Prove that the fallback can read records written by the new release.
        subprocess.run(['node',str(root/'tests/evaluation-reference-regression.cjs'),str(target/'src/routes/musammi.tsx')],cwd=root,check=True)
        with tempfile.TemporaryFile(mode='w+') as log:
            result=subprocess.run(['npm','run','build:hostinger'],cwd=target,stdout=log,stderr=subprocess.STDOUT)
            if result.returncode:
                log.seek(0);print(log.read()[-4000:]);raise SystemExit('Compatible rollback build failed')
        output=root/'dist/record-confirmation-compatible-rollback';output.mkdir(parents=True,exist_ok=True)
        shutil.make_archive(str(output/'frontend'),'zip',target/'dist/client')
        print('Built compatible frontend rollback; recorded evaluation rules and untruncated local histories retained. No production calls.')
