"""Build a data-compatible independent initializer; never restore student data or a database."""
import hashlib
import json
import os
import pathlib
import subprocess
import zipfile

BASE='ca3d341abc3d63e4c4110cef3c65bb51cf4c3c0e'
OLD=json.loads("\"    $pdo->beginTransaction();\\n    try {\\n        // The original unique key serializes first initialization as well as existing-row writes.\\n        $insert = $tenants ? 'INSERT IGNORE INTO app_state (complex_id, `key`, value) VALUES (?, ?, ?)' : 'INSERT IGNORE INTO app_state (`key`, value) VALUES (?, ?)';\\n        $params = $tenants ? [$cid, $key] : [$key];\\n        $pdo->prepare($insert)->execute(array_merge($params, ['{}']));\\n        $stmt = $pdo->prepare('SELECT value FROM app_state WHERE ' . ($tenants ? 'complex_id = ? AND ' : '') . '`key` = ? FOR UPDATE');\\n        $stmt->execute($params);\\n        $raw = $stmt->fetchColumn();\\n\"")
CURRENT=json.loads("\"    $params = $tenants ? [$cid, $key] : [$key];\\n    $hasStore = false;\\n    if (!$pdo->inTransaction()) {\\n        $probe = $pdo->prepare('SELECT 1 FROM app_state WHERE ' . ($tenants ? 'complex_id = ? AND ' : '') . '`key` = ?');\\n        $probe->execute($params);\\n        $hasStore = $probe->fetchColumn() !== false;\\n    }\\n    $pdo->beginTransaction();\\n    try {\\n        // Existing stores go straight to the current row lock, without duplicate insertion.\\n        if (!$hasStore) {\\n            $insert = $tenants ? 'INSERT INTO app_state (complex_id, `key`, value) VALUES (?, ?, ?)' : 'INSERT INTO app_state (`key`, value) VALUES (?, ?)';\\n            try {\\n                $pdo->prepare($insert)->execute(array_merge($params, ['{}']));\\n            } catch (PDOException $collision) {\\n                if ((int) ($collision->errorInfo[1] ?? 0) !== 1062) throw $collision;\\n                // Nothing has been saved: release the duplicate-insert lock before reading the winner.\\n                if ($pdo->inTransaction()) $pdo->rollBack();\\n                $pdo->beginTransaction();\\n            }\\n        }\\n        $stmt = $pdo->prepare('SELECT value FROM app_state WHERE ' . ($tenants ? 'complex_id = ? AND ' : '') . '`key` = ? FOR UPDATE');\\n        $stmt->execute($params);\\n        $raw = $stmt->fetchColumn();\\n\"")
ALTERNATIVE=json.loads("\"    $params = $tenants ? [$cid, $key] : [$key];\\n    $alreadyExists = false;\\n    if (!$pdo->inTransaction()) {\\n        $lookup = $pdo->prepare('SELECT 1 FROM app_state WHERE ' . ($tenants ? 'complex_id = ? AND ' : '') . '`key` = ?');\\n        $lookup->execute($params);\\n        $alreadyExists = $lookup->fetchColumn() !== false;\\n    }\\n    $pdo->beginTransaction();\\n    try {\\n        if (!$alreadyExists) {\\n            $create = $pdo->prepare($tenants ? 'INSERT INTO app_state (complex_id, `key`, value) VALUES (?, ?, ?)' : 'INSERT INTO app_state (`key`, value) VALUES (?, ?)');\\n            try { $create->execute(array_merge($params, ['{}'])); }\\n            catch (PDOException $collision) {\\n                if ((int) ($collision->errorInfo[1] ?? 0) !== 1062) throw $collision;\\n                if ($pdo->inTransaction()) $pdo->rollBack();\\n                $pdo->beginTransaction();\\n            }\\n        }\\n        $readCurrent = static function () use ($pdo, $tenants, $params): mixed {\\n            $query = $pdo->prepare('SELECT value FROM app_state WHERE ' . ($tenants ? 'complex_id = ? AND ' : '') . '`key` = ? FOR UPDATE');\\n            $query->execute($params);\\n            return $query->fetchColumn();\\n        };\\n        $raw = $readCurrent();\\n\"")
root=pathlib.Path.cwd()
source=(root/'api/routes/app_state.php').read_text()
assert source.count(CURRENT)==1
assert source.replace(CURRENT,OLD)==subprocess.run(['git','show',BASE+':api/routes/app_state.php'],check=True,stdout=subprocess.PIPE,text=True).stdout
fallback=source.replace(CURRENT,ALTERNATIVE)
output=root/'dist/existing-grade-lock-compatible-rollback'
output.mkdir(parents=True,exist_ok=True)
target=output/'app_state.php';target.write_text(fallback)
subprocess.run(['php','-l',str(target)],check=True)
environment=dict(os.environ,AUDIT_APP_STATE_SOURCE=str(target))
subprocess.run(['php','tests/backend-existing-grade-lock.php'],env=environment,check=True,stdout=subprocess.DEVNULL)
subprocess.run(['php','tests/backend-continuity.php'],env=environment,check=True,stdout=subprocess.DEVNULL)
with zipfile.ZipFile(output/'api-only.zip','w') as package:package.writestr('api/routes/app_state.php',fallback)
with zipfile.ZipFile(output/'api-only.zip') as package:
    assert package.testzip() is None and package.namelist()==['api/routes/app_state.php']
    assert package.read('api/routes/app_state.php').decode()==fallback
feature=os.environ.get('AUDIT_FEATURE_SHA','')
assert len(feature)==40 and all(c in '0123456789abcdef' for c in feature)
manifest={'base':BASE,'feature':feature,'variant':'existing-grade-lock-independent-initializer','database_restore':False,'frontend_replacement':False,'api_sha256':hashlib.sha256(fallback.encode()).hexdigest(),'package_sha256':hashlib.sha256((output/'api-only.zip').read_bytes()).hexdigest()}
(output/'manifest.json').write_text(json.dumps(manifest,indent=2))
print('PASS: independent lock-first API retains original reset/role/format rules; exact one-file rollback archive verified without any data restore')
