<?php
declare(strict_types=1);
class GradeCellsDatabase extends PDO {
    public function __construct() {parent::__construct('sqlite::memory:');$this->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);$this->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE,PDO::FETCH_ASSOC);}
    public function prepare(string $query,array $options=[]):PDOStatement|false {
        if(str_contains($query,'information_schema.tables'))$query="SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?";
        $query=str_replace(' FOR UPDATE','',$query);
        $query=str_replace('ON DUPLICATE KEY UPDATE value = ?','ON CONFLICT DO UPDATE SET value = ?',$query);
        $query=str_replace('ON DUPLICATE KEY UPDATE direct_version=?,subtree_version=?,updated_at=CURRENT_TIMESTAMP','ON CONFLICT(context_id,store_key,path_sha256) DO UPDATE SET direct_version=?,subtree_version=?,updated_at=CURRENT_TIMESTAMP',$query);
        return parent::prepare($query,$options);
    }
}
function table_column_exists(PDO $pdo,string $table,string $column):bool {foreach($pdo->query('PRAGMA table_info('.$table.')')->fetchAll() as $row)if($row['name']===$column)return true;return false;}
function check(bool $ok,string $message):void {if(!$ok)throw new RuntimeException('FAIL: '.$message);echo 'PASS: '.$message."\n";}
require __DIR__.'/../api/routes/app_state.php';require __DIR__.'/../api/routes/plans.php';require __DIR__.'/../api/lib/grade-cell-operations.php';require __DIR__.'/grade-cell-cases.php';
function gradeCellsSeed(bool $scoped=true):PDO {
    $pdo=new GradeCellsDatabase();$pdo->exec($scoped?'CREATE TABLE app_state(complex_id INTEGER NOT NULL,`key` TEXT NOT NULL,value TEXT,UNIQUE(complex_id,`key`))':'CREATE TABLE app_state(`key` TEXT PRIMARY KEY,value TEXT)');
    $pdo->exec('CREATE TABLE semesters(id INTEGER PRIMARY KEY,complex_id INTEGER,is_active INTEGER); INSERT INTO semesters VALUES(1,1,1),(2,1,0),(3,2,1)');
    $pdo->exec('CREATE TABLE grade_cell_versions(context_id INTEGER NOT NULL,store_key TEXT NOT NULL,path_sha256 TEXT NOT NULL,path_json TEXT NOT NULL,direct_version TEXT,subtree_version TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(context_id,store_key,path_sha256)); CREATE TABLE grade_operation_receipts(context_id INTEGER NOT NULL,store_key TEXT NOT NULL,operation_id TEXT NOT NULL,input_sha256 TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(context_id,store_key,operation_id))');
    return $pdo;
}
$pdo=gradeCellsSeed();gradeCellCases($pdo);
$before=gradeCellRaw($pdo,1);$versions=$pdo->query('SELECT * FROM grade_cell_versions ORDER BY context_id,store_key,path_sha256')->fetchAll();$snapshot=grade_cells_capture($pdo,1,'grades',[['S','1','days','sun','hifz']]);
$pdo->exec("CREATE TRIGGER fixture_receipt_failure BEFORE INSERT ON grade_operation_receipts WHEN NEW.operation_id='grade-receipt-failure' BEGIN SELECT RAISE(ABORT,'fixture grade receipt failure'); END");
gradeCellFailure(fn()=>grade_cells_apply($pdo,1,'grades','grade-receipt-failure',$snapshot['calendar_context'],[gradeCellChange($snapshot,0,'two')]),'fixture grade receipt failure');
check(gradeCellRaw($pdo,1)===$before&&$pdo->query('SELECT * FROM grade_cell_versions ORDER BY context_id,store_key,path_sha256')->fetchAll()===$versions,'receipt failure rolls back grade bytes and every path/tombstone revision');
$scienceBefore=gradeCellRaw($pdo,1,'scientific_grades');$pdo->beginTransaction();app_state_upsert($pdo,'scientific_grades',(object)['outer'=>'partial-write'],1);
gradeCellFailure(fn()=>grade_cells_apply($pdo,1,'grades','grade-receipt-failure',$snapshot['calendar_context'],[gradeCellChange($snapshot,0,'two')]),'fixture grade receipt failure');
check(!$pdo->inTransaction()&&gradeCellRaw($pdo,1)===$before&&gradeCellRaw($pdo,1,'scientific_grades')===$scienceBefore,'a joined transaction rolls back the caller write too, without a grade-only retry');
$count=$pdo->query('SELECT COUNT(*) FROM grade_cell_versions')->fetchColumn();$pdo->exec('PRAGMA query_only=ON');grade_cells_capture($pdo,1,'grades',[['S','1','days','sun','hifz']]);$pdo->exec('PRAGMA query_only=OFF');check($pdo->query('SELECT COUNT(*) FROM grade_cell_versions')->fetchColumn()===$count,'read-only capture neither initializes versions nor rewrites values');
$firstBefore=gradeCellRaw($pdo,1);app_state_upsert($pdo,'grades',(object)['own'=>(object)['zero'=>0]],2);$other=grade_cells_capture($pdo,2,'grades',[['own','zero']]);grade_cells_apply($pdo,2,'grades','grade-first-operation',$other['calendar_context'],[gradeCellChange($other,0,1)]);
check(gradeCellRaw($pdo,1)===$firstBefore&&json_decode(gradeCellRaw($pdo,2),false)->own->zero===1,'existing scoped physical keys and identical operation IDs stay independent; no access policy is introduced');
$pdo=gradeCellsSeed(false);gradeCellCases($pdo);check((int)$pdo->query('SELECT COUNT(*) FROM grade_cell_versions WHERE context_id<>0')->fetchColumn()===0,'unscoped legacy stores retain one physical revision domain without adding tenant isolation or access behavior');
$path=['S','1','days','sun','hifz'];$one=grade_cells_capture($pdo,1,'grades',[$path]);$two=grade_cells_capture($pdo,2,'grades',[$path]);grade_cells_apply($pdo,1,'grades','grade-global-one',$one['calendar_context'],[gradeCellChange($one,0,'two')]);
gradeCellFailure(fn()=>grade_cells_apply($pdo,2,'grades','grade-global-stale',$two['calendar_context'],[gradeCellChange($two,0,'one')]),'عدّل مستخدم آخر');
check(json_decode(gradeCellRaw($pdo,2),false)->S->{'1'}->days->sun->hifz==='two','legacy global physical key cannot hide a stale write behind a different logical complex revision domain');
echo "PASS: isolated grade-cell engine; no public writer or browser integration is connected\n";
