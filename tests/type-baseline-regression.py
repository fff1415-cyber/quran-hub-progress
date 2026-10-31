"""Compare existing TypeScript diagnostics with the exact published base; never suppress new ones."""
import collections
import io
import pathlib
import re
import subprocess
import tarfile
import tempfile

BASE='a5b7744afb34928d8e83aa8eaeb300dd447270ba'
root=pathlib.Path.cwd()
compiler=root/'node_modules/typescript/bin/tsc'
def diagnostics(folder):
    result=subprocess.run(['node',str(compiler),'--noEmit','--pretty','false'],cwd=folder,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
    items=[]
    for line in result.stdout.splitlines():
        if 'error TS' in line:items.append(re.sub(r'\(\d+,\d+\)', '',line))
    if result.returncode not in [0,2] or result.returncode and not items:
        raise RuntimeError('TypeScript invocation failed independently of the diagnostic baseline: '+result.stdout[-3000:])
    return collections.Counter(items)
with tempfile.TemporaryDirectory() as temporary:
    baseline=pathlib.Path(temporary,'baseline')
    archive=subprocess.run(['git','archive',BASE],check=True,stdout=subprocess.PIPE).stdout
    with tarfile.open(fileobj=io.BytesIO(archive)) as source:source.extractall(baseline,filter='data')
    (baseline/'node_modules').symlink_to((root/'node_modules').resolve(),target_is_directory=True)
    old=diagnostics(baseline);new=diagnostics(root);introduced=new-old
    if introduced:
        for message,count in introduced.items():print(str(count)+' new: '+message)
        raise SystemExit('New TypeScript diagnostics; do not publish')
    print('PASS: TypeScript baseline '+str(sum(old.values()))+' existing, candidate '+str(sum(new.values()))+'; no new diagnostics. Whole-project TypeScript is not claimed clean.')
