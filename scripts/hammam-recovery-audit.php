<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
umask(0077);
const TABLES = ['complexes','halaqat','students','app_state','semesters','academic_weeks','education_plans',
    'student_plan_assignments','segment_completions','grade_cell_versions','grade_operation_receipts','role_accounts'];

function read_archive(string $file): array {
    $h = gzopen($file,'rb');
    if (!$h) throw new RuntimeException('archive_open');
    $tables = $columns = [];
    $table = null;
    $done = false;
    // Decode mysqldump literals in memory. No dump statement is executed.
    try {
        while (($line = gzgets($h)) !== false) {
            if (str_starts_with($line,'-- Dump completed')) $done = true;
            if (preg_match('/^CREATE TABLE `([a-z0-9_]+)` \(/i',$line,$m)) {
                $table = in_array($m[1],TABLES,true) ? $m[1] : null;
                if ($table) $tables[$table] = [];
                continue;
            }
            if ($table && preg_match('/^\s+`([a-z0-9_]+)` /i',$line,$m)) $columns[$table][] = $m[1];
            if (str_starts_with($line,') ENGINE=')) $table = null;
            if (!preg_match('/^INSERT INTO `([a-z0-9_]+)` VALUES\s*/i',$line,$m) || !in_array($m[1],TABLES,true)) continue;
            $name = $m[1];
            while (!str_ends_with(rtrim($line),';')) {
                $more = gzgets($h);
                if ($more===false) throw new RuntimeException('insert_incomplete_'.$name);
                $line .= $more;
            }
            $i = strlen($m[0]);
            do {
                $i += strspn($line," \r\n\t",$i);
                if (($line[$i++] ?? '') !== '(') throw new RuntimeException('tuple_open_'.$name);
                $row = [];
                do {
                    $i += strspn($line," \r\n\t",$i);
                    if (substr($line,$i,8)==="_binary'") $i+=7;
                    if (substr($line,$i,2)==="b'") $i++;
                    if (($line[$i]??'')==="'") {
                        $i++;
                        $v='';
                        while ($i<strlen($line)) {
                            $n=strcspn($line,"'\\",$i);
                            $v.=substr($line,$i,$n);
                            $i+=$n;
                            $end=$line[$i++]??'';
                            if ($end==="'") {
                                if (($line[$i]??'')==="'") {$v.="'";$i++;continue;}
                                break;
                            }
                            if ($end!=="\\" || $i>=strlen($line)) throw new RuntimeException('tuple_quote_'.$name);
                            $esc=$line[$i++];
                            $v.=['0'=>"\0",'n'=>"\n",'r'=>"\r",'t'=>"\t",'b'=>"\x08",'Z'=>"\x1a"][$esc]??$esc;
                        }
                    } else {
                        $length=strcspn($line,',)',$i);
                        $raw=trim(substr($line,$i,$length));$i+=$length;
                        if (!preg_match('/^(?:NULL|0x[0-9a-f]*|[-+]?[0-9]+(?:\.[0-9]+)?(?:e[-+]?[0-9]+)?)$/iD',$raw)) {
                            throw new RuntimeException('tuple_literal_'.$name);
                        }
                        $v = $raw==='NULL' ? null : (str_starts_with($raw,'0x') ? hex2bin(substr($raw,2)) : $raw);
                    }
                    $row[] = $v;
                    $i += strspn($line," \r\n\t",$i);
                    $delimiter=$line[$i++]??'';
                } while ($delimiter===',');
                if ($delimiter!==')' || count($columns[$name] ?? [])!==count($row)) throw new RuntimeException('tuple_columns_'.$name);
                $tables[$name][] = array_combine($columns[$name],$row);
                $i += strspn($line," \r\n\t",$i);
                $separator = $line[$i++] ?? '';
            } while ($separator===',');
            if ($separator!==';') throw new RuntimeException('tuple_end_'.$name);
        }
    } finally { gzclose($h); }
    if (!$done || !isset($tables['app_state'],$tables['complexes'],$tables['students'])) throw new RuntimeException('incomplete_dump');
    return $tables;
}


function hammam_summary(array $tables): array {
    $tenant = array_values(array_filter($tables['complexes'], static fn($row) => ($row['subdomain'] ?? '')==='m6'));
    if (count($tenant)!==1) throw new RuntimeException('tenant_scope');
    $cid = (string)$tenant[0]['id'];
    $groups = array_values(array_filter($tables['halaqat'] ?? [], static fn($row) =>
        (string)$row['complex_id']===$cid && trim($row['name'])==='همام الحارث'));
    if (count($groups)!==1) throw new RuntimeException('halaqa_scope');
    $hid = (string)$groups[0]['id'];
    $stores = [];
    foreach ($tables['app_state'] as $row) if ((string)$row['complex_id']===$cid) $stores[$row['key']]=$row;
    $row=$stores['halaqa_program_grades']??null;
    $grades=json_decode($row['value']??'{}',true,512,JSON_THROW_ON_ERROR)[$hid]??[];
    $registry=json_decode($stores['halaqa_programs']['value']??'{}',true,512,JSON_THROW_ON_ERROR)[$hid]??[];
    $semesters=[];
    foreach ($tables['semesters']??[] as $sem) {
        if ((string)($sem['complex_id']??'')!==$cid || empty($sem['is_active'])) continue;
        $semesters[]=['id'=>$sem['id'],'start_date'=>$sem['start_date']];
    }
    $weeks=[];$nonempty=0;$blank=0;
    foreach($grades as $student=>$storedWeeks) foreach($storedWeeks as $week=>$programs) {
        foreach($programs as $slots) foreach($slots as $value) {
            if ($value===null || $value==='') {$blank++;continue;}
            $nonempty++;$weeks[$week]=($weeks[$week]??0)+1;
        }
    }
    ksort($weeks);
    $roster=array_filter($tables['students'],static fn($s)=>(string)$s['complex_id']===$cid&&(string)$s['halaqa_id']===$hid);
    return ['count'=>$nonempty,'explicit_blanks'=>$blank,'weeks'=>$weeks,'semester'=>$semesters,'programs'=>count($registry),
        'roster'=>count($roster),'store_updated'=>$row['updated_at']??null,'cid'=>$cid];
}

