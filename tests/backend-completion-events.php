<?php
declare(strict_types=1);
require __DIR__.'/backend-sard-regression.php';
require __DIR__.'/assignment-operation-cases.php';
require __DIR__.'/completion-events-cases.php';
require __DIR__.'/completion-edits-cases.php';
function completionSeed():PDO {
    $pdo=seed();
    $pdo->exec('ALTER TABLE students ADD COLUMN halaqa_id INTEGER DEFAULT 7');
    $pdo->exec("ALTER TABLE education_plans ADD COLUMN segment_count INTEGER DEFAULT 2;
      ALTER TABLE education_plans ADD COLUMN created_at TEXT DEFAULT '2026-10-01';
      ALTER TABLE plan_segments ADD COLUMN id TEXT;
      ALTER TABLE plan_segments ADD COLUMN hifz_plan TEXT DEFAULT 'h';
      ALTER TABLE plan_segments ADD COLUMN rabt_plan TEXT DEFAULT 'r';
      ALTER TABLE plan_segments ADD COLUMN muraja_plan TEXT DEFAULT 'm';
      UPDATE plan_segments SET id='segment-'||rowid;");
    $pdo->exec("ALTER TABLE segment_completions ADD COLUMN id TEXT;
      ALTER TABLE segment_completions ADD COLUMN completed_at TEXT DEFAULT '2026-10-02';
      ALTER TABLE segment_completions ADD COLUMN recorded_by TEXT DEFAULT 'original';
      ALTER TABLE segment_completions ADD COLUMN fixture_extra TEXT DEFAULT '{\"zero\":0,\"unknown\":null}';
      UPDATE segment_completions SET id='legacy-'||rowid;
      UPDATE segment_completions SET assignment_id=NULL WHERE segment_index=2;
      CREATE UNIQUE INDEX fixture_legacy_id ON segment_completions(id);");
    assignmentReceiptTable($pdo);$pdo->exec('PRAGMA foreign_keys=ON');
    $pdo->exec("CREATE TABLE plan_completion_events(id TEXT PRIMARY KEY,context_id INTEGER NOT NULL,operation_id TEXT NOT NULL,assignment_id TEXT NOT NULL,student_id TEXT NOT NULL,plan_id TEXT NOT NULL,segment_index INTEGER NOT NULL,task_type TEXT NOT NULL,event_kind TEXT NOT NULL,reverses_event_id TEXT,completed_at TEXT,source_reference_json TEXT,recorded_by TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(context_id,operation_id) REFERENCES plan_operation_receipts(context_id,operation_id) ON DELETE RESTRICT,FOREIGN KEY(reverses_event_id) REFERENCES plan_completion_events(id) ON DELETE RESTRICT);
      CREATE TABLE plan_completion_heads(assignment_id TEXT NOT NULL,task_type TEXT NOT NULL,segment_index INTEGER NOT NULL,current_event_id TEXT NOT NULL,is_completed INTEGER NOT NULL CHECK(is_completed IN(0,1)),PRIMARY KEY(assignment_id,task_type,segment_index),FOREIGN KEY(current_event_id) REFERENCES plan_completion_events(id) ON DELETE RESTRICT);");
    return $pdo;
}
$pdo=completionSeed();completionEventCases($pdo,'student-1','current','old','ce-sqlite');
$pdo=completionSeed();completionLegacyCases($pdo,'student-1','old','ce-legacy');
$pdo=completionSeed();completionEditCases($pdo,'student-1','current','old','ce-edit');
$pdo=completionSeed();$current=completionAssign($pdo,'student-1','current','old','ce-edit-failure-assign');
app_state_upsert($pdo,'grades',['fixture'=>['keep'=>0,'unknown'=>null]],1);
$beforeGrade=$pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='grades'")->fetchColumn();
$pdo->exec("CREATE TRIGGER fixture_edit_head BEFORE INSERT ON plan_completion_heads BEGIN SELECT RAISE(ABORT,'fixture manual head failure'); END");
$pdo->beginTransaction();app_state_upsert($pdo,'grades',['fixture'=>['keep'=>99]],1);
completionFailure(fn()=>plan_events_set_hifz($pdo,1,'student-1',$current['id'],'ce-edit-partial',1,'complete','2026-10-15',null,'fixture'),'fixture manual head failure');
check(!$pdo->inTransaction()&&$pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='grades'")->fetchColumn()===$beforeGrade&&(int)$pdo->query('SELECT COUNT(*) FROM plan_completion_events')->fetchColumn()===0,'manual-edit failure rolls back outer grade bytes and the provisional event/receipt');
class RetryCompletionDatabase extends TestDatabase {
    public int $fixtureFailures=0;
    public int $fixtureAttempts=0;
    public int $fixtureCode=1020;
    public bool $fixtureExpire=false;
    public function prepare(string $query,array $options=[]):PDOStatement|false {
        if ($query==='SELECT id FROM students WHERE id = ? FOR UPDATE') {
            $this->fixtureAttempts++;
            if ($this->fixtureExpire) {$this->fixtureExpire=false;$this->rollBack();}
            if ($this->fixtureFailures>0) {
                $this->fixtureFailures--;
                $error=new PDOException('isolated completion read failure');$error->errorInfo=['HY000',$this->fixtureCode,'isolated completion read failure'];throw $error;
            }
        }
        return parent::prepare($query,$options);
    }
}
$GLOBALS['completionDatabaseClass']=RetryCompletionDatabase::class;
$pdo=completionSeed();unset($GLOBALS['completionDatabaseClass']);$current=completionAssign($pdo,'student-1','current','old','ce-retry-assign');
$pdo->fixtureFailures=1;$result=plan_events_set_hifz($pdo,1,'student-1',$current['id'],'ce-retry-once',1,'complete','2026-10-15',null,'fixture');
check($pdo->fixtureAttempts===2&&count($result['event_ids'])===1&&count(plan_events_history($pdo,1,$current))===1,'owned data-only transaction retries one stale-read failure after full rollback with the same receipt identity');
$beforeAttempts=$pdo->fixtureAttempts;$pdo->fixtureFailures=3;
try {plan_events_set_hifz($pdo,1,'student-1',$current['id'],'ce-retry-bounded',2,'complete','2026-10-16',null,'fixture');throw new RuntimeException('retry cap not enforced');}
catch(RuntimeException $error) {if($error->getCode()!==409||!($error->getPrevious() instanceof PDOException))throw $error;}
check($pdo->fixtureAttempts-$beforeAttempts===3&&!$pdo->inTransaction()&&count(plan_events_history($pdo,1,$current))===1,'contention retries are bounded to three attempts and return a clear conflict without another event');
app_state_upsert($pdo,'grades',['fixture'=>['zero'=>0,'unknown'=>null]],1);$beforeGrade=$pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='grades'")->fetchColumn();
$beforeAttempts=$pdo->fixtureAttempts;$pdo->fixtureFailures=1;$pdo->beginTransaction();app_state_upsert($pdo,'grades',['fixture'=>['zero'=>99]],1);
try {plan_events_set_hifz($pdo,1,'student-1',$current['id'],'ce-retry-outer',2,'complete','2026-10-16',null,'fixture');throw new RuntimeException('outer transaction retried only its completion');}
catch(RuntimeException $error) {if($error->getCode()!==409||!($error->getPrevious() instanceof PDOException))throw $error;}
check($pdo->fixtureAttempts-$beforeAttempts===1&&!$pdo->inTransaction()&&$pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='grades'")->fetchColumn()===$beforeGrade,'a composed grade transaction is rolled back entirely, never retried as a completion-only fragment');
$beforeAttempts=$pdo->fixtureAttempts;$pdo->fixtureFailures=1;$pdo->fixtureCode=1452;
try {plan_events_set_hifz($pdo,1,'student-1',$current['id'],'ce-no-retry-integrity',2,'complete','2026-10-16',null,'fixture');throw new RuntimeException('unrelated integrity error hidden');}
catch(PDOException $error) {check((int)$error->errorInfo[1]===1452,'unrelated integrity failure remains explicit');}
check($pdo->fixtureAttempts-$beforeAttempts===1&&!$pdo->inTransaction(),'unrelated SQL failures are never silently retried');
$pdo->fixtureFailures=0;$pdo->fixtureExpire=true;
completionFailure(fn()=>plan_events_set_hifz($pdo,1,'student-1',$current['id'],'ce-expired-transaction',2,'complete','2026-10-16',null,'fixture'),'انتهت معاملة الحفظ');
check((int)$pdo->query("SELECT COUNT(*) FROM plan_operation_receipts WHERE operation_id='ce-expired-transaction'")->fetchColumn()===0&&count(plan_events_history($pdo,1,$current))===1,'an expired transaction cannot commit a provisional receipt in autocommit mode');
// The enclosing grade write must roll back when a later segment cannot save.
$pdo=completionSeed();$pdo->exec("UPDATE education_plans SET track='silver' WHERE id='current'");
$current=completionAssign($pdo,'student-1','current','old','ce-atomic-assign');$raw=completionRaw($pdo,'student-1');
app_state_upsert($pdo,'grades',['S'=>['keep'=>0,'unknown'=>null]],1);$grade=$pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='grades'")->fetchColumn();
$pdo->exec("CREATE TRIGGER fixture_second_head BEFORE INSERT ON plan_completion_heads WHEN NEW.segment_index=2 BEGIN SELECT RAISE(ABORT,'fixture second head failure'); END");
$pdo->beginTransaction();app_state_upsert($pdo,'grades',['S'=>['keep'=>99]],1);
completionFailure(fn()=>plan_events_apply($pdo,1,'student-1',$current['id'],'ce-partial-failure','hifz','one','2026-10-15','fixture'),'fixture second head failure');
check(!$pdo->inTransaction()&&$pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='grades'")->fetchColumn()===$grade&&(int)$pdo->query('SELECT COUNT(*) FROM plan_completion_events')->fetchColumn()===0&&(int)$pdo->query('SELECT COUNT(*) FROM plan_completion_heads')->fetchColumn()===0&&completionRaw($pdo,'student-1')===$raw,'whole caller transaction, grade bytes, partial events/heads and legacy sources survive a second-segment failure');
$pdo=completionSeed();$current=completionAssign($pdo,'student-1','current','old','ce-finalize-assign');
$pdo->exec("CREATE TRIGGER fixture_finalize_failure BEFORE UPDATE ON plan_operation_receipts WHEN NEW.operation_id='ce-finalize-failure' BEGIN SELECT RAISE(ABORT,'fixture final receipt failure'); END");
completionFailure(fn()=>plan_events_apply($pdo,1,'student-1',$current['id'],'ce-finalize-failure','hifz','one','2026-10-15','fixture'),'fixture final receipt failure');
check((int)$pdo->query('SELECT COUNT(*) FROM plan_completion_events')->fetchColumn()===0&&(int)$pdo->query("SELECT COUNT(*) FROM plan_operation_receipts WHERE operation_id='ce-finalize-failure'")->fetchColumn()===0,'failed receipt finalization commits neither the provisional receipt nor events');
echo "PASS: isolated event data layer, future assignment identity, exact reversal, replay and full failure rollback; public completion writers are not switched yet\n";
