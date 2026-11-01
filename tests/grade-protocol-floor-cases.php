<?php
declare(strict_types=1);
function gradeProtocolFailure(callable $run,int $status):void {
    try {$run();}catch(Throwable $error){if($error->getCode()!==$status)throw $error;check(true,'explicit protocol/role rejection '.$status.' occurs before any database access');return;}
    throw new RuntimeException('unsupported grade frame was incorrectly acknowledged');
}
function gradeProtocolFloorCases(PDO $pdo):void {
    $originalAuth=$GLOBALS['auth']??[];$GLOBALS['auth']=['role'=>'manager','complexId'=>1];
    $sql='SELECT * FROM app_state ORDER BY '.(app_state_tenant_enabled($pdo)?'complex_id,':'').'`key`';$before=$pdo->query($sql)->fetchAll();
    $frame=['operation_id'=>'fixture-protocol-op','calendar_context'=>['known'=>true,'active_semester_id'=>'1'],'changes'=>[['path'=>['S','1','days','sun','hifz'],'next'=>['present'=>true,'value'=>'one']]]];
    foreach(['grades','weekly_tests','scientific_grades'] as $key)foreach([null,'',0,1,'grade-cells-v1','unknown-future-version',[]] as $version) {
        $GLOBALS['input']=['key'=>$key,'value'=>$frame,'grade_write_protocol'=>$version];$GLOBALS['pdo']=null;
        try {gradeProtocolFailure(fn()=>handle_set_app_state(),503);}finally{$GLOBALS['pdo']=$pdo;}
    }
    $GLOBALS['auth']=['role'=>'test_member','complexId'=>1];$GLOBALS['input']=['key'=>'grades','value'=>$frame,'grade_write_protocol'=>'grade-cells-v1'];$GLOBALS['pdo']=null;
    try {gradeProtocolFailure(fn()=>handle_set_app_state(),403);}finally{$GLOBALS['pdo']=$pdo;}
    $GLOBALS['input']=['key'=>'weekly_tests','value'=>$frame,'grade_write_protocol'=>'grade-cells-v1'];$GLOBALS['pdo']=null;
    try {gradeProtocolFailure(fn()=>handle_set_app_state(),403);}finally{$GLOBALS['pdo']=$pdo;}
    $GLOBALS['input']=['key'=>'weekly_tests','value'=>[],'grade_write_protocol'=>'grade-cells-v1'];$GLOBALS['pdo']=null;
    try {gradeProtocolFailure(fn()=>handle_set_app_state(),503);}finally{$GLOBALS['pdo']=$pdo;}
    check($pdo->query($sql)->fetchAll()===$before,'every unsupported/null/malformed frame leaves all stored grade values and rows byte-equivalent');
    $GLOBALS['auth']=['role'=>'manager','complexId'=>1];$query=$pdo->prepare('SELECT value FROM app_state WHERE complex_id=1 AND `key`=?');$query->execute(['grades']);$raw=$query->fetchColumn();
    $value=$raw===false?new stdClass():json_decode((string)$raw,false,512,JSON_THROW_ON_ERROR);if(!($value instanceof stdClass))throw new RuntimeException('fixture grades root is not an object');
    $value->{'fixture-opaque-data'}=(object)['zero'=>0,'blank'=>'','unknown'=>null,'grade_write_protocol'=>'nested-user-data'];
    $GLOBALS['input']=['key'=>'grades','value'=>get_object_vars($value)];handle_set_app_state();$query->execute(['grades']);$actual=json_decode($query->fetchColumn(),false,512,JSON_THROW_ON_ERROR);
    check(json_encode($actual,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)===json_encode($value,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),'unversioned current saves remain unchanged; a nested lookalike field and all existing/new values, zero/blank/null are preserved');
    $GLOBALS['input']=['key'=>'fixture_unrelated_store','value'=>['unknown'=>0],'grade_write_protocol'=>'opaque-extra'];handle_set_app_state();
    check(($GLOBALS['response']['ok']??false)===true,'unrelated existing app_state features retain their original behavior');
    $GLOBALS['auth']=$originalAuth;
}
