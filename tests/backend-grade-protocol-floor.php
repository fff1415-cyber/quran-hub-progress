<?php
declare(strict_types=1);
require __DIR__.'/backend-sard-regression.php';require __DIR__.'/grade-protocol-floor-cases.php';
$pdo=seed();$GLOBALS['pdo']=$pdo;$GLOBALS['auth']=['role'=>'manager','complexId'=>1];
app_state_upsert($pdo,'grades',['S'=>['keep'=>'original','zero'=>0,'unknown'=>null]],1);
if(($argv[1]??'')==='--negative') {
    $frame=['operation_id'=>'fixture-transport','calendar_context'=>['known'=>true],'changes'=>[['path'=>['S','1','days','sun','hifz'],'value'=>'one']]];
    $GLOBALS['input']=['key'=>'grades','value'=>$frame,'grade_write_protocol'=>'grade-cells-v1'];handle_set_app_state();
    $actual=json_decode($pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='grades'")->fetchColumn(),true);
    check($actual===$frame&&!isset($actual['S']),'negative control: the previous server mistakes an explicit new transport packet for a full grade store and replaces the fixture');
    exit(0);
}
gradeProtocolFloorCases($pdo);
echo "PASS: unsupported grade protocol packets never become student data; current role/legacy saves remain unchanged\n";
