<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit(1);
try{
 $root=$argv[1]??'';
 if(!preg_match('~^/home/[A-Za-z0-9_-]+/domains/msht\.io/public_html$~D',$root)||realpath($root)!==$root||trim(file_get_contents($root.'/deploy-sha.txt'))!=='67d0b73f3317d835c001f70ea1530d93e5bed899')throw new RuntimeException('scope');
 require $root.'/api/config.php';
 if(DB_NAME!=='u112851217_msht_io')throw new RuntimeException('database_scope');
 $pdo=new PDO('mysql:host='.DB_HOST.';dbname='.DB_NAME.';charset=utf8mb4',DB_USER,DB_PASS,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::MYSQL_ATTR_MULTI_STATEMENTS=>false]);
 $pdo->exec('SET SESSION MAX_STATEMENT_TIME=15');$pdo->exec('SET SESSION TRANSACTION READ ONLY');$pdo->beginTransaction();
 $complexes=$pdo->query('SELECT id,name,subdomain FROM complexes ORDER BY id')->fetchAll();
 $stores=[];foreach($pdo->query("SELECT complex_id,`key`,value FROM app_state WHERE `key` IN ('grades','scientific_grades')") as $r)$stores[$r['complex_id']][$r['key']]=json_decode($r['value'],true,512,JSON_THROW_ON_ERROR)??[];
 $students=[];foreach($pdo->query('SELECT id,complex_id,halaqa_id FROM students') as $s)$students[$s['complex_id']][$s['id']]=(string)$s['halaqa_id'];
 $terms=[];foreach($pdo->query('SELECT id,complex_id,start_date,weeks_count,working_days,excluded_dates,name FROM semesters WHERE is_active=1') as $s){$s['working_days']=json_decode($s['working_days'],true);$s['excluded_dates']=json_decode($s['excluded_dates']??'[]',true);$terms[$s['complex_id']][]=$s;}
 $versions=[];$q=$pdo->query("SELECT context_id,path_json,updated_at FROM grade_cell_versions WHERE store_key='grades' AND direct_version<>'' AND JSON_LENGTH(path_json)=5");foreach($q as $v){$p=json_decode($v['path_json'],true);$versions[$v['context_id']][json_encode($p)]=$v['updated_at'];}
 $receiptColumns=$pdo->query("SHOW COLUMNS FROM grade_operation_receipts")->fetchAll(PDO::FETCH_COLUMN);$dateColumn=in_array("applied_at",$receiptColumns,true)?"applied_at":(in_array("created_at",$receiptColumns,true)?"created_at":null);$latest=$dateColumn?"MAX($dateColumn)":"NULL";
 $receipts=[];foreach($pdo->query("SELECT context_id,COUNT(*) AS count,$latest AS latest FROM grade_operation_receipts WHERE store_key='grades' GROUP BY context_id") as $r)$receipts[$r['context_id']]=['count'=>(int)$r['count'],'latest'=>$r['latest']];
 $out=[];
 foreach($complexes as $c){
  $cid=(int)$c['id'];$prep=$stores[$cid]['grades']??[];$sci=$stores[$cid]['scientific_grades']??[];
  $summary=['complex'=>$c['name'],'slug'=>$c['subdomain'],'students'=>count($students[$cid]??[]),'active_terms'=>$terms[$cid]??[],'receipt'=>$receipts[$cid]??null,'configured_halaqat'=>count($sci['configs']??[]),'enabled_missing_default'=>[],'matched'=>0,'missing_projected'=>0,'missing_projected_versioned'=>0,'missing_versioned_dates'=>[],'different_pairs'=>[],'different_projected'=>0,'manual_overrides'=>0,'prep_without_numeric_default'=>0,'prep_without_enabled_field'=>0,'affected_halaqat'=>[],'absence_by_week_day'=>[]];
  foreach($sci['configs']??[] as $group=>$config)foreach(['hifz','rabt','muraja'] as $field)if(($config['fields'][$field]??false)===true&&!is_numeric($config['defaultScores'][$field]??null))$summary['enabled_missing_default'][]=['halaqa'=>$group,'field'=>$field];
  foreach($students[$cid]??[] as $id=>$group)foreach($prep[$id]??[] as $week=>$entry)foreach($entry['days']??[] as $day=>$d){
   if(in_array($d['attendance']??'', ['absent','late'],true)){$key=$week.':'.$day;$summary['absence_by_week_day'][$key]=($summary['absence_by_week_day'][$key]??0)+1;}
   foreach(['hifz','rabt','muraja'] as $field){
    $value=$d[$field]??null;if($field==='hifz'?!in_array($value,['half','one','two'],true):$value!=='pass')continue;
    if(($sci['configs'][$group]['fields'][$field]??false)!==true){$summary['prep_without_enabled_field']++;continue;}
    $default=$sci['configs'][$group]['defaultScores'][$field]??null;
    if(!is_numeric($default)){$summary['prep_without_numeric_default']++;continue;}
    if(($sci['overrides'][$group][$id][$week][$day][$field]??false)===true){$summary['manual_overrides']++;continue;}
    $score=$sci['data'][$group][$id][$week][$day][$field]??null;
    if($score===null||$score===''){$summary['missing_projected']++;if(isset($versions[$cid][json_encode([(string)$id,(string)$week,'days',(string)$day,$field])])){$summary['missing_projected_versioned']++;$vdate=substr($versions[$cid][json_encode([(string)$id,(string)$week,'days',(string)$day,$field])],0,10);$summary['missing_versioned_dates'][$vdate]=($summary['missing_versioned_dates'][$vdate]??0)+1;}$summary['affected_halaqat'][$group]=($summary['affected_halaqat'][$group]??0)+1;}
    elseif(is_numeric($score)&&(float)$score===(float)$default)$summary['matched']++;
    else {$summary['different_projected']++;$pair=(string)$score.'->'.(string)$default;$summary['different_pairs'][$pair]=($summary['different_pairs'][$pair]??0)+1;}
   }
  }
  $summary['config_by_halaqa']=[];foreach($sci['configs']??[] as $group=>$config)$summary['config_by_halaqa'][$group]=['fields'=>$config['fields']??[],'defaultScores'=>$config['defaultScores']??[]];
  $out[]=$summary;
 }
 $recent=[];$q=$pdo->query("SELECT context_id,path_json,updated_at FROM grade_cell_versions WHERE store_key='grades' AND direct_version IS NOT NULL AND updated_at>=CURRENT_TIMESTAMP-INTERVAL 2 DAY ORDER BY updated_at DESC LIMIT 120");
 foreach($q as $row){$path=json_decode($row['path_json'],true);if(count($path)!==5||$path[2]!=='days')continue;$cid=(int)$row['context_id'];$id=$path[0];$group=$students[$cid][$id]??null;$next=$stores[$cid]['grades'][$id][$path[1]]['days'][$path[3]][$path[4]]??null;$projected=$group===null?null:($stores[$cid]['scientific_grades']['data'][$group][$id][$path[1]][$path[3]][$path[4]]??null);
 $recent[]=['complex_id'=>$cid,'halaqa'=>$group,'week'=>$path[1],'day'=>$path[3],'field'=>$path[4],'value'=>is_scalar($next)?$next:null,'scientific'=>is_scalar($projected)?$projected:null,'changed_at'=>$row['updated_at']];}
 $halaqaNames=$pdo->query('SELECT complex_id,id,name FROM halaqat')->fetchAll();
 $serverNow=$pdo->query('SELECT CURRENT_TIMESTAMP')->fetchColumn();$pdo->rollBack();
 $logSummary=['readable_files'=>0,'atomic_failures'=>[]];
 foreach([$root.'/api/error_log',$root.'/error_log',$root.'/logs/error.log',dirname($root,3).'/.logs/php_errors.log'] as $file){
  if(!is_file($file)||!is_readable($file)||is_link($file))continue;$logSummary['readable_files']++;
  $f=fopen($file,'r');fseek($f,max(0,filesize($file)-131072));$tail=stream_get_contents($f);fclose($f);
  foreach(explode("\n",$tail) as $line){$at=strpos($line,'{"event":"qhp_failure"');if($at===false)continue;$event=json_decode(substr($line,$at),true);if(!is_array($event)||($event['context']??'')!=='atomic_grade_write')continue;$logSummary['atomic_failures'][]=array_intersect_key($event,array_flip(['reference','context','errno','category','file','line']));}
 }
 $logSummary['atomic_failures']=array_slice($logSummary['atomic_failures'],-15);
 echo json_encode(['release'=>trim(file_get_contents($root.'/deploy-sha.txt')),'read_only'=>true,'checked_at'=>gmdate('c'),'server_now'=>$serverNow,'recent_changes'=>$recent,'halaqat'=>$halaqaNames,'logs'=>$logSummary,'complexes'=>$out],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
}catch(Throwable $error){if(isset($pdo)&&$pdo->inTransaction())$pdo->rollBack();echo json_encode(['audit'=>'failed','class'=>get_class($error),'errno'=>$error instanceof PDOException?(int)($error->errorInfo[1]??0):null]);exit(1);}
