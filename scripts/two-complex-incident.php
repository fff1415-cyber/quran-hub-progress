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
    $literal = <<<'REGEX'
~\G\s*(?:'((?:[^'\\\\]|\\\\.|'')*)'|((?:NULL|0x[0-9a-f]*|[-+]?[0-9]+(?:\.[0-9]+)?(?:e[-+]?[0-9]+)?)))([,\)])~is
REGEX;
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
            $i = strlen($m[0]);
            do {
                if (($line[$i++] ?? '') !== '(') throw new RuntimeException('tuple_open');
                $row = [];
                do {
                    if (!preg_match($literal,$line,$p,PREG_UNMATCHED_AS_NULL,$i)) throw new RuntimeException('tuple_literal');
                    $i += strlen($p[0]);
                    if ($p[1] !== null) {
                        $v = preg_replace_callback("~''|\\\\(.)~s", static fn($a) =>
                            $a[0]==="''" ? "'" : (['0'=>"\0",'n'=>"\n",'r'=>"\r",'t'=>"\t",'b'=>"\x08",'Z'=>"\x1a"][$a[1]] ?? $a[1]),$p[1]);
                    } else {
                        $v = $p[2]==='NULL' ? null : (str_starts_with($p[2],'0x') ? hex2bin(substr($p[2],2)) : $p[2]);
                    }
                    $row[] = $v;
                } while ($p[3]===',');
                if (count($columns[$name] ?? [])!==count($row)) throw new RuntimeException('tuple_columns');
                $tables[$name][] = array_combine($columns[$name],$row);
                $separator = $line[$i++] ?? '';
            } while ($separator===',');
            if ($separator!==';') throw new RuntimeException('tuple_end');
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
    echo json_encode(['status'=>'comparison_complete','release'=>trim(file_get_contents($root.'/deploy-sha.txt')),
        'baseline'=>BASE,'current_backup'=>$currentId,'production_writes'=>false,'complexes'=>$out,'timeline'=>$timeline],
        JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR).PHP_EOL;
} catch(Throwable $e) {
    echo json_encode(['status'=>'comparison_failed','stage'=>$stage,'reason'=>$e instanceof RuntimeException?$e->getMessage():get_class($e)]).PHP_EOL;
    exit(1);
}
