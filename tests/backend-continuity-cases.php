<?php
declare(strict_types=1);
require_once __DIR__.'/continuity-sql-errors.php';
function continuityFailure(callable $action,string $message):void{try{$action();throw new LogicException('fixture expected a rejection');}catch(RuntimeException $error){check(str_contains($error->getMessage(),$message),'existing source preserved: '.$message);}}
function continuityCases(PDO $pdo):void{
 $GLOBALS['auth']=['role'=>'manager','complexId'=>1];
 $fixtures=['grades'=>['S'=>[1=>['days'=>['sun'=>['hifz'=>'one','compensationFaces'=>0,'unknown'=>null]]]]], 'weekly_tests'=>['S'=>[1=>['muraja'=>['pass','fail',''],'rabt'=>['pass']]]], 'scientific_grades'=>['configs'=>[],'data'=>['1'=>['S'=>[1=>['sun'=>['hifz'=>'0']]]]],'overrides'=>[]], 'tarbawi_program'=>['settingsBySemester'=>['A'=>['semesterId'=>'A']],'plans'=>['A:1'=>['status'=>'approved','items'=>[['executed'=>true]]]]]];
 foreach($fixtures as $key=>$value){
  app_state_upsert($pdo,$key,$value,1);$s=$pdo->prepare('SELECT value FROM app_state WHERE complex_id=? AND `key`=?');$s->execute([1,$key]);$raw=$s->fetchColumn();
  foreach([[],null,$key==='tarbawi_program'?['settingsBySemester'=>[],'plans'=>[]]:($key==='scientific_grades'?['configs'=>[],'data'=>[],'overrides'=>[]]:[])] as $empty){$GLOBALS['input']=['key'=>$key,'value'=>$empty];continuityFailure(fn()=>handle_set_app_state(),'سيصفّر');$s->execute([1,$key]);check($s->fetchColumn()===$raw,'old empty '.$key.' writer cannot replace exact stored bytes');}
  $GLOBALS['input']=['key'=>$key,'value'=>$value];handle_set_app_state();check($GLOBALS['response']['ok']===true,'normal unchanged '.$key.' save remains supported');
 }
 // Clearing one score is still a legitimate edit, including the final assessed field.
 $value=$fixtures['grades'];$value['S'][1]['days']['sun']['hifz']='';$GLOBALS['input']=['key'=>'grades','value'=>$value];handle_set_app_state();$s=$pdo->prepare("SELECT value FROM app_state WHERE complex_id=1 AND `key`='grades'");$s->execute();check(json_decode($s->fetchColumn(),true)===$value,'single-field blank edit retains zero, unknown fields, student and week identity');
 $GLOBALS['auth']['complexId']=2;$GLOBALS['input']=['key'=>'grades','value'=>[]];handle_set_app_state();check($GLOBALS['response']['ok']===true,'empty initialization in a separate existing complex does not clear complex one');
 $s->execute();check(json_decode($s->fetchColumn(),true)===$value,'existing complex predicate remains intact');
 $GLOBALS['auth']['complexId']=1;app_state_upsert($pdo,'scientific_grades',['future_unknown'=>null],1);$GLOBALS['input']=['key'=>'scientific_grades','value'=>['configs'=>[],'data'=>[],'overrides'=>[]]];continuityFailure(fn()=>handle_set_app_state(),'سيصفّر');
 $pdo->exec("UPDATE app_state SET value='unparseable fixture' WHERE complex_id=1 AND `key`='grades'");$GLOBALS['input']=['key'=>'grades','value'=>$fixtures['grades']];continuityFailure(fn()=>handle_set_app_state(),'صيغة تحتاج مراجعة');$s->execute();check($s->fetchColumn()==='unparseable fixture','unparseable originals are not silently overwritten');
 foreach(['test_member','test_chair'] as $role){$GLOBALS['auth']['role']=$role;$GLOBALS['input']=['key'=>'grades','value'=>$fixtures['grades']];continuityFailure(fn()=>handle_set_app_state(),'غير مصرح');}
}
