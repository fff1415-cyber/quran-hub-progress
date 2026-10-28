<?php
declare(strict_types=1);
require __DIR__.'/backend-sard-regression.php';
$pdo=seed();
$pdo->exec("CREATE TABLE semesters(id TEXT PRIMARY KEY, complex_id INTEGER, is_active INTEGER); INSERT INTO semesters VALUES('term-A',1,1),('term-B',1,0)");
app_state_upsert($pdo,'grades',['legacy-student'=>['1'=>['days'=>['sun'=>['hifz'=>'one']]]]],1);
function patchState(PDO $pdo,string $key,string $id,array $changes,?string $semester='term-A'): array {
    return app_state_patch_integrity($pdo,1,$key,['protocol'=>1,'operation_id'=>$id,'semester_id'=>$semester,'changes'=>$changes]);
}
function change(array $path,mixed $next,mixed $base=null,bool $present=false): array {return ['path'=>$path,'base'=>$present?['present'=>true,'value'=>$base]:['present'=>false],'next'=>['present'=>true,'value'=>$next]];}
$a=change(['S','1','days','sun','hifz'],'one');$b=change(['S','1','days','sun','attendance'],'present');
patchState($pdo,'grades','client-A-0001',[$a]);$result=patchState($pdo,'grades','client-B-0001',[$b]);
check($result['value']['S'][1]['days']['sun']===['hifz'=>'one','attendance'=>'present'],'different cells from stale clients both survive');
expectFailure(fn()=>patchState($pdo,'grades','stale-cell-001',[change(['S','1','days','sun','hifz'],'two')]),'تعارض تعديل الخلية');
patchState($pdo,'grades','clear-cell-001',[change(['S','1','days','sun','hifz'],'','one',true)]);
patchState($pdo,'grades','clear-cell-001',[change(['S','1','days','sun','hifz'],'','one',true)]);
expectFailure(fn()=>patchState($pdo,'grades','resurrect-0001',[change(['S','1','days','sun','hifz'],'two','one',true)]),'تعارض تعديل الخلية');
$row=$pdo->query("SELECT value FROM app_state WHERE `key`='grades'")->fetch();$raw=json_decode($row['value'],true);
check(isset($raw['legacy']['legacy-student'])&&!isset($raw['scopes']['term-A']['legacy-student']),'legacy grades retained without assigning a semester');
$pdo->exec("UPDATE semesters SET is_active=0; UPDATE semesters SET is_active=1 WHERE id='term-B'");
expectFailure(fn()=>patchState($pdo,'grades','old-tab-0001',[$b]),'تغيّر الفصل');
patchState($pdo,'grades','term-B-0001',[change(['S','1','days','sun','hifz'],'two')],'term-B');
$raw=json_decode($pdo->query("SELECT value FROM app_state WHERE `key`='grades'")->fetchColumn(),true);
check($raw['scopes']['term-A']['S'][1]['days']['sun']['hifz']===''&&$raw['scopes']['term-B']['S'][1]['days']['sun']['hifz']==='two','same week number stays separate across semesters');
$records=[];for($i=0;$i<650;$i++)$records[]=['id'=>'history-'.$i,'studentId'=>'S','result'=>'passed'];
app_state_upsert($pdo,'academic_records',$records,1);
$r=patchState($pdo,'academic_records','history-append-001',[change(['history-new'],['id'=>'history-new','studentId'=>'S'])],null);
check(count($r['value'])===651,'history beyond 500 remains after append');
patchState($pdo,'notifications','transfer-create-001',[change(['N'],['id'=>'N','targetRole'=>'supervisor','transferStatus'=>'pending'])],null);
$r=patchState($pdo,'notifications','transfer-action-001',[change(['N','transferStatus'],'closed','pending',true),change(['N','actions'],[['text'=>'reviewed']])],null);
check($r['value'][0]['targetRole']==='supervisor'&&$r['value'][0]['transferStatus']==='closed','shared transfer keeps target and action across clients');
echo "PASS: state CAS, explicit clear, semester cutoff, unverified legacy, durable history and transfers\n";
