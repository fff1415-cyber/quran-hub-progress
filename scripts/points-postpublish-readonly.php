<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit(1);
try{
 $root=$argv[1]??'';
 if(!preg_match('~^/home/[A-Za-z0-9_-]+/domains/msht\.io/public_html$~D',$root)||realpath($root)!==$root||trim(file_get_contents($root.'/deploy-sha.txt'))!=='0e9d6e265d24b7468205d133cc344c35a16f4fd2')throw new RuntimeException('scope');
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
 if(!$account)throw new RuntimeException('secretary_account_missing');foreach($http as $check){if($check['status']!==200||isset($check['context_complex_id'])&&$check['context_complex_id']!==$cid||isset($check['semester_matches_database'])&&!$check['semester_matches_database'])throw new RuntimeException('live_read_failed');}
 echo json_encode(['release'=>trim(file_get_contents($root.'/deploy-sha.txt')),'read_only'=>true,'at_riyadh'=>$now->format('c'),'today'=>['week'=>$week,'day'=>$day],'secretary_account_exists'=>(bool)$account,'api'=>$http,'current_week_absence'=>array_values(array_filter($daily,fn($r)=>$r['week']===$week)),'recent_confirmed_absence'=>$recent],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
}catch(Throwable $error){if(isset($pdo)&&$pdo->inTransaction())$pdo->rollBack();echo json_encode(['audit'=>'failed','class'=>get_class($error),'errno'=>$error instanceof PDOException?(int)($error->errorInfo[1]??0):null]);exit(1);}
