<?php
declare(strict_types=1);
require __DIR__.'/../api/lib/grade-cell-operations.php';require __DIR__.'/grade-cell-cases.php';
$pdo->exec(file_get_contents(__DIR__.'/fixtures/grade-cell-operations.sql'));gradeCellCases($pdo);
$paths=[['concurrent-S','1','days','sun','hifz'],['concurrent-S','1','days','mon','hifz']];$snapshot=grade_cells_capture($pdo,1,'grades',$paths);$children=[];
for($i=0;$i<2;$i++) {
    $pid=pcntl_fork();if($pid===-1)throw new RuntimeException('fork unavailable');
    if($pid===0) {try {$child=connectFixture();grade_cells_apply($child,1,'grades','grade-native-independent-'.$i,$snapshot['calendar_context'],[gradeCellChange($snapshot,$i,$i===0?'one':'half')]);exit(0);}catch(Throwable $error) {fwrite(STDERR,'Isolated different-cell write: '.$error->getMessage()."\n");exit(1);}}
    $children[]=$pid;
}
foreach($children as $pid) {pcntl_waitpid($pid,$status);check(pcntl_wifexited($status)&&pcntl_wexitstatus($status)===0,'native different-cell request commits');}
$GLOBALS['pdo']=$pdo=connectFixture();$value=json_decode(gradeCellRaw($pdo,1),false);
check($value->{'concurrent-S'}->{'1'}->days->sun->hifz==='one'&&$value->{'concurrent-S'}->{'1'}->days->mon->hifz==='half','two real concurrent connections preserve both different-cell writes and the old shared store');
$snapshot=grade_cells_capture($pdo,1,'grades',[$paths[0]]);$children=[];$results=[];
for($i=0;$i<2;$i++) {
    $pid=pcntl_fork();if($pid===-1)throw new RuntimeException('fork unavailable');
    if($pid===0) {try {$child=connectFixture();grade_cells_apply($child,1,'grades','grade-native-same-'.$i,$snapshot['calendar_context'],[gradeCellChange($snapshot,0,$i===0?'two':'')]);exit(0);}catch(Throwable $error) {exit($error->getCode()===409&&str_contains($error->getMessage(),'عدّل مستخدم آخر')?2:1);}}
    $children[]=$pid;
}
foreach($children as $pid) {pcntl_waitpid($pid,$status);check(pcntl_wifexited($status),'native same-cell worker exits cleanly');$results[]=pcntl_wexitstatus($status);}
sort($results);$GLOBALS['pdo']=$pdo=connectFixture();
check($results===[0,2]&&(int)$pdo->query("SELECT COUNT(*) FROM grade_operation_receipts WHERE operation_id IN ('grade-native-same-0','grade-native-same-1')")->fetchColumn()===1,'same-cell race returns one confirmed receipt and one explicit conflict rather than silent last-write loss');
$snapshot=grade_cells_capture($pdo,1,'grades',[$paths[1]]);$before=gradeCellRaw($pdo,1);$versions=$pdo->query('SELECT * FROM grade_cell_versions ORDER BY context_id,store_key,path_sha256')->fetchAll();
$pdo->exec("ALTER TABLE grade_operation_receipts ADD CONSTRAINT fixture_grade_receipt CHECK(operation_id<>'grade-native-failure')");
gradeCellFailure(fn()=>grade_cells_apply($pdo,1,'grades','grade-native-failure',$snapshot['calendar_context'],[gradeCellChange($snapshot,0,'two')]),'fixture_grade_receipt');
check(gradeCellRaw($pdo,1)===$before&&$pdo->query('SELECT * FROM grade_cell_versions ORDER BY context_id,store_key,path_sha256')->fetchAll()===$versions,'native final-receipt failure rolls back all grade bytes and path versions');
$scienceBefore=gradeCellRaw($pdo,1,'scientific_grades');$pdo->beginTransaction();app_state_upsert($pdo,'scientific_grades',(object)['outer'=>'partial-write'],1);
gradeCellFailure(fn()=>grade_cells_apply($pdo,1,'grades','grade-native-failure',$snapshot['calendar_context'],[gradeCellChange($snapshot,0,'two')]),'fixture_grade_receipt');
check(!$pdo->inTransaction()&&gradeCellRaw($pdo,1)===$before&&gradeCellRaw($pdo,1,'scientific_grades')===$scienceBefore,'native joined transaction failure preserves caller records and cannot commit only one part');
$pdo->exec('SET TRANSACTION READ ONLY');$pdo->beginTransaction();grade_cells_capture($pdo,1,'grades',$paths);$pdo->rollBack();check(gradeCellRaw($pdo,1)===$before,'native metadata capture works in a genuinely read-only transaction without row initialization');
echo "PASS: native independent grade-cell data engine, conflict detection and tombstone retention; public integration remains pending\n";
