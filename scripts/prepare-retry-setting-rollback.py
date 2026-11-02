"""A bounded equivalent API fallback; no schema or historical-data rollback."""
import hashlib,json,os,pathlib,subprocess,zipfile
source=pathlib.Path('api/routes/evaluation_settings.php').read_text()
old="$columns = array_values(array_diff($columns, ['retry_delay_days']));"
new="$columns = array_values(array_filter($columns, static fn ($column) => $column !== 'retry_delay_days'));"
assert source.count(old)==1
output=pathlib.Path('dist/retry-setting-compatible-api');output.mkdir(parents=True,exist_ok=True)
target=output/'evaluation_settings.php';target.write_text(source.replace(old,new))
subprocess.run(['php','-l',str(target)],check=True)
subprocess.run(['php','tests/backend-retry-setting-compat.php'],env=dict(os.environ,AUDIT_EVAL_SOURCE=str(target.resolve())),check=True,stdout=subprocess.DEVNULL)
with zipfile.ZipFile(output/'api-only.zip','w') as z:z.write(target,'api/routes/evaluation_settings.php')
with zipfile.ZipFile(output/'api-only.zip') as z:assert z.testzip() is None and z.namelist()==['api/routes/evaluation_settings.php'] and z.read(z.namelist()[0])==target.read_bytes()
(output/'manifest.json').write_text(json.dumps({'database_restore':False,'retains_missing_column_compatibility':True,'api_sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'package_sha256':hashlib.sha256((output/'api-only.zip').read_bytes()).hexdigest()},indent=2))
print('PASS: one-file compatible fallback tested; preserves current/new writes and missing-column support without DB restore')
