<?php
declare(strict_types=1);
require __DIR__.'/backend-sard-regression.php';
require __DIR__.'/../api/routes/evaluation_settings.php';
$pdo=seed();$GLOBALS['auth']=['role'=>'musammi','accountId'=>'fixture','complexId'=>1];
$snapshot=['reference'=>'fixture-future-reference','adoptedAt'=>'2026-10-29T12:00:00.000Z','settings'=>eval_settings_defaults()];
$snapshot['settings']['error_deduction']=0;$snapshot['settings']['review_error_deduction']=2.5;
$base=queue($pdo)[0];$item=array_merge($base,['phase'=>'review_only','status'=>'awaiting_review','lockedHifzScore'=>45,'reviewSegmentCount'=>3,'scheduledAt'=>'2026-10-31T12:00:00.000Z','evaluationRules'=>$snapshot]);
app_state_patch_sard($pdo,1,['changes'=>[['base'=>$base,'item'=>$item]]]);
$confirmed=queue($pdo)[0];check($confirmed['evaluationRules']===json_decode(app_state_json_encode($snapshot),true),'real queue handler retains exact future rule reference, zero and decimal values');
$_GET=['key'=>'sard_queue'];$pdo->exec('PRAGMA query_only = ON');handle_list_app_state();$pdo->exec('PRAGMA query_only = OFF');
check($GLOBALS['response'][0]['value'][0]['evaluationRules']===$confirmed['evaluationRules'],'another read-only client receives the same recorded rules');
$failed=array_merge($confirmed,['scheduledAt'=>'2026-10-29T12:00:00.000Z']);$pdo->exec("CREATE TRIGGER fail_reference BEFORE INSERT ON app_state BEGIN SELECT RAISE(ABORT,'fixture rule save failure'); END");
expectFailure(fn()=>app_state_patch_sard($pdo,1,['changes'=>[['base'=>$confirmed,'item'=>$failed]]]),'fixture rule save failure');
check(queue($pdo)[0]===$confirmed,'failed queue write leaves the confirmed locked score, reference and schedule intact');
