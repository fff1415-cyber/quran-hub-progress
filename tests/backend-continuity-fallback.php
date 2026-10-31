<?php
declare(strict_types=1);
if(!getenv('AUDIT_APP_STATE_SOURCE'))throw new RuntimeException('Isolated fallback source required');
require __DIR__.'/backend-sard-regression.php';
require __DIR__.'/continuity-sql-errors.php';
$pdo=seed();$GLOBALS['auth']=['role'=>'manager','complexId'=>1];
$grade=['S'=>[1=>['days'=>['sun'=>['hifz'=>'one','unknown'=>null,'compensationFaces'=>0]]]]];
app_state_upsert($pdo,'grades',$grade,1);$raw=$pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='grades'")->fetchColumn();
$GLOBALS['input']=['key'=>'grades','value'=>[]];expectFailure(fn()=>handle_set_app_state(),'سيصفّر');check($pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='grades'")->fetchColumn()===$raw,'fallback refuses destructive old-client snapshots and retains exact new source bytes');
$grade['S'][1]['days']['sun']['hifz']='';$GLOBALS['input']['value']=$grade;handle_set_app_state();check($GLOBALS['response']['ok']===true&&json_decode($pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='grades'")->fetchColumn(),true)===$grade,'fallback supports explicit single-field clear without removing week, zero or unknown metadata');
$GLOBALS['auth']['complexId']=2;$GLOBALS['input']['value']=['T'=>[2=>['days'=>['mon'=>['hifz'=>'two']]]]];handle_set_app_state();check(json_decode($pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='grades'")->fetchColumn(),true)===$grade,'fallback keeps the original complex predicate');
foreach(['weekly_tests'=>['S'=>[1=>['muraja'=>['pass']]]],'scientific_grades'=>['data'=>['1'=>['S'=>[1=>['sun'=>['hifz'=>'0']]]]]],'tarbawi_program'=>['settingsBySemester'=>[],'plans'=>['A:1'=>['status'=>'approved']]]] as $key=>$value){$GLOBALS['input']=['key'=>$key,'value'=>$value];handle_set_app_state();$GLOBALS['input']['value']=$key==='tarbawi_program'?['settingsBySemester'=>[],'plans'=>[]]:($key==='scientific_grades'?['configs'=>[],'data'=>[],'overrides'=>[]]:[]);expectFailure(fn()=>handle_set_app_state(),'سيصفّر');}
