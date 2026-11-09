<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
umask(0077);
const TABLES = ['complexes','halaqat','students','app_state','semesters','academic_weeks','education_plans',
    'student_plan_assignments','segment_completions','grade_cell_versions','grade_operation_receipts','role_accounts'];
const NOVEMBER_2_CELL_HASH='e9adec78411e077393675252b4c7cf935a31ec45ccff0095b23047b5b6c02a81';

function read_hammam_cells(array $grades): array {
    $cells=[];
    foreach($grades as $student=>$weeks) foreach($weeks as $week=>$programs)
    foreach($programs as $program=>$slots) foreach($slots as $slot=>$value) {
        if($value===null || $value==='')continue;
        if(!is_string($value))throw new RuntimeException('unexpected_grade_label');
        $cells[implode('|',[$student,$week,$program,$slot])]=$value;
    }
    return $cells;
}

function hammam_cell_hash(array $cells): string {
    $lines=[];
    foreach($cells as $key=>$value)$lines[]=$key.'|'.$value;
    sort($lines,SORT_STRING);
    return hash('sha256',implode("\n",$lines));
}

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
        'roster'=>count($roster),'store_updated'=>$row['updated_at']??null,'cid'=>$cid,'hid'=>$hid,
        'grades'=>$grades,'registry'=>$registry,'studentIds'=>array_column($roster,'id')];
}

