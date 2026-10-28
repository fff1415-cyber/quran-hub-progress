<?php
declare(strict_types=1);
require __DIR__.'/backend-sard-regression.php';
foreach(['active','frozen'] as $status){
 $pdo=seed();$GLOBALS['auth']['role']='supervisor';$GLOBALS['input']=['student_id'=>'student-1','plan_id'=>'current','only_if_unassigned'=>true];
 $pdo->prepare('UPDATE student_plan_assignments SET status=?')->execute([$status]);
 expectFailure(fn()=>handle_assign_plan(),'لم يُستبدل التعيين');
 check((int)$pdo->query('SELECT COUNT(*) FROM student_plan_assignments')->fetchColumn()===1,'import retains existing '.$status.' assignment');
 check((int)$pdo->query('SELECT COUNT(*) FROM segment_completions')->fetchColumn()===2,'import does not rebind or erase historical completions');
}
$pdo=seed();$GLOBALS['auth']['role']='secretary';$GLOBALS['input']=['student_id'=>'student-1','plan_id'=>'current','only_if_unassigned'=>true];expectFailure(fn()=>handle_assign_plan(),'Forbidden');
$pdo=seed();$GLOBALS['auth']['role']='supervisor';$pdo->exec("UPDATE student_plan_assignments SET status='transferred'");$GLOBALS['input']=['student_id'=>'student-1','plan_id'=>'current','only_if_unassigned'=>true];
handle_assign_plan();check((int)$pdo->query("SELECT COUNT(*) FROM student_plan_assignments WHERE status='active'")->fetchColumn()===1,'initial linking with preserved old history remains supported');
expectFailure(fn()=>handle_assign_plan(),'لم يُستبدل التعيين');check((int)$pdo->query('SELECT COUNT(*) FROM student_plan_assignments')->fetchColumn()===2,'retry after lost response cannot create another assignment');
// The existing app-state route receives the complete history without any new protocol.
$records=[];for($i=0;$i<651;$i++)$records[]=['id'=>'fixture-'.$i,'percent'=>0,'unknown_source'=>null];
$GLOBALS['auth']=['role'=>'manager','complexId'=>1];$GLOBALS['input']=['key'=>'academic_records','value'=>$records];handle_set_app_state();
$s=$pdo->query("SELECT value FROM app_state WHERE `key`='academic_records'");check(json_decode($s->fetchColumn(),true)===$records,'existing backend format retains all 651 history rows unchanged');
$GLOBALS['input']['value']=array_slice($records,0,500);expectFailure(fn()=>handle_set_app_state(),'الطلب مختصر');
$s=$pdo->query("SELECT value FROM app_state WHERE `key`='academic_records'");check(json_decode($s->fetchColumn(),true)===$records,'old 500-item tab cannot truncate the retained history');
$GLOBALS['input']['value']=array_merge(array_slice($records,0,650),[['id'=>'new-fixture','percent'=>0]]);expectFailure(fn()=>handle_set_app_state(),'الطلب مختصر');
$s=$pdo->query("SELECT value FROM app_state WHERE `key`='academic_records'");check(json_decode($s->fetchColumn(),true)===$records,'same-size stale snapshot cannot omit a different saved row');
$pdo->exec("UPDATE app_state SET value='unparseable historical fixture' WHERE `key`='academic_records'");
$GLOBALS['input']['value']=$records;expectFailure(fn()=>handle_set_app_state(),'بصيغة تحتاج مراجعة');
check($pdo->query("SELECT value FROM app_state WHERE `key`='academic_records'")->fetchColumn()==='unparseable historical fixture','unexpected original history remains untouched for review');
