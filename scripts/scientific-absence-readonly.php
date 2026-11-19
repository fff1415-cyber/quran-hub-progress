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
 $versions=[];$q=$pdo->query("SELECT context_id,path_json FROM grade_cell_versions WHERE store_key='grades' AND direct_version<>'' AND JSON_LENGTH(path_json)=5");foreach($q as $v){$p=json_decode($v['path_json'],true);$versions[$v['context_id']][json_encode($p)]=true;}
 $receiptColumns=$pdo->query("SHOW COLUMNS FROM grade_operation_receipts")->fetchAll(PDO::FETCH_COLUMN);$dateColumn=in_array("applied_at",$receiptColumns,true)?"applied_at":(in_array("created_at",$receiptColumns,true)?"created_at":null);$latest=$dateColumn?"MAX($dateColumn)":"NULL";
 $receipts=[];foreach($pdo->query("SELECT context_id,COUNT(*) AS count,$latest AS latest FROM grade_operation_receipts WHERE store_key='grades' GROUP BY context_id") as $r)$receipts[$r['context_id']]=['count'=>(int)$r['count'],'latest'=>$r['latest']];
 $out=[];
 foreach($complexes as $c){
  $cid=(int)$c['id'];$prep=$stores[$cid]['grades']??[];$sci=$stores[$cid]['scientific_grades']??[];
  $summary=['complex'=>$c['name'],'slug'=>$c['subdomain'],'students'=>count($students[$cid]??[]),'active_terms'=>$terms[$cid]??[],'receipt'=>$receipts[$cid]??null,'configured_halaqat'=>count($sci['configs']??[]),'enabled_missing_default'=>[],'matched'=>0,'missing_projected'=>0,'missing_projected_versioned'=>0,'different_projected'=>0,'manual_overrides'=>0,'prep_without_numeric_default'=>0,'prep_without_enabled_field'=>0,'affected_halaqat'=>[],'absence_by_week_day'=>[]];
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
    if($score===null||$score===''){$summary['missing_projected']++;if(isset($versions[$cid][json_encode([(string)$id,(string)$week,'days',(string)$day,$field])]))$summary['missing_projected_versioned']++;$summary['affected_halaqat'][$group]=($summary['affected_halaqat'][$group]??0)+1;}
    elseif(is_numeric($score)&&(float)$score===(float)$default)$summary['matched']++;
    else $summary['different_projected']++;
   }
  }
  $out[]=$summary;
 }
 $pdo->rollBack();echo json_encode(['release'=>trim(file_get_contents($root.'/deploy-sha.txt')),'read_only'=>true,'checked_at'=>gmdate('c'),'complexes'=>$out],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
}catch(Throwable $error){if(isset($pdo)&&$pdo->inTransaction())$pdo->rollBack();echo json_encode(['audit'=>'failed','class'=>get_class($error),'errno'=>$error instanceof PDOException?(int)($error->errorInfo[1]??0):null]);exit(1);}
