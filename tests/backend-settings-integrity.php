<?php
declare(strict_types=1);
require __DIR__.'/backend-sard-regression.php';
require __DIR__.'/../api/routes/evaluation_settings.php';
$pdo=seed();$GLOBALS['auth']['role']='manager';$columns=[];
foreach(eval_settings_defaults() as $key=>$value)$columns[]=$key.' NUMERIC DEFAULT '.$value;
$pdo->exec('CREATE TABLE evaluation_settings(complex_id INTEGER PRIMARY KEY,'.implode(',',$columns).')');
handle_get_evaluation_settings();
check((int)$pdo->query('SELECT COUNT(*) FROM evaluation_settings')->fetchColumn()===0,'settings GET returns defaults without creating database rows');
$GLOBALS['input']=['settings'=>array_merge(eval_settings_defaults(),['error_deduction'=>7])];handle_put_evaluation_settings();
check($GLOBALS['response']['settings']['error_deduction']===7&&(int)$pdo->query('SELECT COUNT(*) FROM evaluation_settings')->fetchColumn()===1,'authorized PUT initializes and confirms the actual shared settings');
$GLOBALS['auth']['role']='supervisor';expectFailure(fn()=>handle_put_evaluation_settings(),'Forbidden');
$GLOBALS['auth']['role']='manager';$pdo->exec("CREATE TRIGGER reject_settings BEFORE UPDATE ON evaluation_settings BEGIN SELECT RAISE(ABORT,'settings write failure'); END");
$GLOBALS['input']['settings']['error_deduction']=9;unset($GLOBALS['response']);
try{handle_put_evaluation_settings();throw new RuntimeException('expected write failure');}catch(PDOException $error){check(str_contains($error->getMessage(),'settings write failure'),'shared settings failure reaches the caller');}
check(!isset($GLOBALS['response'])&&(int)$pdo->query('SELECT error_deduction FROM evaluation_settings')->fetchColumn()===7,'failed PUT cannot return success or overwrite approved values');
echo "PASS: server settings read-only GET, confirmed save, existing manager guard and failed write\n";
