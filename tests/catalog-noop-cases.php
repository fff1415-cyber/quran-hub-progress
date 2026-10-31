<?php
declare(strict_types=1);
function catalogSnapshot(PDO $pdo): array {
 $snapshot=[];
 foreach(['education_plans','plan_segments','student_plan_assignments','segment_completions','app_state'] as $table)
  $snapshot[$table]=$pdo->query("SELECT * FROM $table ORDER BY ".($table==='app_state'?'complex_id, `key`':'id'))->fetchAll();
 return $snapshot;
}
function catalogNoopPayload(): array {
 return ['plans'=>[['track'=>'gold','level_number'=>88721,'title'=>'  خطة ثابتة  ','segments'=>[
  ['segment_index'=>3,'hifz_plan'=>' ج ','rabt_plan'=>'ر3','muraja_plan'=>'م3'],
  ['segment_index'=>1,'hifz_plan'=>'أ','rabt_plan'=>'ر1','muraja_plan'=>'م1'],
 ]]]];
}
function catalogDeleteTrap(PDO $pdo,bool $enabled):void {
 $pdo->exec('DROP TRIGGER IF EXISTS audit_catalog_no_delete');
 if(!$enabled)return;
 $pdo->exec($pdo->getAttribute(PDO::ATTR_DRIVER_NAME)==='sqlite'
  ?"CREATE TRIGGER audit_catalog_no_delete BEFORE DELETE ON plan_segments BEGIN SELECT RAISE(ABORT,'catalog no-op attempted delete'); END"
  :"CREATE TRIGGER audit_catalog_no_delete BEFORE DELETE ON plan_segments FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='catalog no-op attempted delete'");
}
function catalogSeed(PDO $pdo): void {
 $pdo->exec("INSERT INTO education_plans(id,complex_id,track,level_number,title,segment_count,created_at) VALUES('catalog-noop-P',1,'gold',88721,'خطة ثابتة',2,'2026-01-01 00:00:00');
 INSERT INTO plan_segments(id,plan_id,segment_index,hifz_plan,rabt_plan,muraja_plan,created_at) VALUES('catalog-noop-seg1','catalog-noop-P',1,'أ','ر1','م1','2026-01-01 00:00:00'),('catalog-noop-seg3','catalog-noop-P',3,'ج','ر3','م3','2026-01-01 00:00:00');
 INSERT INTO student_plan_assignments(id,student_id,plan_id,status,start_segment_index) VALUES('catalog-noop-old','catalog-noop-S','catalog-noop-P','transferred',1),('catalog-noop-current','catalog-noop-S','catalog-noop-P','active',3);
 INSERT INTO segment_completions(id,student_id,plan_id,assignment_id,segment_index,task_type,completed_at) VALUES('catalog-noop-unbound','catalog-noop-S','catalog-noop-P',NULL,1,'hifz','2026-01-02'),('catalog-noop-exact','catalog-noop-S','catalog-noop-P','catalog-noop-old',3,'hifz','2026-01-03');
 INSERT INTO app_state(complex_id,`key`,value) VALUES(1,'catalog_noop_fixture','{\"S\":{\"1\":{\"sun\":{\"hifz\":\"0\",\"unknownOriginal\":null}}}}');");
}
function catalogNoopCases(PDO $pdo):void {
 catalogSeed($pdo);$GLOBALS['auth']=['role'=>'supervisor','complexId'=>1,'name'=>'fixture'];
 $GLOBALS['input']=catalogNoopPayload();$before=catalogSnapshot($pdo);catalogDeleteTrap($pdo,true);
 handle_import_plans();check(catalogSnapshot($pdo)===$before,'same catalog import preserves every row, stable ID, timestamp, unknown grade field and unbound/exact completion');
 check($GLOBALS['response']['plans_imported']===1&&$GLOBALS['response']['segments_imported']===2,'same-content upload confirms the existing response counts');
 handle_import_plans();check(catalogSnapshot($pdo)===$before,'retry after a lost response is a non-destructive no-op');
 $GLOBALS['input']['plans'][0]['segments'][0]['hifz_plan']='changed';
 try{handle_import_plans();throw new RuntimeException('Changed content incorrectly skipped');}
 catch(Throwable $e){check(str_contains($e->getMessage(),'catalog no-op attempted delete'),'real content difference still reaches the original update path and surfaces its failure');}
 check(catalogSnapshot($pdo)===$before&&!$pdo->inTransaction(),'failed batch rolls back without changing any historical source');
 catalogDeleteTrap($pdo,false);
 foreach(['teacher','assistant','musammi','secretary','student','parent'] as $role){
  $GLOBALS['auth']['role']=$role;$GLOBALS['input']=catalogNoopPayload();
  try{handle_import_plans();throw new RuntimeException('import role broadened');}
  catch(Throwable $e){check($e->getCode()===403,'unchanged import authorization: '.$role);}
 }
 check(catalogSnapshot($pdo)===$before,'rejected roles never change the data');
 $GLOBALS['auth']['role']='supervisor';$new=catalogNoopPayload()['plans'][0];$new['level_number']=88722;$new['title']='New unused plan';$GLOBALS['input']=['plans'=>[$new]];
 handle_import_plans();check($GLOBALS['response']['plans_imported']===1,'creating an unused plan remains available');
 $plan=$pdo->query("SELECT id FROM education_plans WHERE level_number=88722")->fetchColumn();$new['segments'][0]['hifz_plan']='genuine unused edit';$GLOBALS['input']=['plans'=>[$new]];handle_import_plans();
 $st=$pdo->prepare('SELECT hifz_plan FROM plan_segments WHERE plan_id=? AND segment_index=3');$st->execute([$plan]);check($st->fetchColumn()==='genuine unused edit','editing genuinely changed unused content remains available');
 foreach(['student_plan_assignments','segment_completions','app_state'] as $table)check(catalogSnapshot($pdo)[$table]===$before[$table],'other legitimate catalog work retains '.$table);
}
