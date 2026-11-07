"""Real teacher/assistant/musammi HTTP reads and writes against disposable native fixtures only."""
import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

EXPECTED = 'mysql:host=127.0.0.1;port=3307;dbname=audit_test;charset=utf8mb4'
if os.environ.get('AUDIT_MYSQL_DSN') != EXPECTED:
    raise SystemExit('Only the isolated native fixture database is allowed')

fixture = r'''
$pdo=new PDO(getenv('AUDIT_MYSQL_DSN'),'audit','audit_only',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$pdo->exec("ALTER TABLE app_state MODIFY value LONGTEXT NOT NULL;
UPDATE halaqat SET teacher_code='fixture-teacher-code',assistant_code='fixture-assistant-code' WHERE complex_id=1 AND id=1;
INSERT INTO role_accounts(id,complex_id,role,name,code,permissions) VALUES('fixture-musammi',1,'musammi','fixture','fixture-musammi-code','[]');
UPDATE education_plans SET segment_count=2 WHERE id='fixture-plan';
INSERT INTO plan_segments(id,plan_id,segment_index,hifz_plan,rabt_plan,muraja_plan) VALUES('fixture-seg1','fixture-plan',1,'h','r','m'),('fixture-seg2','fixture-plan',2,'h','r','m');
INSERT INTO student_plan_assignments(id,student_id,plan_id,status) VALUES('fixture-assignment','fixture','fixture-plan','active');");
'''
subprocess.run(['php', '-r', fixture], check=True)


def request(path, token=None, data=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request('http://127.0.0.1:8097/api/r.php?path=' + path,
                                 data=None if data is None else json.dumps(data).encode(), headers=headers)
    with urllib.request.urlopen(req, timeout=10) as response:
        return json.load(response)


with tempfile.TemporaryDirectory() as folder:
    root = pathlib.Path(folder)
    shutil.copytree('api', root / 'api')
    (root / 'api/config.php').write_text("<?php\ndefine('DB_HOST','127.0.0.1;port=3307');define('DB_NAME','audit_test');define('DB_USER','audit');define('DB_PASS','audit_only');define('DB_CHARSET','utf8mb4');define('TOKEN_SECRET','isolated-fixture-token-secret-only');\n")
    with tempfile.TemporaryFile() as private_log:
        server = subprocess.Popen(['php', '-S', '127.0.0.1:8097', '-t', str(root)], stdout=private_log, stderr=private_log)
        try:
            for attempt in range(40):
                try:
                    request('/health')
                    break
                except (OSError, urllib.error.URLError):
                    if server.poll() is not None:
                        raise RuntimeError('Isolated HTTP server stopped')
                    time.sleep(0.1)
            else:
                raise RuntimeError('Isolated HTTP server did not become ready')
            tokens = {}
            for role in ['teacher', 'assistant', 'musammi']:
                login = request('/login/code', data={'code': 'fixture-' + role + '-code', 'complexId': 1})
                assert login['role'] == role
                tokens[role] = login['token']
            assert request('/students', tokens['teacher'])[0]['id'] == 'fixture'
            grades = {'fixture': {'1': {'days': {'sun': {'hifz': 'one', 'attendance': 'present'}}}}}
            assert request('/app-state', tokens['teacher'], {'key': 'grades', 'value': grades})['ok']
            rows = request('/app-state&key=grades', tokens['assistant'])
            assert rows[0]['value'] == grades
            grades['fixture']['1']['days']['sun']['muraja'] = 'pass'
            assert request('/app-state', tokens['assistant'], {'key': 'grades', 'value': grades})['ok']
            assert request('/app-state&key=grades', tokens['teacher'])[0]['value'] == grades
            result = request('/plans/apply-input', tokens['teacher'], {'student_id': 'fixture', 'expected_assignment_id': 'fixture-assignment', 'task_type': 'hifz', 'tap': 'one', 'completed_at': '2026-10-30'})
            assert result['ok'] and result['applied_segments']
            for role in ['assistant', 'musammi']:
                sheet = request('/plans/student-sheet&student_id=fixture', tokens[role])
                assert sheet['assignment']['id'] == 'fixture-assignment'
                assert sorted(c['segment_index'] for c in sheet['completions']) == sorted(result['applied_segments'])
                assert all(c['completed_at'] == '2026-10-30' for c in sheet['completions'])
            print('PASS: actual role login, teacher/assistant shared save/read and dated plan reads through real PHP HTTP against isolated database')
        finally:
            server.terminate()
            server.wait(timeout=10)
