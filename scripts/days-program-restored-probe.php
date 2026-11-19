<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
try {
 $home=$argv[1]??'';
 if(!preg_match('~^/home/[A-Za-z0-9_-]+$~D',$home))throw new RuntimeException('scope');
 $file=$home.'/.qhp-private/msht-test.php';
 if(realpath($file)!==$file||is_link($file)||(fileperms($file)&0077))throw new RuntimeException('permissions');
 $config=qhp_load_private_test_config(file_get_contents($file));
 if($config['database']!=='u112851217_msht_test')throw new RuntimeException('identity');
 $pdo=new PDO('mysql:host='.$config['host'].';dbname='.$config['database'].';charset=utf8mb4',$config['user'],$config['password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
 if($pdo->query('SELECT DATABASE()')->fetchColumn()!==$config['database'])throw new RuntimeException('database');
 $pdo->exec('SET TRANSACTION READ ONLY');$pdo->beginTransaction();
 $cases=[];
 foreach($pdo->query("SELECT complex_id,value FROM app_state WHERE `key`='grades'") as $record){
  $cid=(int)$record['complex_id'];$grades=json_decode($record['value'],true,512,JSON_THROW_ON_ERROR)??[];
  $query=$pdo->prepare('SELECT id FROM students WHERE complex_id=?');$query->execute([$cid]);$students=$query->fetchAll(PDO::FETCH_ASSOC);
  $counts=[];
  foreach($students as $student)foreach($grades[$student['id']]??[] as $week=>$entry){
   foreach($entry['days']??[] as $day=>$value){$status=$value['attendance']??'';
    if($status==='absent'||$status==='late'){$key=$week.':'.$day;$counts[$key]=($counts[$key]??0)+1;}
   }
  }
  $programFixture=null;
  if($cid===25){$extra=[];$q=$pdo->query("SELECT `key`,value FROM app_state WHERE complex_id=25 AND `key` IN ('halaqa_programs','halaqa_program_grades')");foreach($q as $row)$extra[$row['key']]=json_decode($row['value'],true,512,JSON_THROW_ON_ERROR)??[];$programFixture=$extra;}
  $cases[]=['students'=>$students,'grades'=>$grades,'counts'=>$counts,'programs'=>$programFixture];
 }
 $pdo->rollBack();echo json_encode($cases,JSON_THROW_ON_ERROR);
}catch(Throwable $e){if(isset($pdo)&&$pdo->inTransaction())$pdo->rollBack();fwrite(STDERR,'Isolated attendance read failed');exit(1);}
