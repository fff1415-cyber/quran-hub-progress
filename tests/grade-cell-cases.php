<?php
declare(strict_types=1);
function gradeCellFailure(callable $run,string $message):void {
    try {$run();} catch(Throwable $error) {if(!str_contains($error->getMessage(),$message))throw $error;check(true,$message);return;}
    throw new RuntimeException('Expected isolated grade conflict: '.$message);
}
function gradeCellRaw(PDO $pdo,int $cid,string $key='grades'):string {
    $scoped=app_state_tenant_enabled($pdo);$query=$pdo->prepare('SELECT value FROM app_state WHERE '.($scoped?'complex_id=? AND ':'').'`key`=?');$query->execute($scoped?[$cid,$key]:[$key]);return (string)$query->fetchColumn();
}
function gradeCellChange(array $capture,int $index,mixed $value,bool $present=true):array {
    return $capture['cells'][$index]+['next'=>$present?['present'=>true,'value'=>$value]:['present'=>false]];
}
function gradeCellCases(PDO $pdo):void {
    $pdo->exec('UPDATE semesters SET is_active=0 WHERE complex_id=1');$pdo->exec('UPDATE semesters SET is_active=1 WHERE id=1');
    $initial=json_decode('{"S":{"1":{"days":{"sun":{"hifz":"one","zero":0,"empty":"","nil":null,"unknown":{"list":[0,null,{}]}},"mon":{"hifz":"half"}}},"9":{"keep":"old-week"}},"T":{"keep":"other-student"}}',false,512,JSON_THROW_ON_ERROR);
    app_state_upsert($pdo,'grades',$initial,app_state_tenant_enabled($pdo)?1:null);
    $a=['S','1','days','sun','hifz'];$b=['S','1','days','mon','hifz'];$capture=grade_cells_capture($pdo,1,'grades',[$a,$b]);
    check($capture['calendar_context']===['known'=>true,'active_semester_id'=>'1']&&$capture['cells'][0]['base']===['present'=>true,'value'=>'one'],'snapshot returns the existing value and request-time calendar without attributing historical grades');
    $changeA=gradeCellChange($capture,0,'two');$first=grade_cells_apply($pdo,1,'grades','grade-first-operation',$capture['calendar_context'],[$changeA]);
    grade_cells_apply($pdo,1,'grades','grade-other-cell',$capture['calendar_context'],[gradeCellChange($capture,1,'one')]);
    $current=json_decode(gradeCellRaw($pdo,1),false);$day=$current->S->{'1'}->days->sun;
    check($day->hifz==='two'&&$current->S->{'1'}->days->mon->hifz==='one','different cells from the same old snapshot merge without losing either update');
    check($day->zero===0&&$day->empty===''&&$day->nil===null&&$day->unknown->list[2] instanceof stdClass&&$current->S->{'9'}->keep==='old-week'&&$current->T->keep==='other-student','zero, blank, null, empty objects, unknown arrays, other students and prior weeks survive targeted writes');
    $before=gradeCellRaw($pdo,1);$replay=grade_cells_apply($pdo,1,'grades','grade-first-operation',$capture['calendar_context'],[$changeA]);
    check($replay['replayed']&&$replay['input_sha256']===$first['input_sha256']&&gradeCellRaw($pdo,1)===$before,'lost-response replay acknowledges its receipt without replacing newer store contents');
    gradeCellFailure(fn()=>grade_cells_apply($pdo,1,'grades','grade-stale-cell',$capture['calendar_context'],[gradeCellChange($capture,0,'half')]),'عدّل مستخدم آخر');
    gradeCellFailure(fn()=>grade_cells_apply($pdo,1,'grades','grade-first-operation',$capture['calendar_context'],[gradeCellChange($capture,0,'half')]),'محتوى مختلف');
    check(gradeCellRaw($pdo,1)===$before,'same-cell conflict and changed-payload request ID leave exact stored bytes intact');
    $fresh=grade_cells_capture($pdo,1,'grades',[$a]);grade_cells_apply($pdo,1,'grades','grade-clear-operation',$fresh['calendar_context'],[gradeCellChange($fresh,0,'')]);
    check(json_decode(gradeCellRaw($pdo,1),false)->S->{'1'}->days->sun->hifz==='','explicit blank remains a stored value distinct from absence and zero');
    gradeCellFailure(fn()=>grade_cells_apply($pdo,1,'grades','grade-old-resurrection',$capture['calendar_context'],[$changeA]),'عدّل مستخدم آخر');
    $absent=['S','1','days','sun','new-cell'];$absentBase=grade_cells_capture($pdo,1,'grades',[$absent]);
    grade_cells_apply($pdo,1,'grades','grade-absent-create',$absentBase['calendar_context'],[gradeCellChange($absentBase,0,0)]);
    $remove=grade_cells_capture($pdo,1,'grades',[$absent]);grade_cells_apply($pdo,1,'grades','grade-explicit-remove',$remove['calendar_context'],[gradeCellChange($remove,0,null,false)]);
    check(!property_exists(json_decode(gradeCellRaw($pdo,1),false)->S->{'1'}->days->sun,'new-cell'),'explicit removal affects only its named value');
    gradeCellFailure(fn()=>grade_cells_apply($pdo,1,'grades','grade-aba-resurrection',$absentBase['calendar_context'],[gradeCellChange($absentBase,0,'old')]),'عدّل مستخدم آخر');
    check(grade_cells_capture($pdo,1,'grades',[$absent])['cells'][0]['stamp']['subtree']==='grade-explicit-remove','retained tombstone revision prevents an old absent-value snapshot from resurrecting a removed cell');
    $parent=['S','1','days','sun'];$oldParent=grade_cells_capture($pdo,1,'grades',[$parent]);$oldLeaf=grade_cells_capture($pdo,1,'grades',[$a]);
    grade_cells_apply($pdo,1,'grades','grade-leaf-newer',$oldLeaf['calendar_context'],[gradeCellChange($oldLeaf,0,'half')]);
    gradeCellFailure(fn()=>grade_cells_apply($pdo,1,'grades','grade-stale-parent',$oldParent['calendar_context'],[gradeCellChange($oldParent,0,$oldParent['cells'][0]['base']['value'])]),'عدّل مستخدم آخر');
    $oldLeaf=grade_cells_capture($pdo,1,'grades',[$a]);$parentNow=grade_cells_capture($pdo,1,'grades',[$parent]);
    grade_cells_apply($pdo,1,'grades','grade-parent-version',$parentNow['calendar_context'],[gradeCellChange($parentNow,0,$parentNow['cells'][0]['base']['value'])]);
    gradeCellFailure(fn()=>grade_cells_apply($pdo,1,'grades','grade-stale-child',$oldLeaf['calendar_context'],[gradeCellChange($oldLeaf,0,'one')]),'عدّل مستخدم آخر');
    $fresh=grade_cells_capture($pdo,1,'grades',[$a,$parent]);
    gradeCellFailure(fn()=>grade_cells_apply($pdo,1,'grades','grade-overlap-request',$fresh['calendar_context'],[gradeCellChange($fresh,0,'one'),gradeCellChange($fresh,1,new stdClass())]),'متداخلة');
    $before=gradeCellRaw($pdo,1);$fresh=grade_cells_capture($pdo,1,'grades',[$a]);$pdo->exec('UPDATE semesters SET is_active=0 WHERE id=1');$pdo->exec('UPDATE semesters SET is_active=1 WHERE id=2');
    gradeCellFailure(fn()=>grade_cells_apply($pdo,1,'grades','grade-old-tab',$fresh['calendar_context'],[gradeCellChange($fresh,0,'two')]),'تغيّر سياق الفصل');
    $known=grade_cells_apply($pdo,1,'grades','grade-first-operation',$capture['calendar_context'],[$changeA]);
    check($known['replayed']&&gradeCellRaw($pdo,1)===$before,'a semester change rejects new writes from an old tab while a known receipt remains read-only and all native history stays visible');
    $pdo->exec('UPDATE semesters SET is_active=0 WHERE id=2');$pdo->exec('UPDATE semesters SET is_active=1 WHERE id=1');
    $science=json_decode('{"configs":{"7":{"keep":"teacher-settings"}},"data":{"7":{"S":{"1":{"sun":{"hifz":"7","rabt":"0","unknown":null}}}}},"overrides":{}}',false);
    app_state_upsert($pdo,'scientific_grades',$science,app_state_tenant_enabled($pdo)?1:null);
    $s=grade_cells_capture($pdo,1,'scientific_grades',[['data','7','S','1','sun','hifz'],['overrides','7','S','1','sun','hifz']]);
    grade_cells_apply($pdo,1,'scientific_grades','grade-science-atomic',$s['calendar_context'],[gradeCellChange($s,0,'0'),gradeCellChange($s,1,true)]);
    $stored=json_decode(gradeCellRaw($pdo,1,'scientific_grades'),false);
    check($stored->data->{'7'}->S->{'1'}->sun->hifz==='0'&&$stored->overrides->{'7'}->S->{'1'}->sun->hifz===true&&$stored->data->{'7'}->S->{'1'}->sun->rabt==='0'&&$stored->configs->{'7'}->keep==='teacher-settings','manual scientific zero and override share one transaction without recalculating other scores or settings');
    $many=new stdClass();for($i=0;$i<651;$i++)$many->{'fixture-'.$i}=(object)['zero'=>0,'unknown'=>null];app_state_upsert($pdo,'weekly_tests',$many,app_state_tenant_enabled($pdo)?1:null);
    $manyBase=grade_cells_capture($pdo,1,'weekly_tests',[['fixture-650','zero']]);grade_cells_apply($pdo,1,'weekly_tests','grade-many-records',$manyBase['calendar_context'],[gradeCellChange($manyBase,0,1)]);
    $many=json_decode(gradeCellRaw($pdo,1,'weekly_tests'),false);check(count(get_object_vars($many))===651&&$many->{'fixture-0'}->zero===0&&$many->{'fixture-650'}->zero===1,'all 651 stored records remain; targeted editing has no 500-item data cap');
    check(!str_contains(gradeCellRaw($pdo,1),'semester_id'),'calendar fencing never stamps historical grade values with a guessed semester');
}