try {
    $root=$argv[1]??'';
    if (!preg_match('~^(/home/[A-Za-z0-9_-]+)/domains/msht[.]io/public_html$~D',$root,$match) ||
        realpath($root)!==$root || trim(file_get_contents($root.'/deploy-sha.txt'))!=='4e8cfc813651d36f49a3c1ed5ddb9561a5442eab') {
        throw new RuntimeException('release_scope');
    }
    require $root.'/api/config.php';
    if (DB_NAME!=='u112851217_msht_io') throw new RuntimeException('database_scope');
    $pdo=new PDO('mysql:host='.DB_HOST.';dbname='.DB_NAME.';charset='.DB_CHARSET,DB_USER,DB_PASS,
        [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
    $pdo->exec('SET TRANSACTION READ ONLY');$pdo->beginTransaction();
    $cid=$pdo->query("SELECT id FROM complexes WHERE subdomain='m6'")->fetchColumn();
    $queries=[
        'complexes'=>['SELECT id,subdomain FROM complexes WHERE id=?'],
        'halaqat'=>['SELECT id,complex_id,name FROM halaqat WHERE complex_id=?'],
        'students'=>['SELECT id,complex_id,halaqa_id FROM students WHERE complex_id=?'],
        'semesters'=>['SELECT id,complex_id,start_date,is_active FROM semesters WHERE complex_id=?'],
        'app_state'=>["SELECT complex_id,`key`,value,updated_at FROM app_state WHERE complex_id=? AND `key` IN ('halaqa_program_grades','halaqa_programs')"],
    ];
    $tables=[];
    foreach($queries as $key=>[$sql]) {$q=$pdo->prepare($sql);$q->execute([$cid]);$tables[$key]=$q->fetchAll();}
    $live=hammam_summary($tables);
    $journal=[];
    foreach(['grade_cell_versions','grade_operation_receipts'] as $table) {
        $q=$pdo->prepare("SELECT store_key,COUNT(*) AS records FROM $table WHERE context_id=? GROUP BY store_key");
        $q->execute([$cid]);
        $journal[$table]=array_column($q->fetchAll(),'records','store_key');
    }
    $vars=$pdo->query("SHOW VARIABLES WHERE Variable_name IN ('log_bin','binlog_format','binlog_row_image','general_log','log_output')")->fetchAll();
    $vars=array_column($vars,'Value','Variable_name');
    try {$binlogs=['accessible'=>true,'count'=>count($pdo->query('SHOW BINARY LOGS')->fetchAll())];}
    catch(PDOException $e){$binlogs=['accessible'=>false,'driver_code'=>(int)($e->errorInfo[1]??0)];}
    $schema=$pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    $possibleHistory=array_values(array_filter($schema,static fn($name)=>preg_match('/audit|event|log|receipt|version/i',$name)));
    $pdo->rollBack();
    $directory=$match[1].'/.qhp-db-backups';
    if(realpath($directory)!==$directory || (fileperms($directory)&0077)!==0)throw new RuntimeException('archive_scope');
    $manifests=glob($directory.'/*/manifest.json');
    $selected=[];
    foreach($manifests as $path){
        $id=basename(dirname($path));
        if(!preg_match('/^2026110[2-9]T[0-9]{6}Z-[a-f0-9]+$/D',$id))continue;
        $day=substr($id,0,8);$selected[$day][]=$path;
    }
    $timeline=[];
    foreach($selected as $paths){
        sort($paths,SORT_STRING);
        foreach(array_unique([$paths[0],end($paths)]) as $path){
            $manifest=json_decode(file_get_contents($path),true,512,JSON_THROW_ON_ERROR);
            $file=dirname($path).'/production.sql.gz';
            if(realpath($file)!==$file || !hash_equals($manifest['sha256']??'',hash_file('sha256',$file)))continue;
            $timeline[basename(dirname($path))]=hammam_summary(read_archive($file));
        }
    }
    echo json_encode(['status'=>'read_only_recovery_evidence','live'=>$live,'journal'=>$journal,'log_settings'=>$vars,
        'binlogs'=>$binlogs,'history_tables'=>$possibleHistory,'archives'=>$timeline],JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE).PHP_EOL;
} catch(Throwable $error) {
    if(isset($pdo)&&$pdo->inTransaction())$pdo->rollBack();
    echo json_encode(['status'=>'recovery_audit_failed','class'=>get_class($error),
        'code'=>preg_match('/^[a-z0-9_]+$/D',$error->getMessage())?$error->getMessage():$error->getCode()]).PHP_EOL;
    exit(1);
}
