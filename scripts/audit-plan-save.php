<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
$root=$argv[1]??'';
if (!preg_match('~^/home/[A-Za-z0-9_-]+/domains/msht\.io/public_html$~D',$root) || realpath($root)!==$root ||
    trim(file_get_contents($root.'/deploy-sha.txt'))!=='cfaccd12f687794daf71ff73776301df37bc4c12') exit(1);
require $root.'/api/config.php';
require $root.'/api/routes/plans.php';
if (DB_NAME!=='u112851217_msht_io') exit(1);
try {
    $pdo=new PDO('mysql:host='.DB_HOST.';dbname='.DB_NAME.';charset='.DB_CHARSET,DB_USER,DB_PASS,
        [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
    $pdo->exec('SET TRANSACTION READ ONLY'); $pdo->beginTransaction();
    $cid=(int)$pdo->query("SELECT id FROM complexes WHERE subdomain='mm'")->fetchColumn();
    if ($cid<1) throw new RuntimeException('mm_not_found');
    $schema=$pdo->query("SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('app_state','grade_operation_receipts','grade_cell_versions','segment_completions','student_plan_assignments','semesters')")->fetchAll();
    $result=['scope'=>'mm','db_utc_now'=>$pdo->query('SELECT UTC_TIMESTAMP()')->fetchColumn(),
        'sql_mode'=>$pdo->query('SELECT @@sql_mode')->fetchColumn(),'schema'=>$schema];
    $result['events']=$pdo->query("SELECT SUBSTRING_INDEX(`key`,':',1) AS family,COUNT(*) AS total FROM app_state
        WHERE `key` LIKE 'grade_plan_%' GROUP BY family")->fetchAll();
    $q=$pdo->prepare("SELECT JSON_UNQUOTE(JSON_EXTRACT(value,'$.task_type')) AS task,
        COUNT(*) AS total, MAX(updated_at) AS last_event
        FROM app_state WHERE complex_id=? AND `key` LIKE 'grade_plan_event:%' GROUP BY task");
    $q->execute([$cid]); $result['mm_tasks']=$q->fetchAll();
    $q=$pdo->prepare("SELECT `key`,OCTET_LENGTH(value) AS bytes,updated_at FROM app_state
        WHERE complex_id=? AND `key` IN ('grades','scientific_grades','sard_queue')");
    $q->execute([$cid]); $result['mm_store_sizes']=$q->fetchAll();
    $result['max_packet']=(int)$pdo->query('SELECT @@max_allowed_packet')->fetchColumn();
    $result['triggers']=$pdo->query("SELECT EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING FROM information_schema.TRIGGERS
        WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE IN ('segment_completions','app_state','grade_operation_receipts','grade_cell_versions')")->fetchAll();
    $result['foreign_keys']=$pdo->query("SELECT TABLE_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL
        AND TABLE_NAME IN ('segment_completions','app_state','grade_operation_receipts','grade_cell_versions')")->fetchAll();
    $result['unique_keys']=$pdo->query("SELECT TABLE_NAME,INDEX_NAME,GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns_used
        FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND NON_UNIQUE=0
        AND TABLE_NAME IN ('segment_completions','app_state','grade_operation_receipts','grade_cell_versions') GROUP BY TABLE_NAME,INDEX_NAME")->fetchAll();
    $q=$pdo->prepare("SELECT a.id,a.student_id,a.plan_id,a.assigned_at,a.start_segment_index,a.start_muraja_segment,p.track,p.level_number
        FROM student_plan_assignments a JOIN students s ON s.id=a.student_id JOIN education_plans p ON p.id=a.plan_id
        WHERE a.status='active' AND s.complex_id=?");
    $q->execute([$cid]); $assignments=$q->fetchAll();
    $segments=$pdo->prepare("SELECT segment_index FROM plan_segments WHERE plan_id=? ORDER BY segment_index");
    $completions=$pdo->prepare("SELECT segment_index,task_type,assignment_id,created_at FROM segment_completions WHERE student_id=? AND plan_id=?");
    $counts=[];
    foreach ($assignments as $a) {
        $segments->execute([$a['plan_id']]); $all=array_map('intval',$segments->fetchAll(PDO::FETCH_COLUMN));
        $completions->execute([$a['student_id'],$a['plan_id']]); $done=[];$older=[];
        foreach ($completions as $row) {
            $task=$row['task_type']; $n=(int)$row['segment_index'];
            if ($row['assignment_id']===$a['id'] || ($row['assignment_id']===null && $row['created_at']>=$a['assigned_at'])) $done[$task][]=$n;
            else $older[$task][]=$n;
        }
        foreach (['hifz','rabt','muraja'] as $task) {
            if ($task==='hifz') $next=plans_next_hifz_segments_for_tap($a['track'],$a['track']==='gold'?'one':'half',(int)$a['start_segment_index'],$all,$done['hifz']??[]);
            else {
                $n=plans_next_segment_for_task($task,(int)$a['start_segment_index'],$a['start_muraja_segment']===null?null:(int)$a['start_muraja_segment'],
                    (int)$a['level_number'],$all,$done['hifz']??[],$done[$task]??[]);
                $next=$n===null?[]:[$n];
            }
            $bucket=$next?(array_intersect($next,$older[$task]??[])?'historical_collision':'available'):'no_segments';
            $key=$task.'/'.$bucket; $counts[$key]=($counts[$key]??0)+1;
        }
    }
    $result['mm_next_segment_paths']=$counts;
    foreach (['grade-plan-effect','grade-cell-operations','grade-write-api'] as $file)
        $result['runtime_hashes'][$file]=hash_file('sha256',$root.'/api/lib/'.$file.'.php');
    $receiptTime = array_values(array_filter($schema, static fn($row) =>
        $row['TABLE_NAME']==='grade_operation_receipts' && preg_match('/^(?:timestamp|datetime)/', $row['COLUMN_TYPE'])));
    if (count($receiptTime)===1 && preg_match('/^[a-z_]+$/', $receiptTime[0]['COLUMN_NAME'])) {
        $column = $receiptTime[0]['COLUMN_NAME'];
        $q=$pdo->prepare("SELECT COUNT(*) AS total,MAX(`$column`) AS last_receipt FROM grade_operation_receipts
            WHERE context_id=? AND store_key='grades' AND `$column` >= CURRENT_TIMESTAMP - INTERVAL 2 HOUR");
        $q->execute([$cid]); $result['mm_recent_receipts']=$q->fetch();
    }
    try {
        $result['database_errors']=$pdo->query("SELECT MYSQL_ERRNO, RETURNED_SQLSTATE,COUNT(*) AS total,
            CASE WHEN SQL_TEXT LIKE '%segment_completions%' THEN 'plan_completion'
                 WHEN SQL_TEXT LIKE '%app_state%' THEN 'app_state'
                 WHEN SQL_TEXT LIKE '%grade_cell_%' THEN 'grade_cells' ELSE 'other' END AS family
            FROM performance_schema.events_statements_history_long WHERE CURRENT_SCHEMA=DATABASE() AND MYSQL_ERRNO>0
            GROUP BY MYSQL_ERRNO,RETURNED_SQLSTATE,family")->fetchAll();
    } catch (PDOException $e) { $result['database_error_history']='unavailable'; }
    $result['php_error_families']=[];
    foreach ([$root.'/error_log',$root.'/api/error_log',dirname($root).'/logs/error.log',dirname($root).'/logs/php_error.log'] as $file) {
        if (!is_file($file)||!is_readable($file)) continue;
        $fp=fopen($file,'rb'); fseek($fp,max(0,filesize($file)-262144)); $tail=stream_get_contents($fp); fclose($fp);
        preg_match_all('/SQLSTATE\[([0-9A-Z]+)\](?:.{0,50}?\b(\d{4})\b)?/',$tail,$m,PREG_SET_ORDER);
        foreach ($m as $match) {
            $key=$match[1].'/'.($match[2]??'');
            $result['php_error_families'][$key]=($result['php_error_families'][$key]??0)+1;
        }
    }
    $pdo->rollBack();
    echo 'LINKED_GRADE_AUDIT '.json_encode($result,JSON_THROW_ON_ERROR).PHP_EOL;
} catch (Throwable $e) {
    echo json_encode(['status'=>'audit_failed','sqlstate'=>(string)$e->getCode()]).PHP_EOL; exit(1);
}
