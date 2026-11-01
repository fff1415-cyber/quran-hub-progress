<?php
// Runs the real PHP handlers against isolated SQLite data. MySQL row locks are
// stripped by the adapter, so this verifies rollback and stale-write behavior,
// not the deployment server's MySQL locking semantics.
declare(strict_types=1);
class ApiFailure extends RuntimeException {}
class TestDatabase extends PDO {
    public function __construct() {
        parent::__construct('sqlite::memory:');
        $this->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $this->sqliteCreateFunction('NOW', fn() => '2026-10-13 14:00:00');
    }
    public function prepare(string $query, array $options = []): PDOStatement|false {
        if (str_contains($query, 'information_schema.tables')) $query = "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?";
        $query = str_replace(' FOR UPDATE', '', $query);
        $query = str_replace('INSERT IGNORE', 'INSERT OR IGNORE', $query);
        $query = str_replace('ON DUPLICATE KEY UPDATE value = ?', 'ON CONFLICT DO UPDATE SET value = ?', $query);
        $query = str_replace('ON DUPLICATE KEY UPDATE direct_version=?,subtree_version=?,updated_at=CURRENT_TIMESTAMP', 'ON CONFLICT(context_id,store_key,path_sha256) DO UPDATE SET direct_version=?,subtree_version=?,updated_at=CURRENT_TIMESTAMP', $query);
        return parent::prepare($query, $options);
    }
}
function table_column_exists(PDO $pdo, string $table, string $column): bool {
    if ($table === 'segment_completions' && $column === 'assignment_id') {
        foreach ($pdo->query('PRAGMA table_info(segment_completions)')->fetchAll() as $field) if ($field['name'] === $column) return true;
        return false;
    }
    return true;
}
function require_auth(): array {return $GLOBALS['auth'];}
function require_complex_id(array $auth): int {return (int)$auth['complexId'];}
function json_input(): array {return $GLOBALS['input'];}
function db(): PDO {return $GLOBALS['pdo'];}
function error_response(string $message, int $status = 400): never {throw new ApiFailure($message, $status);}
function json_response(mixed $value): void {$GLOBALS['response'] = $value;}
function new_uuid(): string {return 'assignment-' . (++$GLOBALS['uuid']);}
function assert_row_belongs_to_complex(?int $row, int $cid): void {if ($row !== $cid) error_response('Forbidden tenant', 403);}
// Alternate source is used only by the isolated compatible-rollback fixture.
require getenv('AUDIT_APP_STATE_SOURCE') ?: __DIR__ . '/../api/routes/app_state.php';
require getenv('AUDIT_PLAN_SOURCE') ?: __DIR__ . '/../api/routes/plans.php';
require __DIR__ . '/../api/routes/staff_tasks.php';
function check(bool $ok, string $name): void {if (!$ok) throw new RuntimeException('FAIL: ' . $name); echo "PASS: $name\n";}
function expectFailure(callable $fn, string $contains): void {
    try {$fn();} catch (ApiFailure $e) {check(str_contains($e->getMessage(), $contains), $contains); return;}
    throw new RuntimeException('Expected rejection: ' . $contains);
}
function seed(): TestDatabase {
    $fixtureClass = $GLOBALS['completionDatabaseClass'] ?? TestDatabase::class;
    $pdo = new $fixtureClass();$GLOBALS['pdo'] = $pdo;$GLOBALS['uuid']=0;
    $GLOBALS['auth']=['role'=>'musammi','accountId'=>'staff-1','complexId'=>1,'name'=>'test'];
    $GLOBALS['input']=['student_id'=>'student-1','plan_id'=>'next','expected_assignment_id'=>'old','plan_start_date'=>'2026-10-13','sard_result'=>['id'=>'sq-1','percent'=>90,'phase'=>'full']];
    $pdo->exec('CREATE TABLE students(id TEXT PRIMARY KEY, complex_id INTEGER, phase_number INTEGER, level TEXT); INSERT INTO students(id,complex_id,phase_number,level) VALUES ("student-1",1,1,"1")');
    $faces='daily_hifz_faces INTEGER DEFAULT 1, daily_rabt_faces INTEGER DEFAULT 1, daily_muraja_faces INTEGER DEFAULT 1, faces_per_half INTEGER DEFAULT 1, faces_per_one INTEGER DEFAULT 1, faces_per_two INTEGER DEFAULT 2';
    $pdo->exec('CREATE TABLE education_plans(id TEXT PRIMARY KEY, complex_id INTEGER, title TEXT, track TEXT, level_number INTEGER, '.$faces.'); INSERT INTO education_plans(id,complex_id,title,track,level_number) VALUES ("current",1,"current plan","gold",1001),("next",1,"next plan","gold",1002)');
    $pdo->exec('CREATE TABLE student_plan_assignments(id TEXT PRIMARY KEY, student_id TEXT, plan_id TEXT, start_segment_index INTEGER, plan_start_date TEXT, start_muraja_segment INTEGER, status TEXT, assigned_by TEXT, assigned_at TEXT DEFAULT "2026-10-01 00:00:00", transferred_at TEXT, frozen_at TEXT, '.$faces.'); INSERT INTO student_plan_assignments(id,student_id,plan_id,start_segment_index,status) VALUES ("old","student-1","current",1,"active")');
    $pdo->exec('CREATE TABLE plan_segments(plan_id TEXT, segment_index INTEGER); INSERT INTO plan_segments VALUES("current",1),("current",2),("next",1),("next",2); CREATE TABLE segment_completions(student_id TEXT,plan_id TEXT,segment_index INTEGER,task_type TEXT, assignment_id TEXT, created_at TEXT DEFAULT "2026-10-02 00:00:00"); INSERT INTO segment_completions(student_id,plan_id,segment_index,task_type,assignment_id) VALUES("student-1","current",1,"hifz","old"),("student-1","current",2,"hifz","old")');
    $pdo->exec('CREATE TABLE app_state(complex_id INTEGER, `key` TEXT, value TEXT, UNIQUE(complex_id, `key`))');
    app_state_upsert($pdo,'sard_queue',[['id'=>'sq-1','studentId'=>'student-1','assignmentId'=>'old','status'=>'scheduled','attempt'=>2]],1);
    return $pdo;
}
function activePlan(PDO $pdo): string {return (string)$pdo->query("SELECT plan_id FROM student_plan_assignments WHERE status='active'")->fetchColumn();}
function queue(PDO $pdo): array {return json_decode((string)$pdo->query("SELECT value FROM app_state WHERE `key`='sard_queue'")->fetchColumn(),true);}
$pdo=seed();handle_assign_plan();check(activePlan($pdo)==='next' && queue($pdo)[0]['status']==='passed','failed attempt then pass commits next plan and result together with hifz alone');
expectFailure(fn()=>handle_assign_plan(),'تغيّرت خطة الطالب');check((int)$pdo->query('SELECT COUNT(*) FROM student_plan_assignments')->fetchColumn()===2,'repeat approval does not create another assignment');
$pdo=seed();$pdo->exec("CREATE TRIGGER fail_insert BEFORE INSERT ON student_plan_assignments BEGIN SELECT RAISE(ABORT,'simulated insert failure'); END");expectFailure(fn()=>handle_assign_plan(),'simulated insert failure');check(activePlan($pdo)==='current' && queue($pdo)[0]['status']==='scheduled','assignment insert failure rolls back plan closure');
$pdo=seed();$pdo->exec("CREATE TRIGGER fail_queue BEFORE INSERT ON app_state BEGIN SELECT RAISE(ABORT,'simulated queue failure'); END");expectFailure(fn()=>handle_assign_plan(),'simulated queue failure');check(activePlan($pdo)==='current' && queue($pdo)[0]['status']==='scheduled','queue failure rolls back new assignment and plan closure');
$pdo=seed();$pdo->exec('DELETE FROM segment_completions WHERE segment_index=2');expectFailure(fn()=>handle_assign_plan(),'لم يكتمل حفظ');check(activePlan($pdo)==='current','incomplete hifz cannot advance');
$pdo=seed();$pdo->exec('UPDATE education_plans SET level_number=1003 WHERE id="next"');expectFailure(fn()=>handle_assign_plan(),'لا يمكن تجاوز');
$pdo=seed();$pdo->exec('UPDATE education_plans SET complex_id=2 WHERE id="next"');expectFailure(fn()=>handle_assign_plan(),'Forbidden tenant');
$pdo=seed();$GLOBALS['auth']['role']='teacher';expectFailure(fn()=>handle_assign_plan(),'Forbidden');
$pdo=seed();$pdo->exec('UPDATE education_plans SET level_number=1 WHERE id="current"');handle_assign_plan();check(activePlan($pdo)==='next','legacy gold numbering can advance to encoded numbering');
$pdo=seed();$pdo->exec('UPDATE education_plans SET track="silver",level_number=2018,title="النجباء — المرحلة 18" WHERE id="current"; UPDATE education_plans SET track="silver",level_number=3027,title="الفرسان — المرحلة 27" WHERE id="next"; UPDATE students SET phase_number=26, level="26" WHERE id="student-1"');handle_assign_plan();check(activePlan($pdo)==='next' && queue($pdo)[0]['status']==='passed','existing phase 26 student advances from old wrong link to imported phase 27');
$pdo=seed();$pdo->exec('UPDATE education_plans SET track="silver",level_number=3026 WHERE id="current"; UPDATE education_plans SET track="silver",level_number=3027 WHERE id="next"; UPDATE students SET phase_number=26, level="26" WHERE id="student-1"');handle_assign_plan();check(activePlan($pdo)==='next','correctly linked silver phase 26 advances to phase 27');
$pdo=seed();$pdo->exec('UPDATE education_plans SET track="silver",level_number=2020 WHERE id="current"; UPDATE education_plans SET track="silver",level_number=3020 WHERE id="next"; UPDATE students SET phase_number=20, level="20" WHERE id="student-1"');handle_assign_plan();check(activePlan($pdo)==='next','split silver phase 20 advances to the second plan without skipping');
$pdo=seed();$pdo->exec('UPDATE education_plans SET track="silver",level_number=3033 WHERE id="current"; UPDATE education_plans SET track="silver",level_number=4033 WHERE id="next"; UPDATE students SET phase_number=33, level="33" WHERE id="student-1"');handle_assign_plan();check(activePlan($pdo)==='next','split silver phase 33 advances to the second plan');
$pdo=seed();$pdo->exec('UPDATE education_plans SET track="silver",level_number=4042 WHERE id="current"; UPDATE education_plans SET track="silver",level_number=5042 WHERE id="next"; UPDATE students SET phase_number=42, level="42" WHERE id="student-1"');handle_assign_plan();check(activePlan($pdo)==='next','split silver phase 42 advances to the second plan');
$pdo=seed();$pdo->exec('UPDATE education_plans SET track="silver",level_number=2018 WHERE id="current"; UPDATE education_plans SET track="silver",level_number=3027 WHERE id="next"; UPDATE students SET phase_number=25, level="25" WHERE id="student-1"');expectFailure(fn()=>handle_assign_plan(),'لا يمكن تجاوز');check(activePlan($pdo)==='current','profile mismatch cannot authorize a plan jump');
$pdo=seed();$GLOBALS['input']['sard_result']['id']='missing';expectFailure(fn()=>handle_assign_plan(),'طلب السرد غير محفوظ');check(activePlan($pdo)==='current','missing queue item rolls back advancement');
$pdo=seed();$initial=queue($pdo)[0];$deviceA=array_merge($initial,['status'=>'pending']);$pdo->exec('INSERT INTO students(id,complex_id,phase_number,level) VALUES ("student-2",1,1,"1"); INSERT INTO student_plan_assignments(id,student_id,plan_id,start_segment_index,status) VALUES ("other","student-2","current",1,"active"); INSERT INTO segment_completions(student_id,plan_id,segment_index,task_type,assignment_id) VALUES("student-2","current",1,"hifz","other"),("student-2","current",2,"hifz","other")');$deviceB=['id'=>'sq-2','studentId'=>'student-2','assignmentId'=>'other','status'=>'plan_completed'];
app_state_patch_sard($pdo,1,['changes'=>[['item'=>$deviceA,'base'=>$initial]]]);app_state_patch_sard($pdo,1,['changes'=>[['item'=>$deviceB,'base'=>null]]]);check(count(queue($pdo))===2 && queue($pdo)[0]['status']==='pending','different device updates preserve unrelated queue items');
expectFailure(fn()=>app_state_patch_sard($pdo,1,['changes'=>[['item'=>array_merge($initial,['status'=>'passed']),'base'=>$initial]]]),'تغيّر السرد');check(queue($pdo)[0]['status']==='pending','stale same-item write cannot undo newer status');
app_state_patch_sard($pdo,1,['changes'=>[['item'=>$deviceA,'base'=>$initial]]]);check(count(queue($pdo))===2,'identical write retry is idempotent');
expectFailure(fn()=>app_state_patch_sard($pdo,1,[]),'نسخة الصفحة قديمة');
$pdo=seed();check(tasks_actor($GLOBALS['auth'],$pdo,1)==='musammi:staff-1','valid staff token resolves task actor');unset($GLOBALS['auth']['accountId']);expectFailure(fn()=>tasks_actor($GLOBALS['auth'],$pdo,1),'جلسة الدخول ناقصة');
echo "Backend handler tests complete (SQLite adapter; no live MySQL writes).\n";

