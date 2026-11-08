<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
umask(0077);
const BASE = '20261108T104617Z-762aa91783';
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

function tenant_ids(array $rows): array {
    $out=[];
    foreach ($rows as $row) {
        $name = preg_replace('/[\x{064B}-\x{065F}\x{0640}]/u','',(string)($row['name'] ?? ''));
        foreach (['القويع','الخبيبية'] as $needle) if (str_contains($name,$needle)) {
            if (isset($out[$needle])) throw new RuntimeException('ambiguous_tenant');
            $out[$needle] = (string)$row['id'];
        }
    }
    if (count($out)!==2) throw new RuntimeException('tenant_not_found');
    return $out;
}

function cell_map(mixed $node,array $path=[],array &$out=[]): array {
    if (is_array($node)) {
        foreach ($node as $k=>$v) cell_map($v,[...$path,(string)$k],$out);
    } elseif (count($path)>1 && $node!==null && $node!=='' && $node!==false &&
        !array_intersect($path,['touchedAt','fieldTouchedAt'])) {
        $out[json_encode($path,JSON_THROW_ON_ERROR)]=$node;
    }
    return $out;
}

function tenant_view(array $tables,string $id): array {
    $view=['stores'=>[],'counts'=>[],'receipt_times'=>[],'versions'=>[],'active'=>null,'students'=>[],'roster'=>[],'state_times'=>[],'assignments'=>[],'week_counts'=>[]];
    foreach (['halaqat','students','semesters','education_plans','role_accounts'] as $key) {
        $view['counts'][$key]=0;
        foreach ($tables[$key] ?? [] as $row) if ((string)($row['complex_id']??'')===$id) {
            $view['counts'][$key]++;
            if ($key==='students') {$view['students'][$row['id']]=true;$view['roster'][$row['id']]=(string)$row['halaqa_id'];}
            if ($key==='semesters' && (string)$row['is_active']==='1') $view['active']=['id'=>(string)$row['id'],'start'=>$row['start_date']??null,'weeks'=>$row['weeks_count']??null];
        }
    }
    $view['counts']['academic_weeks']=0;
    foreach ($tables['academic_weeks']??[] as $row) if ((string)($row['semester_id']??'')===($view['active']['id']??null)) $view['counts']['academic_weeks']++;
    foreach (['student_plan_assignments','segment_completions'] as $key) {
        $view['counts'][$key]=0;
        foreach ($tables[$key]??[] as $row) if (isset($view['students'][$row['student_id']])) {
            $view['counts'][$key]++;
            if ($key==='student_plan_assignments') $view['assignments'][(string)$row['id']]=[$row['status'],$row['plan_id']];
        }
    }
    foreach ($tables['app_state'] as $row) if ((string)($row['complex_id']??'')===$id) {
        $key=$row['key'];
        $view['stores'][$key]=json_decode($row['value'],true,512,JSON_THROW_ON_ERROR);
        if (isset($row['updated_at'])) $view['state_times'][$key]=$row['updated_at'];
    }
    foreach ($tables['grade_operation_receipts']??[] as $row) if ((string)$row['context_id']===$id) {
        $view['receipt_times'][]=$row['applied_at']??$row['created_at']??'';
    }
    foreach ($tables['grade_cell_versions']??[] as $row) if ((string)$row['context_id']===$id && ($row['direct_version']??null)!==null) {
        $view['versions'][$row['store_key']][$row['path_json']]=$row['updated_at']??null;
    }
    return $view;
}

function store_diff(array $before,array $after,string $key): array {
    $old=$before['stores'][$key]??[];
    $new=$after['stores'][$key]??[];
    $a=[];$b=[];cell_map($old,[],$a);cell_map($new,[],$b);
    $gone=array_diff_key($a,$b);$added=array_diff_key($b,$a);
    $changed=$conflict=$possible=0;
    foreach ($a as $p=>$v) if (array_key_exists($p,$b) && $b[$p]!==$v) $changed++;
    foreach ($gone as $p=>$v) {
        $path=json_decode($p,true,512,JSON_THROW_ON_ERROR);
        $node=$new;
        foreach ($path as $step) {
            if (!is_array($node)||!array_key_exists($step,$node)) {$node=null;break;}
            $node=$node[$step];
        }
        if ($node!==null || array_key_exists($p,$after['versions'][$key]??[])) $conflict++;
        elseif (isset($after['students'][$path[0]]) && in_array($key,['grades','weekly_tests'],true)) $possible++;
    }
    $weeks=static function(array $map) use($key): array {
        if (!in_array($key,['grades','weekly_tests'],true)) return [];
        $out=[];
        foreach ($map as $path=>$val) {
            $week=json_decode($path,true)[1]??'';
            if (ctype_digit($week)) $out[$week]=($out[$week]??0)+1;
        }
        ksort($out,SORT_NUMERIC);
        return $out;
    };
    return ['backup_cells'=>count($a),'current_cells'=>count($b),'missing_cells'=>count($gone),'new_cells'=>count($added),
        'changed_cells'=>$changed,'explicit_blank_or_version'=>$conflict,'missing_with_existing_student'=>$possible,
        'backup_entries'=>count((array)$old),'current_entries'=>count((array)$new),
        'backup_weeks'=>$weeks($a),'current_weeks'=>$weeks($b),'missing_weeks'=>$weeks($gone),
        'backup_updated'=>$before['state_times'][$key]??null,'current_updated'=>$after['state_times'][$key]??null];
}

