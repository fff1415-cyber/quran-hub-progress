<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
$root=$argv[1]??'';
if (!preg_match('~^/home/[A-Za-z0-9_-]+/domains/msht\.io/public_html$~D',$root) || realpath($root)!==$root ||
    trim(file_get_contents($root.'/deploy-sha.txt'))!=='cfaccd12f687794daf71ff73776301df37bc4c12') exit(1);
require $root.'/api/config.php';
if (DB_NAME!=='u112851217_msht_io') exit(1);
try {
    $pdo=new PDO('mysql:host='.DB_HOST.';dbname='.DB_NAME.';charset='.DB_CHARSET,DB_USER,DB_PASS,
        [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
    $pdo->exec('SET TRANSACTION READ ONLY'); $pdo->beginTransaction();
    $schema=$pdo->query("SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('app_state','grade_operation_receipts','grade_cell_versions','segment_completions','student_plan_assignments','semesters')")->fetchAll();
    $result=['schema'=>$schema];
    $result['events']=$pdo->query("SELECT SUBSTRING_INDEX(`key`,':',1) AS family,COUNT(*) AS total FROM app_state
        WHERE `key` LIKE 'grade_plan_%' GROUP BY family")->fetchAll();
    $result['recent_by_task']=$pdo->query("SELECT JSON_UNQUOTE(JSON_EXTRACT(value,'$.task_type')) AS task,
        COUNT(*) AS total, MAX(updated_at) AS last_event
        FROM app_state WHERE `key` LIKE 'grade_plan_event:%' GROUP BY task")->fetchAll();
    $receiptTime = array_values(array_filter($schema, static fn($row) =>
        $row['TABLE_NAME']==='grade_operation_receipts' && preg_match('/^(?:timestamp|datetime)/', $row['COLUMN_TYPE'])));
    if (count($receiptTime)===1 && preg_match('/^[a-z_]+$/', $receiptTime[0]['COLUMN_NAME'])) {
        $column = $receiptTime[0]['COLUMN_NAME'];
        $result['recent_grade_receipts']=$pdo->query("SELECT COUNT(*) FROM grade_operation_receipts
            WHERE store_key='grades' AND `$column` >= CURRENT_TIMESTAMP - INTERVAL 2 HOUR")->fetchColumn();
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
