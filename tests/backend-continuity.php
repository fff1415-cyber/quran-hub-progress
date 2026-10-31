<?php
declare(strict_types=1);
require __DIR__.'/backend-sard-regression.php';
require __DIR__.'/backend-continuity-cases.php';
$pdo=seed();continuityCases($pdo);
$GLOBALS['auth']=['role'=>'manager','complexId'=>1];app_state_upsert($pdo,'grades',['S'=>['keep'=>'original']],1);
$pdo->exec("CREATE TRIGGER fail_continuity BEFORE UPDATE ON app_state WHEN NEW.`key`='grades' BEGIN SELECT RAISE(ABORT,'fixture continuity failure'); END");$GLOBALS['input']=['key'=>'grades','value'=>['S'=>['keep'=>'new']]];
continuityFailure(fn()=>handle_set_app_state(),'fixture continuity failure');check(json_decode($pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='grades'")->fetchColumn(),true)===['S'=>['keep'=>'original']],'actual partial save failure rolls back to the exact previous source');