function recorded_summary(array $grades,array $roster,array $groups): array {
    $out=['fields'=>[],'weeks'=>[],'rostered_students_with_entries'=>0,'unrostered_students_with_entries'=>0,'groups'=>[]];
    foreach ($grades as $student=>$weeks) {
        $has=false;
        $group=$roster[$student]??null;
        foreach ($weeks as $week=>$record) {
            foreach (($record['days']??[]) as $day) foreach (['attendance','hifz','rabt','muraja'] as $field) {
                $v=$day[$field]??null;
                if (!is_string($v) || $v==='') continue;
                $has=true;
                $out['fields'][$field]=($out['fields'][$field]??0)+1;
                $out['weeks'][$week]=($out['weeks'][$week]??0)+1;
                if ($group!==null) $out['groups'][$groups[$group]??'غير مصنف']=($out['groups'][$groups[$group]??'غير مصنف']??0)+1;
            }
            foreach (['testMuraja','testRabt'] as $field) {
                $found=[];cell_map($record[$field]??[],[$field],$found);
                $n=count($found)+(is_scalar($record[$field]??null) && $record[$field]!=='' ? 1 : 0);
                if ($n) $out['fields'][$field]=($out['fields'][$field]??0)+$n;
            }
        }
        if ($has) $out[$group===null?'unrostered_students_with_entries':'rostered_students_with_entries']++;
    }
    ksort($out['weeks'],SORT_NUMERIC);
    return $out;
}