function verify_selective_restore_on_test(string $home,array $live,array $old,array $history): array {
    $config=$home.'/.qhp-private/msht-test.php';
    if(realpath($config)!==$config || (fileperms($config)&0077)!==0)throw new RuntimeException('test_config_scope');
    $settings=qhp_load_private_test_config((string)file_get_contents($config));
    if($settings['database']!=='u112851217_msht_test' || $settings['user']===DB_USER)throw new RuntimeException('isolated_database_required');
    $test=new PDO('mysql:host='.$settings['host'].';dbname='.$settings['database'].';charset=utf8mb4',
        $settings['user'],$settings['password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
    if($test->query('SELECT DATABASE()')->fetchColumn()!=='u112851217_msht_test')throw new RuntimeException('test_database_identity');
    if($old['semester']!==$live['semester'] || $old['hid']!==$live['hid'])throw new RuntimeException('test_scope_mismatch');
    $cid=$live['cid'];$hid=$live['hid'];
    $row=$test->prepare("SELECT value FROM app_state WHERE complex_id=? AND `key`='halaqa_program_grades'");
    $others=$test->prepare("SELECT complex_id,`key`,SHA2(value,256) AS digest FROM app_state WHERE NOT (complex_id=? AND `key`='halaqa_program_grades') ORDER BY complex_id,`key`");
    $read=static function(PDOStatement $stmt)use($cid){$stmt->execute([$cid]);return $stmt->fetchColumn();};
    $readOthers=static function()use($others,$cid){$others->execute([$cid]);return $others->fetchAll();};
    $raw=$read($row);
    $store=json_decode($raw,true,512,JSON_THROW_ON_ERROR);
    if(($store[$hid]??[])!==$live['grades'])throw new RuntimeException('test_snapshot_drift');
    $beforeOthers=$readOthers();
    $programs=array_column($live['registry'],null,'id');
    $students=array_fill_keys($live['studentIds'],true);
    $candidate=read_hammam_cells($old['grades']);
    $added=0;$occupied=0;$incompatible=0;$uncertain=0;$stable=0;
    foreach($candidate as $key=>$value){
        [$student,$week,$program,$slot]=explode('|',$key);
        if(!isset($students[$student]))continue;
        $leaf=$store[$hid][$student][$week][$program]??[];
        if(array_key_exists($slot,$leaf)){ $occupied++;continue; }
        $config=$programs[$program]??null;
        if(!$config || ($config['active']??true)===false || !in_array($slot,$config['weekdays']??[],true) ||
            !in_array($value,array_column($config['levels']??[],'label'),true)){ $incompatible++;continue; }
        foreach($history as $prior) {
            if(($prior[$key]??null)!==$value){$uncertain++;continue 2;}
        }
        $stable++;
        $store[$hid][$student][$week][$program][$slot]=$value;$added++;
    }
    if($added===0)throw new RuntimeException('no_simulation_cells');
    $test->beginTransaction();
    $staleWriteRemovesRecovered=false;
    try {
        $update=$test->prepare("UPDATE app_state SET value=? WHERE complex_id=? AND `key`='halaqa_program_grades' AND BINARY value=BINARY ?");
        $update->execute([json_encode($store,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE),$cid,$raw]);
        if($update->rowCount()!==1)throw new RuntimeException('test_compare_and_swap');
        $after=json_decode($read($row),true,512,JSON_THROW_ON_ERROR);
        if($after!==$store || $readOthers()!==$beforeOthers)throw new RuntimeException('test_unrelated_state_changed');
        $beforeCells=read_hammam_cells($live['grades']);$afterCells=read_hammam_cells($after[$hid]);
        if(array_intersect_key($afterCells,$beforeCells)!==$beforeCells || count($afterCells)!==count($beforeCells)+$added)
            throw new RuntimeException('test_nonempty_cell_changed');
        // The legacy endpoint writes the whole document even if a client read it
        // before recovery. Reproduce that unconditional SQL inside the test rollback.
        $stale=json_decode($raw,true,512,JSON_THROW_ON_ERROR);
        [$student,$week,$program,$slot]=explode('|',array_key_first($beforeCells));
        $stale[$hid][$student][$week][$program][$slot]='__isolated_late_write__';
        $later=json_encode($stale,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);
        $upsert=$test->prepare("INSERT INTO app_state (complex_id,`key`,value) VALUES (?,'halaqa_program_grades',?)
            ON DUPLICATE KEY UPDATE value=?");
        $upsert->execute([$cid,$later,$later]);
        $afterStale=json_decode($read($row),true,512,JSON_THROW_ON_ERROR);
        $afterStaleCells=read_hammam_cells($afterStale[$hid]);
        $staleWriteRemovesRecovered=count(array_diff_key($afterCells,$afterStaleCells))===$added;
        if(!$staleWriteRemovesRecovered || $readOthers()!==$beforeOthers)throw new RuntimeException('test_legacy_overwrite_not_reproduced');
    } finally { $test->rollBack(); }
    if($read($row)!==$raw || $readOthers()!==$beforeOthers)throw new RuntimeException('test_rollback_incomplete');
    return ['simulated_added'=>$added,'stable_across_sampled_pre_loss_archives'=>$stable,'historical_disagreement'=>$uncertain,
        'existing_untouched'=>$occupied,'incompatible'=>$incompatible,'stale_whole_document_erases_simulated_recovery'=>$staleWriteRemovesRecovered,
        'other_stores_unchanged'=>true,'isolated_transaction_rolled_back'=>true,'production_writes'=>false];
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
    $otherActiveSessions=0;
    $ownConnection=(string)$pdo->query('SELECT CONNECTION_ID()')->fetchColumn();
    foreach($pdo->query('SHOW FULL PROCESSLIST')->fetchAll() as $process) {
        if((string)$process['Id']!==$ownConnection && $process['db']===DB_NAME && $process['Command']!=='Sleep')$otherActiveSessions++;
    }
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
    $timeline=[];$exactOld=null;$history=[];
    foreach($selected as $paths){
        sort($paths,SORT_STRING);
        foreach(substr(basename(dirname($paths[0])),0,8)==='20261109' ? $paths : array_unique([$paths[0],end($paths)]) as $path){
            $manifest=json_decode(file_get_contents($path),true,512,JSON_THROW_ON_ERROR);
            $file=dirname($path).'/production.sql.gz';
            if(realpath($file)!==$file || !hash_equals($manifest['sha256']??'',hash_file('sha256',$file)))continue;
            $archive=hammam_summary(read_archive($file));
            $id=basename(dirname($path));
            $cells=read_hammam_cells($archive['grades']);
            if(hammam_cell_hash($cells)===NOVEMBER_2_CELL_HASH)$exactOld=$archive;
            if($id<='20261109T024234Z-5e974a1fec' && $archive['semester']===$live['semester'])$history[$id]=$cells;
            $timeline[$id]=array_diff_key($archive,array_flip(['grades','registry','studentIds','hid']));
        }
    }
    if(count($history)<4 || !isset($history['20261109T024234Z-5e974a1fec']))throw new RuntimeException('pre_loss_history_unavailable');
    $simulation=$exactOld ? verify_selective_restore_on_test($match[1],$live,$exactOld,$history) : ['matched_exact_november_2_source'=>false];
    echo json_encode(['status'=>'read_only_recovery_evidence','live'=>array_diff_key($live,array_flip(['grades','registry','studentIds','hid'])),
        'journal'=>$journal,'log_settings'=>$vars,'binlogs'=>$binlogs,'history_tables'=>$possibleHistory,'archives'=>$timeline,
        'other_active_sessions_visible_at_sample'=>$otherActiveSessions,
        'isolated_simulation'=>$simulation],JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE).PHP_EOL;
} catch(Throwable $error) {
    if(isset($pdo)&&$pdo->inTransaction())$pdo->rollBack();
    echo json_encode(['status'=>'recovery_audit_failed','class'=>get_class($error),
        'code'=>preg_match('/^[a-z0-9_]+$/D',$error->getMessage())?$error->getMessage():$error->getCode()]).PHP_EOL;
    exit(1);
}
