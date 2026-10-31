<?php
declare(strict_types=1);
// Literal DSN allowlists, fake fixture credentials, and disposable services only.
require __DIR__.'/backend-independent-mysql.php';
const RESTORE_DSN='mysql:host=127.0.0.1;port=3308;dbname=audit_restore;charset=utf8mb4';
if(getenv('AUDIT_RESTORE_DSN')!==RESTORE_DSN)throw new RuntimeException('Isolated restore DSN required');
$restore=new PDO(RESTORE_DSN,'audit','audit_only',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
function foundationTables(PDO $pdo):array{return $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);}
function foundationRows(PDO $pdo,string $table):array {
 $rows=$pdo->query("SELECT * FROM `$table`")->fetchAll();usort($rows,fn($a,$b)=>strcmp(serialize($a),serialize($b)));return $rows;
}
function foundationFingerprint(PDO $pdo,array $tables):array {
 $out=[];sort($tables);
 foreach($tables as $table){$create=$pdo->query("SHOW CREATE TABLE `$table`")->fetch(PDO::FETCH_NUM)[1];$rows=foundationRows($pdo,$table);$out[$table]=['schema'=>hash('sha256',$create),'rows'=>count($rows),'data'=>hash('sha256',serialize($rows))];}
 return $out;
}
function foundationDump(PDO $pdo):string {
 $sql='';
 foreach(foundationTables($pdo) as $table){
  $sql.=$pdo->query("SHOW CREATE TABLE `$table`")->fetch(PDO::FETCH_NUM)[1].";\n";
  foreach(foundationRows($pdo,$table) as $row){
   $columns=implode(',',array_map(fn($c)=>"`$c`",array_keys($row)));
   $values=implode(',',array_map(fn($v)=>$v===null?'NULL':$pdo->quote((string)$v),array_values($row)));
   $sql.="INSERT INTO `$table` ($columns) VALUES ($values);\n";
  }
 }
 return $sql;
}
function foundationRestore(PDO $pdo,string $dump,array $expected):void {
 // These session settings and drops occur ONLY in the separately allowlisted disposable restore DB.
 $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
 foreach(foundationTables($pdo) as $table)$pdo->exec("DROP TABLE `$table`");
 $pdo->exec($dump);$pdo->exec('SET FOREIGN_KEY_CHECKS=1');
 $constraints=$pdo->query("SELECT TABLE_NAME,CONSTRAINT_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION")->fetchAll();
 $groups=[];foreach($constraints as $c)$groups[$c['TABLE_NAME'].':'.$c['CONSTRAINT_NAME']][]=$c;
 foreach($groups as $columns){
  $first=$columns[0];$join=[];$nonnull=[];
  foreach($columns as $c){$join[]="c.`".$c['COLUMN_NAME']."`=p.`".$c['REFERENCED_COLUMN_NAME']."`";$nonnull[]="c.`".$c['COLUMN_NAME']."` IS NOT NULL";}
  $sql="SELECT COUNT(*) FROM `".$first['TABLE_NAME']."` c LEFT JOIN `".$first['REFERENCED_TABLE_NAME']."` p ON ".implode(' AND ',$join)." WHERE ".implode(' AND ',$nonnull)." AND p.`".$first['REFERENCED_COLUMN_NAME']."` IS NULL";
  check((int)$pdo->query($sql)->fetchColumn()===0,'restored FK validates: '.$first['CONSTRAINT_NAME']);
 }
 $actual=foundationFingerprint($pdo,array_keys($expected));
 foreach($expected as $table=>$value)if($actual[$table]!==$value)echo 'RESTORE MISMATCH '.json_encode(['table'=>$table,'schema_equal'=>$actual[$table]['schema']===$value['schema'],'row_count_equal'=>$actual[$table]['rows']===$value['rows'],'data_equal'=>$actual[$table]['data']===$value['data']])."\n";
 check($actual===$expected,'native backup restores identical definitions, exact values, zero, null, unknown fields and all rows');
}
$insert=$pdo->prepare("INSERT INTO segment_completions(id,student_id,plan_id,assignment_id,segment_index,task_type,completed_at) VALUES(?,?,'P',?,1,'hifz','2026-01-01')");
$pdo->beginTransaction();
for($i=0;$i<7737;$i++)$insert->execute(['foundation-legacy-'.$i,'legacy-fixture-'.$i,$i%2===0?null:'missing-fixture-source']);
$raw='{"S":{"1":{"sun":{"hifz":"0","rabt":"","missingOriginal":null,"futureField":{"exact":true}}}}}';
$state=$pdo->prepare('INSERT INTO app_state(complex_id,`key`,value) VALUES(?,?,?)');
foreach(['grades'=>6,'weekly_tests'=>2,'scientific_grades'=>4] as $key=>$count)for($i=0;$i<$count;$i++)$state->execute([100+$i,$key,$raw]);
$pdo->commit();
$oldTables=foundationTables($pdo);$before=foundationFingerprint($pdo,$oldTables);$beforeDump=foundationDump($pdo);
foundationRestore($restore,$beforeDump,$before);
$path=__DIR__.'/../database/proposed-progress-foundation.sql';$ddl=file_get_contents($path);$plain=preg_replace('/^--.*$/m','',$ddl);
$statements=array_values(array_filter(array_map('trim',explode(';',$plain))));
check(count($statements)===8,'proposal contains exactly eight explicit new-table statements');
$names=[];foreach($statements as $statement){check((bool)preg_match('/^CREATE TABLE IF NOT EXISTS ([a-z_]+) \\(/',$statement,$m),'only additive CREATE TABLE is allowed');$names[]=$m[1];}
check(array_intersect($names,$oldTables)===[],'no proposed table collides with an existing native source');
// Prove recovery after an interrupted DDL run. MySQL DDL is not transactional.
$pdo->exec($statements[0]);$pdo->exec($ddl);$pdo->exec($ddl);
check(foundationFingerprint($pdo,$oldTables)===$before,'partial DDL plus two runs leaves all 7,737 legacy fixture completions, native grades, assignments and current sources byte-identical');
foreach($names as $name)check((int)$pdo->query("SELECT COUNT(*) FROM `$name`")->fetchColumn()===0,'new table remains empty: '.$name);
$afterEmpty=foundationFingerprint($pdo,foundationTables($pdo));
$pdo->beginTransaction();
$pdo->exec("INSERT INTO plan_content_versions(id,plan_id,content_json,content_sha256,source_kind) VALUES('fixture-v1','P','{\"title\":\"new content\",\"segments\":[1,3],\"unknown\":null}','".hash('sha256','fixture-content')."','new_content');
 INSERT INTO plan_catalog_versions(plan_id,content_version_id) VALUES('P','fixture-v1');
 INSERT INTO plan_assignment_versions(assignment_id,student_id,plan_id,content_version_id) VALUES('fixture-future-A','fixture-future-S','P','fixture-v1');
 INSERT INTO plan_operation_receipts(context_id,operation_id,student_id,operation_kind,input_sha256,response_json) VALUES(1,'fixture-op1','fixture-future-S','complete','".str_repeat('a',64)."','{\"ok\":true}');
 INSERT INTO plan_completion_events(id,context_id,operation_id,assignment_id,student_id,plan_id,segment_index,task_type,event_kind,completed_at) VALUES('fixture-e1',1,'fixture-op1','fixture-future-A','fixture-future-S','P',3,'hifz','complete','2026-10-31');
 INSERT INTO plan_completion_heads(assignment_id,task_type,segment_index,current_event_id,is_completed) VALUES('fixture-future-A','hifz',3,'fixture-e1',1);
 INSERT INTO plan_operation_receipts(context_id,operation_id,student_id,operation_kind,input_sha256,response_json) VALUES(1,'fixture-op2','fixture-future-S','revoke','".str_repeat('b',64)."','{\"ok\":true}');
 INSERT INTO plan_completion_events(id,context_id,operation_id,assignment_id,student_id,plan_id,segment_index,task_type,event_kind,reverses_event_id) VALUES('fixture-e2',1,'fixture-op2','fixture-future-A','fixture-future-S','P',3,'hifz','revoke','fixture-e1');
 UPDATE plan_completion_heads SET current_event_id='fixture-e2',is_completed=0 WHERE assignment_id='fixture-future-A';
 INSERT INTO grade_cell_versions(context_id,store_key,path_sha256,path_json,direct_version,subtree_version) VALUES(1,'grades','".str_repeat('c',64)."','[\"S\",\"1\",\"days\",\"sun\",\"hifz\"]','fixture-grade-op','fixture-grade-op');
 INSERT INTO grade_operation_receipts(context_id,store_key,operation_id,input_sha256) VALUES(1,'grades','fixture-grade-op','".str_repeat('d',64)."');");
$pdo->commit();
check((int)$pdo->query("SELECT COUNT(*) FROM plan_completion_events WHERE assignment_id='fixture-future-A'")->fetchColumn()===2,'isolated future event/reversal schema retains both events');
try{$pdo->exec("DELETE FROM plan_content_versions WHERE id='fixture-v1'");throw new RuntimeException('referenced version deleted');}catch(PDOException $e){check($e->getCode()==='23000','referenced content cannot cascade-delete historical events or assignment version');}
$pdo->beginTransaction();try{$pdo->exec("INSERT INTO grade_operation_receipts(context_id,store_key,operation_id,input_sha256) VALUES(1,'grades','fixture-grade-op','".str_repeat('e',64)."')");throw new RuntimeException('duplicate receipt accepted');}catch(PDOException $e){$pdo->rollBack();check($e->getCode()==='23000','database uniqueness rejects repeated operation identity without overwriting its original hash');}
check(foundationFingerprint($pdo,$oldTables)===$before,'future-schema fixtures never alter or reassign any current work');
$after=foundationFingerprint($pdo,foundationTables($pdo));$afterDump=foundationDump($pdo);foundationRestore($restore,$afterDump,$after);
check(foundationFingerprint($pdo,$oldTables)===$before,'leaving additive tables in place is a data-preserving pre-activation rollback');
// Complete baseline suite already ran actual current handlers; this is DDL/constraint verification, not a claim of implemented future APIs.
$report=['engine'=>$pdo->getAttribute(PDO::ATTR_SERVER_VERSION),'proposal_sha256'=>hash('sha256',$ddl),'legacy_fixture_completions'=>7737,'unscoped_store_fixture_rows'=>12,'old_sources_unchanged'=>$before,'empty_new_tables_before_activation'=>$names,'before_backup_sha256'=>hash('sha256',$beforeDump),'future_fixture_backup_sha256'=>hash('sha256',$afterDump),'production_applied'=>false,'application_activated'=>false];
@mkdir(__DIR__.'/../dist/progress-foundation',0777,true);file_put_contents(__DIR__.'/../dist/progress-foundation/report.json',json_encode($report,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE));
echo "PASS: additive schema, interrupted/rerun DDL, native restore before/after, constraints and unchanged ordinary sources; no production action or backfill.\n";