function live_read(string $root,array $ids,array $fresh): array {
    require_once $root.'/api/config.php';
    require_once $root.'/api/tenant.php';
    require_once $root.'/api/auth.php';
    require_once $root.'/api/routes/app_state.php';
    require_once $root.'/api/routes/plans.php';
    if (DB_NAME!=='u112851217_msht_io') throw new RuntimeException('live_database_scope');
    $pdo=new PDO('mysql:host='.DB_HOST.(defined('DB_PORT')?';port='.DB_PORT:'').';dbname='.DB_NAME.';charset='.DB_CHARSET,
        DB_USER,DB_PASS,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
    $pdo->exec('SET TRANSACTION READ ONLY');$pdo->beginTransaction();
    $views=[];
    foreach (array_unique($ids) as $id) {
        $q=$pdo->prepare('SELECT id,name,subdomain FROM complexes WHERE id=?');
        $q->execute([$id]);$tenant=$q->fetch();
        $q=$pdo->prepare('SELECT id,name FROM halaqat WHERE complex_id=?');
        $q->execute([$id]);$groups=[];$labels=[];
        foreach ($q as $g) {
            $label='غير مذكور في اسم الحلقة';
            foreach (array_keys($ids) as $name) if (str_contains($g['name'],$name)) $label=$name;
            $groups[$g['id']]=$label;$labels[$label]=($labels[$label]??0)+1;
        }
        $snapshot=grade_write_snapshot($pdo,(int)$id);
        $raw=json_decode(json_encode($snapshot['value'],JSON_THROW_ON_ERROR),true,512,JSON_THROW_ON_ERROR);
        $current=tenant_view($fresh,$id);
        $before=$current['stores']['grades']??[];
        $q=$pdo->prepare('SELECT id FROM role_accounts WHERE complex_id=? AND role=\'manager\' LIMIT 1');
        $q->execute([$id]);$account=$q->fetchColumn();
        $token=generate_token(['role'=>'manager','complexId'=>(int)$id,'accountId'=>$account,'exp'=>time()*1000+90000]);
        $http=[];
        foreach (['grades&grade_protocol=1','weekly_tests'] as $resource) {
            $url='https://msht.io/api/r.php?path=%2Fapp-state&key='.$resource;
            $context=stream_context_create(['http'=>['method'=>'GET','timeout'=>12,'ignore_errors'=>true,'follow_location'=>0,
                'header'=>"Authorization: Bearer ".$token."\r\nAccept: application/json\r\nCache-Control: no-cache\r\n"]]);
            $payload=@file_get_contents($url,false,$context);
            $status=0;
            if (preg_match('/^HTTP\/[^ ]+ (\d+)/',$http_response_header[0]??'',$match)) $status=(int)$match[1];
            $body=is_string($payload)?json_decode($payload,true):null;
            $cells=[];
            cell_map($resource==='weekly_tests'?($body[0]['value']??[]):($body['value']??[]),[],$cells);
            $http[$resource]=['status'=>$status,'scope'=>$body['context_complex_id']??null,'cells'=>count($cells),
                'matches_live_grade_snapshot'=>$resource==='weekly_tests'?null:($body['value']??null)===$raw];
        }
        $views[$id]=['tenant'=>$tenant,'halaqa_name_labels'=>$labels,'snapshot_context'=>$snapshot['context_complex_id'],
            'snapshot_matches_emergency_archive'=>$raw===$before,'http'=>$http,
            'recorded'=>recorded_summary($raw,$current['roster'],$groups)];
    }
    $pdo->rollBack();
    return $views;
}

$stage='scope';
try {
    $root=$argv[1]??'';
    if (!preg_match('~^(/home/[A-Za-z0-9_-]+)/domains/msht\.io/public_html$~D',$root,$m) || realpath($root)!==$root) throw new RuntimeException('scope');
    $directory=$m[1].'/.qhp-db-backups';
    if (realpath($directory)!==$directory || (fileperms($directory)&0077)!==0) throw new RuntimeException('backup_scope');
    $stage='archives';
    $entries=[];
    foreach (glob($directory.'/*/manifest.json') as $file) {
        $folder=dirname($file);
        if (realpath($folder)!==$folder) continue;
        $manifest=json_decode(file_get_contents($file),true,512,JSON_THROW_ON_ERROR);
        if (($manifest['status']??'')!=='backup_created' || basename($folder)!==($manifest['backup_id']??'')) continue;
        $entries[$manifest['backup_id']]=[$manifest,$folder.'/production.sql.gz'];
    }
    ksort($entries);
    $currentId=array_key_last($entries);
    if (!isset($entries[BASE]) || $currentId===BASE || $currentId<BASE) throw new RuntimeException('new_backup_missing');
    $load=static function(string $id) use($entries): array {
        [$manifest,$path]=$entries[$id];
        if (realpath($path)!==$path || !hash_equals($manifest['sha256'],hash_file('sha256',$path))) throw new RuntimeException('archive_integrity');
        return read_archive($path);
    };
    $stage='baseline';
    $baseline=$load(BASE);
    $ids=tenant_ids($baseline['complexes']);
    $stage='current';
    $fresh=$load($currentId);
    if (tenant_ids($fresh['complexes'])!=$ids) throw new RuntimeException('tenant_identity_changed');
    $stage='comparison';
    $keys=['grades','weekly_tests','scientific_grades','halaqa_program_grades','academic_records','sard_history','sard_queue','tarbawi_program','halaqa_programs','evaluation_settings'];
    $out=[];
    foreach ($ids as $name=>$id) {
        $old=tenant_view($baseline,$id);$new=tenant_view($fresh,$id);
        $stores=[];
        foreach ($keys as $key) $stores[$key]=store_diff($old,$new,$key);
        $out[$name]=['tenant_id'=>$id,'baseline_counts'=>$old['counts'],'current_counts'=>$new['counts'],
            'baseline_active_semester'=>$old['active'],'current_active_semester'=>$new['active'],
            'roster_removed'=>count(array_diff_key($old['roster'],$new['roster'])),
            'roster_added'=>count(array_diff_key($new['roster'],$old['roster'])),
            'roster_halaqa_changed'=>count(array_diff_assoc(array_intersect_key($new['roster'],$old['roster']),$old['roster'])),
            'assignment_ids_missing'=>count(array_diff_key($old['assignments'],$new['assignments'])),
            'baseline_receipts'=>count($old['receipt_times']),'current_receipts'=>count($new['receipt_times']),
            'last_receipt'=>$new['receipt_times']?max($new['receipt_times']):null,'stores'=>$stores];
    }
    $stage='timeline';
    $timeline=[];
    foreach ($entries as $id=>[$manifest,$file]) {
        if ($id<'20261108T000000Z' || $id===$currentId) continue;
        $tables=$id===BASE?$baseline:$load($id);
        $row=[];
        foreach ($ids as $name=>$cid) {
            $view=tenant_view($tables,$cid);
            foreach (['grades','weekly_tests'] as $key) {
                $cells=[];cell_map($view['stores'][$key]??[],[],$cells);
                $row[$name][$key]=count($cells);
            }
        }
        $timeline[$id]=$row;
    }
    $stage='live_read';
    $live=live_read($root,$ids,$fresh);
    echo json_encode(['status'=>'comparison_complete','release'=>trim(file_get_contents($root.'/deploy-sha.txt')),
        'baseline'=>BASE,'current_backup'=>$currentId,'production_writes'=>false,'complexes'=>$out,'timeline'=>$timeline,'live'=>$live],
        JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR).PHP_EOL;
} catch(Throwable $e) {
    echo json_encode(['status'=>'comparison_failed','stage'=>$stage,'reason'=>$e instanceof RuntimeException?$e->getMessage():get_class($e)]).PHP_EOL;
    exit(1);
}
