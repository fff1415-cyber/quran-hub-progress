<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
umask(0077);
$stage='scope';$credentials=null;
try {
    $root=realpath($argv[1]??'');$home=realpath($argv[2]??'');
    if(!$root||!$home||!str_starts_with($root.'/',$home.'/'))throw new RuntimeException('Invalid main scope');
    require $root.'/config.php';
    $fixture=getenv('QHP_BACKUP_FIXTURE')==='1' && DB_NAME==='audit_test' && DB_HOST==='127.0.0.1' && defined('DB_PORT') && DB_PORT===3307;
    if(DB_NAME!=='u112851217_msht_io'&&!$fixture)throw new RuntimeException('Unexpected source database');
    $stage='engine_check';
    $pdo=new PDO('mysql:host='.DB_HOST.(defined('DB_PORT')?';port='.DB_PORT:'').';dbname='.DB_NAME.';charset='.DB_CHARSET,DB_USER,DB_PASS,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
    $pdo->exec('SET TRANSACTION READ ONLY');$pdo->beginTransaction();
    $engines=$pdo->query("SELECT ENGINE FROM information_schema.tables WHERE table_schema=DATABASE() AND TABLE_TYPE='BASE TABLE'")->fetchAll(PDO::FETCH_COLUMN);
    $pdo->rollBack();
    if(!$engines||array_filter($engines,fn($engine)=>strtoupper((string)$engine)!=='INNODB'))throw new RuntimeException('Consistent transactional snapshot requires InnoDB tables');
    $stage='dump_tool';$binary=null;
    foreach(['/usr/bin/mariadb-dump','/usr/bin/mysqldump','/bin/mariadb-dump','/bin/mysqldump'] as $path)if(is_file($path)&&is_executable($path)){$binary=$path;break;}
    if(!$binary)throw new RuntimeException('Approved server dump binary unavailable');
    $stage='private_directory';
    $parent=$home.'/.qhp-db-backups';
    if(is_link($parent))throw new RuntimeException('Backup root must not be a symlink');
    if(!is_dir($parent)&&!mkdir($parent,0700))throw new RuntimeException('Cannot create private backup root');
    if((fileperms($parent)&0077)!==0||realpath($parent)!==$parent)throw new RuntimeException('Backup root must be private');
    $id=gmdate('Ymd\THis\Z').'-'.bin2hex(random_bytes(5));$directory=$parent.'/'.$id;
    if(!mkdir($directory,0700))throw new RuntimeException('Cannot create private snapshot directory');
    $credentials=$directory.'/.client.cnf';
    $quote=static fn(string $value):string=>'"'.strtr($value,["\\"=>"\\\\",'"'=>'\\"',"\n"=>'\\n',"\r"=>'\\r']).'"';
    $config="[client]\nhost=".$quote(DB_HOST)."\nuser=".$quote(DB_USER)."\npassword=".$quote(DB_PASS)."\ndefault-character-set=utf8mb4\n";
    if(defined('DB_PORT'))$config.='port='.(int)DB_PORT."\n";
    $handle=fopen($credentials,'x');if(!$handle)throw new RuntimeException('Cannot create private temporary credentials');
    fwrite($handle,$config);fclose($handle);unset($config);
    $archive=$directory.'/production.sql.gz';$errors=$directory.'/dump.stderr';
    $stage='consistent_dump';
    $process=proc_open([$binary,'--defaults-extra-file='.$credentials,'--single-transaction','--quick','--skip-lock-tables','--no-tablespaces','--hex-blob','--routines','--events','--triggers',DB_NAME],[0=>['pipe','r'],1=>['pipe','w'],2=>['file',$errors,'w']],$pipes);
    if(!is_resource($process))throw new RuntimeException('Cannot start private dump');
    fclose($pipes[0]);$gzip=gzopen($archive,'wb6');if(!$gzip)throw new RuntimeException('Cannot open private compressed snapshot');
    while(!feof($pipes[1])){$chunk=fread($pipes[1],1048576);if($chunk===false)throw new RuntimeException('Dump stream interrupted');if($chunk!==''&&gzwrite($gzip,$chunk)!==strlen($chunk))throw new RuntimeException('Backup storage incomplete');}
    fclose($pipes[1]);gzclose($gzip);$exit=proc_close($process);
    if($exit!==0)throw new RuntimeException('Dump command did not complete');
    unlink($credentials);$credentials=null;
    $stage='archive_integrity';
    $check=proc_open(['/usr/bin/gzip','-t',$archive],[0=>['file','/dev/null','r'],1=>['file','/dev/null','w'],2=>['file',$directory.'/integrity.stderr','w']],$unused);
    if(!is_resource($check)||proc_close($check)!==0)throw new RuntimeException('Compressed backup verification failed');
    $summary=['status'=>'backup_created','backup_id'=>$id,'created_at_utc'=>gmdate('c'),'compressed_bytes'=>filesize($archive),'sha256'=>hash_file('sha256',$archive),'table_count'=>count($engines),'gzip_integrity'=>'ok','consistent_snapshot'=>true,'private_server_storage'=>true,'production_record_writes'=>false,'restore_verified'=>false];
    file_put_contents($directory.'/manifest.json',json_encode($summary,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE)."\n",LOCK_EX);
    echo json_encode($summary,JSON_PRETTY_PRINT)."\n";
}catch(Throwable $error){
    if(isset($pdo)&&$pdo->inTransaction())$pdo->rollBack();
    if($credentials!==null&&is_file($credentials))unlink($credentials);
    echo json_encode(['status'=>'backup_incomplete','stage'=>$stage,'errno'=>$error instanceof PDOException?(int)($error->errorInfo[1]??0):null,'production_record_writes'=>false,'restore_verified'=>false])."\n";exit(1);
}
