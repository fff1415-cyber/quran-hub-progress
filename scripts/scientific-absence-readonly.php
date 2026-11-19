<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit(1);
try{
 $root=$argv[1]??'';
 if(!preg_match('~^/home/[A-Za-z0-9_-]+/domains/msht\.io/public_html$~D',$root)||realpath($root)!==$root||trim(file_get_contents($root.'/deploy-sha.txt'))!=='67d0b73f3317d835c001f70ea1530d93e5bed899')throw new RuntimeException('scope');
 require $root.'/api/config.php';require $root.'/api/auth.php';require $root.'/api/lib/grade-cell-operations.php';
 if(DB_NAME!=='u112851217_msht_io')throw new RuntimeException('database_scope');
 $pdo=new PDO('mysql:host='.DB_HOST.';dbname='.DB_NAME.';charset=utf8mb4',DB_USER,DB_PASS,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::MYSQL_ATTR_MULTI_STATEMENTS=>false]);
 $pdo->exec('SET SESSION MAX_STATEMENT_TIME=15');$pdo->exec('SET SESSION TRANSACTION READ ONLY');$pdo->beginTransaction();
 $q=$pdo->query("SELECT id FROM complexes WHERE subdomain='mm'");$cid=(int)$q->fetchColumn();if($cid!==22)throw new RuntimeException('complex_scope');
 $q=$pdo->prepare("SELECT value FROM app_state WHERE complex_id=? AND `key`='grades'");$q->execute([$cid]);$store=json_decode($q->fetchColumn(),false,512,JSON_THROW_ON_ERROR);
 $q=$pdo->prepare('SELECT id,halaqa_id FROM students WHERE complex_id=?');$q->execute([$cid]);$roster=[];foreach($q as $s)$roster[$s['id']]=(int)$s['halaqa_id'];
 $q=$pdo->prepare('SELECT id,name FROM halaqat WHERE complex_id=?');$q->execute([$cid]);$halaqat=[];foreach($q as $h)$halaqat[$h['id']]=$h['name'];
 $q=$pdo->prepare('SELECT id,start_date,weeks_count FROM semesters WHERE complex_id=? AND is_active=1');$q->execute([$cid]);$term=$q->fetch();
 $now=new DateTimeImmutable('now',new DateTimeZone('Asia/Riyadh'));$start=new DateTimeImmutable($term['start_date'],new DateTimeZone('Asia/Riyadh'));$start=$start->modify('-'.(int)$start->format('w').' days');$week=max(1,min((int)$term['weeks_count'],intdiv((int)$start->diff($now)->days,7)+1));$day=['sun','mon','tue','wed','thu','fri','sat'][(int)$now->format('w')];
 $daily=[];foreach($roster as $id=>$h)foreach($store->{$id}??new stdClass() as $w=>$record)foreach($record->days??new stdClass() as $d=>$entry){$status=$entry->attendance??'';if(!in_array($status,['absent','late'],true))continue;$key=$w.':'.$d.':'.$h;$daily[$key]??=['week'=>(int)$w,'day'=>$d,'halaqa'=>$halaqat[$h]??(string)$h,'absent'=>0,'late'=>0];$daily[$key][$status==='absent'?'absent':'late']++;}
 $q=$pdo->prepare("SELECT path_json,updated_at FROM grade_cell_versions WHERE context_id=? AND store_key='grades' AND direct_version IS NOT NULL AND JSON_UNQUOTE(JSON_EXTRACT(path_json,'$[4]'))='attendance' ORDER BY updated_at DESC LIMIT 40");$q->execute([$cid]);$recent=[];foreach($q as $v){$p=json_decode($v['path_json'],true);$status=$store->{$p[0]}->{$p[1]}->days->{$p[3]}->attendance??'';if(!in_array($status,['absent','late'],true))continue;$h=$roster[$p[0]]??null;$recent[]=['week'=>$p[1],'day'=>$p[3],'halaqa'=>$halaqat[$h]??null,'status'=>$status,'saved_at_utc'=>$v['updated_at']];}
  $q=$pdo->prepare("SELECT `key`,value FROM app_state WHERE complex_id=25 AND `key` IN ('halaqa_programs','halaqa_program_grades','scientific_grades')");$q->execute();$programStores=[];foreach($q as $r)$programStores[$r['key']]=json_decode($r['value'],true,512,JSON_THROW_ON_ERROR)??[];
 $q=$pdo->query('SELECT id,name FROM halaqat WHERE complex_id=25 ORDER BY id');$m6Halaqat=$q->fetchAll();$programReport=[];
 foreach($m6Halaqat as $h){
  $g=(string)$h['id'];$defs=$programStores['halaqa_programs'][$g]??[];$byId=[];foreach($defs as $p)$byId[$p['id']]=$p;
  $cfg=$programStores['scientific_grades']['configs'][$g]??null;$scientific=['config_exists'=>$cfg!==null,'fields'=>$cfg['fields']??[],'defaultScores'=>$cfg['defaultScores']??[]];
  $counts=['saved_nonempty'=>0,'recognized'=>0,'unknown_program'=>0,'inactive_program'=>0,'scientific_legacy'=>0,'unknown_level'=>0,'unknown_slot'=>0];$weekly=[];$definitions=[];
  foreach($defs as $p)if(($p['kind']??'')!=='scientific'&&$p['id']!=='scientific-grades-auto')$definitions[]=['name'=>$p['name']??'','active'=>$p['active']??true,'scheduleMode'=>$p['scheduleMode']??null,'levels'=>$p['levels']??[],'options'=>$p['options']??[]];
  foreach($programStores['halaqa_program_grades'][$g]??[] as $student=>$weeks)foreach($weeks as $w=>$programs)foreach($programs as $pid=>$slots)foreach($slots as $slot=>$value){
   if(!is_string($value)||$value==='')continue;$counts['saved_nonempty']++;$p=$byId[$pid]??null;
   if(!$p){$counts['unknown_program']++;continue;}
   if(($p['kind']??'')==='scientific'||$pid==='scientific-grades-auto'){$counts['scientific_legacy']++;continue;}
   if(($p['active']??true)===false){$counts['inactive_program']++;continue;}
   $levels=$p['levels']??[];if(!$levels){$options=$p['options']??[];$max=$p['maxScore']??100;foreach($options as $i=>$label)$levels[]=['label'=>$label,'score'=>count($options)===1?$max:round($max*(1-$i/max(1,count($options)-1)))];if(!$levels)$levels=[['label'=>'ممتاز','score'=>100],['label'=>'جيد','score'=>75],['label'=>'ضعيف','score'=>50]];}
   $scores=[];foreach($levels as $level)$scores[trim($level['label'])]=max(0,(float)$level['score']);
   if(!array_key_exists($value,$scores)){$counts['unknown_level']++;continue;}
   $allowed=($p['scheduleMode']??'')==='weekdays'?($p['weekdays']??[]):array_map(fn($i)=>'slot-'.$i,range(0,max(1,min(7,(int)($p['timesPerWeek']??1)))-1));
   if(!in_array($slot,$allowed,true)){$counts['unknown_slot']++;continue;}
   $counts['recognized']++;$weekly[$w][$student]=($weekly[$w][$student]??0)+$scores[$value];
  }
  $totals=[];foreach($weekly as $w=>$studentsInWeek)$totals[]=['week'=>(int)$w,'students'=>count($studentsInWeek),'min'=>min($studentsInWeek),'max'=>max($studentsInWeek),'total'=>array_sum($studentsInWeek)];
  $programReport[]=['halaqa'=>$h['name'],'id'=>$h['id'],'scientific'=>$scientific,'standard_definitions'=>$definitions,'standard_grade_counts'=>$counts,'standard_weekly_totals'=>$totals];
 }

 $q=$pdo->prepare("SELECT id,role FROM role_accounts WHERE complex_id=? AND role='secretary' LIMIT 1");$q->execute([$cid]);$account=$q->fetch();$pdo->rollBack();
 $http=[];
 if($account){
  // Short-lived diagnostic credential for an existing role; never logged or stored.
  $token=generate_token(['role'=>$account['role'],'accountId'=>$account['id'],'complexId'=>$cid,'exp'=>time()*1000+120000]);
  foreach(['/semesters/active','/app-state?key=grades&grade_protocol=1'] as $route){
   $url='https://msht.io/api/r.php?path='.rawurlencode($route);$curl=curl_init($url);curl_setopt_array($curl,[CURLOPT_HTTPHEADER=>['Authorization: Bearer '.$token,'Cache-Control: no-cache'],CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>8,CURLOPT_TIMEOUT=>20]);$body=curl_exec($curl);$code=curl_getinfo($curl,CURLINFO_HTTP_CODE);curl_close($curl);$response=is_string($body)?json_decode($body):null;
   $item=['path'=>$route,'status'=>$code,'error'=>$response->error??null];
   if(str_starts_with($route,'/app-state')){$item['context_complex_id']=$response->context_complex_id??null;$item['grades_match_database']=isset($response->value)&&grade_cells_json($response->value)===grade_cells_json($store);}
   else{$item['semester_matches_database']=($response->semester->id??null)===$term['id'];}
   $http[]=$item;
  }
 }
 echo json_encode(['release'=>trim(file_get_contents($root.'/deploy-sha.txt')),'read_only'=>true,'at_riyadh'=>$now->format('c'),'today'=>['week'=>$week,'day'=>$day],'secretary_account_exists'=>(bool)$account,'api'=>$http,'m6_program_report'=>$programReport,'all_recorded_week_days'=>array_values($daily),'current_week_absence'=>array_values(array_filter($daily,fn($r)=>$r['week']===$week)),'recent_confirmed_absence'=>$recent],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
}catch(Throwable $error){if(isset($pdo)&&$pdo->inTransaction())$pdo->rollBack();echo json_encode(['audit'=>'failed','class'=>get_class($error),'errno'=>$error instanceof PDOException?(int)($error->errorInfo[1]??0):null]);exit(1);}
