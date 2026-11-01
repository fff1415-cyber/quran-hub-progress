<?php
declare(strict_types=1);
require __DIR__.'/backend-sard-regression.php';
require __DIR__.'/backend-continuity-cases.php';
$pdo=seed();$GLOBALS['auth']=['role'=>'manager','complexId'=>1];
app_state_upsert($pdo,'grades',['S'=>['zero'=>0,'blank'=>'','unknown'=>null,'previous'=>'keep']],1);
$pdo->exec("CREATE TRIGGER fixture_unneeded_initialization BEFORE INSERT ON app_state WHEN NEW.value='{}' AND NEW.key='grades' BEGIN SELECT RAISE(ABORT,'unnecessary existing-row initialization'); END");
$value=['S'=>['zero'=>0,'blank'=>'','unknown'=>null,'previous'=>'keep','new'=>'confirmed']];
$GLOBALS['input']=['key'=>'grades','value'=>$value];handle_set_app_state();
check(json_decode($pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND key='grades'")->fetchColumn(),true)===$value,'existing store saves without running the empty initializer; zero/blank/null and current work remain');
$before=$pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND key='grades'")->fetchColumn();
$GLOBALS['input']=['key'=>'grades','value'=>[]];continuityFailure(fn()=>handle_set_app_state(),'سيصفّر');
check($pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND key='grades'")->fetchColumn()===$before,'existing empty-reset guard remains unchanged after the lock fix');
$pdo->exec("CREATE TRIGGER fixture_existing_save_failure BEFORE UPDATE ON app_state WHEN NEW.key='grades' BEGIN SELECT RAISE(ABORT,'fixture existing-save failure'); END");
$GLOBALS['input']=['key'=>'grades','value'=>['S'=>['new'=>'cannot-commit']]];continuityFailure(fn()=>handle_set_app_state(),'fixture existing-save failure');
check(!$pdo->inTransaction()&&$pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND key='grades'")->fetchColumn()===$before,'actual write failure keeps the exact previous bytes and rolls back the entire save');
$GLOBALS['input']=['key'=>'weekly_tests','value'=>['S'=>['zero'=>0,'unknown'=>null]]];handle_set_app_state();
check(json_decode($pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND key='weekly_tests'")->fetchColumn(),true)===$GLOBALS['input']['value'],'a genuinely missing store still initializes and saves through the same original path');
echo "PASS: existing grade lock ordering, original reset protection and genuine initialization; no data migration or new save protocol\n";

$pdo->beginTransaction();
try {app_state_save_without_reset($pdo,1,'grades',['S'=>['new'=>'nested']]);throw new RuntimeException('nested save unexpectedly committed');}
catch(PDOException $error) {check($pdo->inTransaction(),'an already active caller transaction is rejected without beginning a partial nested save');}
$pdo->rollBack();
check($pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND key='grades'")->fetchColumn()===$before,'rejected nested invocation preserves all original grade bytes');
