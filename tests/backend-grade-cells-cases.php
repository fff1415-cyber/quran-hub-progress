<?php
declare(strict_types=1);
function gradeFixtureStore(PDO $pdo): array{$s=$pdo->prepare('SELECT value FROM app_state WHERE complex_id=1 AND `key`=?');$s->execute(['grades']);return json_decode((string)$s->fetchColumn(),true)??[];}
function gradeFixtureOp(PDO $pdo,array $path,array $next,string $id): array{
 $meta=grade_cells_context($pdo,1);return ['protocol'=>'grade_cells_v1','operation_id'=>$id,'semester_id'=>$meta['semester_id'],'changes'=>[['path'=>$path,'base'=>grade_cell_value(gradeFixtureStore($pdo),$path),'next'=>$next,'tokens'=>grade_cell_tokens((array)$meta['versions'],$path)]]];
}
function gradeFixtureSave(array $op):void{$GLOBALS['input']=['key'=>'grades','value'=>$op];handle_set_app_state();}
function gradeFixtureFailure(callable $fn,int $status,string $label):void{try{$fn();}catch(Throwable $error){check($error->getCode()===$status,$label);return;}throw new RuntimeException('Expected rejection: '.$label);}
function runGradeCellCases(PDO $pdo):void{
 $GLOBALS['auth']=['role'=>'teacher','complexId'=>1,'name'=>'fixture'];
 $store=['S'=>[1=>['days'=>['sun'=>['hifz'=>'','rabt'=>'','attendance'=>'','custom'=>['zero'=>'0'],'unknownOriginal'=>null]],'testRabt'=>false]],'legacy-unclassified'=>[7=>['unknown'=>['raw'=>0,'missing'=>null]]]];
 app_state_upsert($pdo,'grades',$store,1);
 $a=gradeFixtureOp($pdo,['S','1','days','sun','hifz'],['present'=>true,'value'=>'one'],'grade-op-hifz');
 $b=gradeFixtureOp($pdo,['S','1','days','sun','rabt'],['present'=>true,'value'=>'pass'],'grade-op-rabt');
 gradeFixtureSave($a);gradeFixtureSave($b);
 check(gradeFixtureStore($pdo)['S'][1]['days']['sun']['hifz']==='one'&&gradeFixtureStore($pdo)['S'][1]['days']['sun']['rabt']==='pass','two clients changing different cells preserve both values');
 $confirmed=gradeFixtureStore($pdo);gradeFixtureSave($a);check(gradeFixtureStore($pdo)===$confirmed,'lost response retries the same cell version without another change');
 $bad=$a;$bad['operation_id']='grade-op-stale';$bad['changes'][0]['next']['value']='two';gradeFixtureFailure(fn()=>gradeFixtureSave($bad),409,'same-cell stale edit is an explicit conflict');
 $clear=gradeFixtureOp($pdo,['S','1','days','sun','hifz'],['present'=>false],'grade-op-clear');gradeFixtureSave($clear);
 $resurrect=$a;$resurrect['operation_id']='grade-op-resurrect';$resurrect['changes'][0]['base']=['present'=>false];gradeFixtureFailure(fn()=>gradeFixtureSave($resurrect),409,'tombstone revision blocks resurrection after explicit removal');
 $one=gradeFixtureOp($pdo,['S','1','days','sun','hifz'],['present'=>true,'value'=>'one'],'grade-op-again');gradeFixtureSave($one);
 $aba=$a;$aba['operation_id']='grade-op-aba';$aba['changes'][0]['base']=['present'=>true,'value'=>'one'];$aba['changes'][0]['next']['value']='two';gradeFixtureFailure(fn()=>gradeFixtureSave($aba),409,'returning to an equal value does not erase the intervening revision');
 $zero=gradeFixtureOp($pdo,['S','1','days','sun','custom','zero'],['present'=>true,'value'=>'1'],'grade-op-zero');$zero['changes'][0]['base']['value']=0;gradeFixtureFailure(fn()=>gradeFixtureSave($zero),409,'numeric zero and the string zero are not coerced into the same base');
 $multi=gradeFixtureOp($pdo,['S','1','days','sun','attendance'],['present'=>true,'value'=>'present'],'grade-op-multi');$multi['changes'][]=$bad['changes'][0];$before=gradeFixtureStore($pdo);gradeFixtureFailure(fn()=>gradeFixtureSave($multi),409,'a conflict rolls back the entire multi-cell operation');check(gradeFixtureStore($pdo)===$before,'first cell of a rejected operation is not partially saved');
 $GLOBALS['input']=['key'=>'grades','value'=>[]];gradeFixtureFailure(fn()=>handle_set_app_state(),409,'old whole-store and semester-reset writers cannot erase grades');
 check(gradeFixtureStore($pdo)['legacy-unclassified'][7]===$store['legacy-unclassified'][7],'unclassified old values remain native and are never assigned to a semester');
 $_GET=['key'=>'grades'];
 if($pdo->getAttribute(PDO::ATTR_DRIVER_NAME)==='mysql'){$pdo->exec('SET TRANSACTION READ ONLY');$pdo->beginTransaction();handle_list_app_state();$pdo->rollBack();}
 else{$pdo->exec('PRAGMA query_only=ON');handle_list_app_state();$pdo->exec('PRAGMA query_only=OFF');}
 check($GLOBALS['response'][0]['cell_sync']['version']===1&&$GLOBALS['response'][0]['context_complex_id']===1,'grade read confirms the context without an implicit write');
 $before=gradeFixtureStore($pdo);$old=kiosk_record_attendance($pdo,1,'S','1','sun',['sun','mon'],'present',null);check($old===''&&gradeFixtureStore($pdo)['S'][1]['days']['sun']['attendance']==='present','kiosk writes attendance under the same row/revision lock');
 check(gradeFixtureStore($pdo)['S'][1]['days']['sun']['hifz']==='one'&&gradeFixtureStore($pdo)['S'][1]['days']['sun']['custom']['zero']==='0','kiosk never overwrites unrelated grades or manual zero strings');
 $before=gradeFixtureStore($pdo);kiosk_record_attendance($pdo,1,'S','1','sun',['sun','mon'],'late',null);check(gradeFixtureStore($pdo)===$before,'repeated scan preserves the existing legitimate attendance policy');
 $pdo->exec('CREATE TABLE semesters(id INTEGER PRIMARY KEY,complex_id INTEGER,is_active INTEGER)');$pdo->exec('INSERT INTO semesters VALUES(1,1,1),(2,1,0)');
 $oldTerm=gradeFixtureOp($pdo,['S','1','days','sun','muraja'],['present'=>true,'value'=>'pass'],'grade-op-old-term');$pdo->exec('UPDATE semesters SET is_active=CASE WHEN id=2 THEN 1 ELSE 0 END');
 gradeFixtureFailure(fn()=>gradeFixtureSave($oldTerm),409,'an old tab cannot write after the active semester changes');
 check(gradeFixtureStore($pdo)===$before,'semester-context rejection preserves all original stored values');
 $GLOBALS['input']=['key'=>'__qhp_grade_cell_versions_v1','value'=>[]];gradeFixtureFailure(fn()=>handle_set_app_state(),400,'revision metadata cannot be overwritten through a direct generic save');
}