$assignments=['student-1'=>['id'=>'new','assigned_at'=>'2026-10-13 12:00:00','title'=>'new plan']];
$records=[['id'=>'old-1','studentId'=>'student-1','assignmentId'=>'old','status'=>'plan_completed'],['id'=>'pass','studentId'=>'student-1','assignmentId'=>'old','status'=>'passed'],['id'=>'legacy','studentId'=>'student-1','planTitle'=>'old plan','createdAt'=>'2026-10-10T10:00:00Z','status'=>'pending']];
$clean=sard_reconcile_queue($records,$assignments);check($clean[0]['status']==='archived' && $clean[1]['status']==='passed' && $clean[2]['status']==='archived','old and legacy requests disappear while pass history survives');
check(sard_reconcile_queue($clean,$assignments)===$clean,'repeated reconciliation cannot revive archived requests');
$records=[['id'=>'pending','studentId'=>'student-1','assignmentId'=>'new','status'=>'pending'],['id'=>'passed','studentId'=>'student-1','assignmentId'=>'new','status'=>'passed']];$clean=sard_reconcile_queue($records,$assignments);check($clean[0]['archiveReason']==='already_passed','another request cannot requeue a passed assignment');
$records=[['id'=>'a','studentId'=>'student-1','assignmentId'=>'new','status'=>'plan_completed'],['id'=>'b','studentId'=>'student-1','assignmentId'=>'new','status'=>'pending','supervisorForwardedAt'=>'2026-10-13T13:00:00Z']];$clean=sard_reconcile_queue($records,$assignments);check($clean[0]['status']==='archived' && $clean[1]['status']==='pending','forwarded request wins over duplicate completion request');
$records=[['id'=>'fresh','studentId'=>'student-1','planTitle'=>'new plan','planCompletedAt'=>'2026-10-13T13:00:00Z','status'=>'plan_completed']];$clean=sard_reconcile_queue($records,$assignments);check($clean[0]['status']==='plan_completed' && $clean[0]['assignmentId']==='new','verified current legacy request remains actionable');
$pdo=seed();$old=queue($pdo)[0];app_state_patch_sard($pdo,1,['changes'=>[], 'removals'=>[['id'=>'sq-1','base'=>$old]]]);check(queue($pdo)[0]['status']==='archived','manager removal archives request on server');expectFailure(fn()=>app_state_patch_sard($pdo,1,['changes'=>[['item'=>$old,'base'=>queue($pdo)[0]]]]),'الطلب منتهٍ');
$pdo=seed();$pdo->exec('UPDATE student_plan_assignments SET id="reassigned" WHERE id="old"');$GLOBALS['input']['expected_assignment_id']='reassigned';expectFailure(fn()=>handle_assign_plan(),'لم يكتمل حفظ');check(activePlan($pdo)==='current','previous assignment completions do not finish a reassigned plan');

$pdo=seed();$pdo->exec('ALTER TABLE segment_completions DROP COLUMN assignment_id');plans_ensure_completion_assignment_column($pdo);plans_ensure_completion_assignment_column($pdo);check(table_column_exists($pdo,'segment_completions','assignment_id'),'legacy completion schema upgrades idempotently before transaction');

$records=[['id'=>'legacy-pass','studentId'=>'student-1','closedPlanTitle'=>'new plan','passedAt'=>'2026-10-13T13:00:00Z','status'=>'passed'],['id'=>'duplicate','studentId'=>'student-1','assignmentId'=>'new','status'=>'plan_completed']];$clean=sard_reconcile_queue($records,$assignments);check($clean[0]['assignmentId']==='new' && $clean[1]['status']==='archived','legacy pass on final current plan suppresses duplicate completion request');
