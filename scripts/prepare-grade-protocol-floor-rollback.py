"""Build a tested API alternative that retains the protocol floor and current locking fix."""
import hashlib
import json
import os
import pathlib
import subprocess
import zipfile
BASE='c805c5dad15dc12552751580f9eeae9fbc614f66'
GUARD=json.loads("\"    if (array_key_exists('grade_write_protocol', $input)\\n        && in_array($key, ['grades', 'weekly_tests', 'scientific_grades'], true)) {\\n        error_response('نسخة الخادم لا تدعم طريقة حفظ الدرجات المطلوبة؛ لم تتغير السجلات. حدّث الصفحة قبل إعادة المحاولة.', 503);\\n    }\\n\\n\"")
ALTERNATIVE=json.loads("\"    switch ($key) {\\n        case 'grades':\\n        case 'weekly_tests':\\n        case 'scientific_grades':\\n            if (array_key_exists('grade_write_protocol', $input)) {\\n                error_response('نسخة الخادم لا تدعم طريقة حفظ الدرجات المطلوبة؛ لم تتغير السجلات. حدّث الصفحة قبل إعادة المحاولة.', 503);\\n            }\\n            break;\\n    }\\n\\n\"")
root=pathlib.Path.cwd()
source=(root/'api/routes/app_state.php').read_text()
assert source.count(GUARD)==1
assert source.replace(GUARD,'')==subprocess.run(['git','show',BASE+':api/routes/app_state.php'],check=True,stdout=subprocess.PIPE,text=True).stdout
fallback=source.replace(GUARD,ALTERNATIVE)
output=root/'dist/grade-protocol-floor-compatible-rollback'
output.mkdir(parents=True,exist_ok=True)
target=output/'app_state.php';target.write_text(fallback)
subprocess.run(['php','-l',str(target)],check=True)
environment=dict(os.environ,AUDIT_APP_STATE_SOURCE=str(target))
subprocess.run(['php','tests/backend-grade-protocol-floor.php'],env=environment,check=True,stdout=subprocess.DEVNULL)
subprocess.run(['php','tests/backend-existing-grade-lock.php'],env=environment,check=True,stdout=subprocess.DEVNULL)
with zipfile.ZipFile(output/'api-only.zip','w') as package:package.writestr('api/routes/app_state.php',fallback)
with zipfile.ZipFile(output/'api-only.zip') as package:
    assert package.testzip() is None and package.namelist()==['api/routes/app_state.php']
    assert package.read('api/routes/app_state.php').decode()==fallback
feature=os.environ.get('AUDIT_FEATURE_SHA','')
assert len(feature)==40 and all(c in '0123456789abcdef' for c in feature)
manifest={'base':BASE,'feature':feature,'variant':'retained-grade-protocol-floor','retains_grade_write_protocol_floor':True,'retains_existing_grade_lock_fix':True,'database_restore':False,'frontend_replacement':False,'api_sha256':hashlib.sha256(fallback.encode()).hexdigest(),'package_sha256':hashlib.sha256((output/'api-only.zip').read_bytes()).hexdigest()}
(output/'manifest.json').write_text(json.dumps(manifest,indent=2))
print('PASS: API alternative retains unsupported protocol rejection and existing-store locking, exact archive verified without data restoration')
