<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
try {
    $root = $argv[1] ?? '';
    if (!preg_match('~^/home/[A-Za-z0-9_-]+/domains/msht\.io/public_html$~D',$root) || realpath($root)!==$root ||
        !in_array(trim(file_get_contents($root.'/deploy-sha.txt')), [
            'ba66ab01b661d6e019ad4826b0aabc675c5dbbd1','0ff38a91d8fce7ba2c80374ec48a8a58dae6b533',
        ], true)) {
        throw new RuntimeException('scope');
    }
    require $root.'/api/config.php';
    if (DB_NAME!=='u112851217_msht_io') throw new RuntimeException('database_scope');
    $pdo = new PDO('mysql:host='.DB_HOST.';dbname='.DB_NAME.';charset='.DB_CHARSET,DB_USER,DB_PASS,
        [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
    $pdo->exec('SET TRANSACTION READ ONLY');
    $pdo->beginTransaction();
    $read = $pdo->query("SELECT complex_id,`key`,value FROM app_state WHERE `key` IN ('grades','scientific_grades')");
    $stores = [];
    foreach ($read as $row) $stores[$row['complex_id']][$row['key']] = json_decode($row['value'],true,512,JSON_THROW_ON_ERROR);
    $counts = ['scientific_stores'=>0,'positive_scores'=>0,'without_matching_prep'=>0,'manual_override'=>0,
        'missing_field_default_match'=>0,'failed_result_default_match'=>0,'other_without_evidence'=>0,
        'present_with_unearned_default'=>0,'empty_attendance_with_unearned_default'=>0,'attendance_points_with_no_attendance'=>0];
    foreach ($stores as $store) {
        if (!isset($store['scientific_grades'])) continue;
        $counts['scientific_stores']++;
        $scientific = $store['scientific_grades'];
        $grades = $store['grades'] ?? [];
        foreach ($scientific['data'] ?? [] as $group=>$students) foreach ($students as $student=>$weeks)
        foreach ($weeks as $week=>$days) foreach ($days as $day=>$fields) {
            $prep = $grades[$student][$week]['days'][$day] ?? [];
            if (is_numeric($fields['attendance'] ?? null) && (float)$fields['attendance'] !== 0.0 &&
                empty($prep['attendance']) && empty($scientific['overrides'][$group][$student][$week][$day]['attendance'])) {
                $counts['attendance_points_with_no_attendance']++;
            }
            foreach (['hifz','rabt','muraja'] as $field) {
                $score = $fields[$field] ?? null;
                if (!is_numeric($score) || (float)$score<=0) continue;
                $counts['positive_scores']++;
                $source = $prep[$field] ?? null;
                if ($field==='hifz' ? in_array($source,['half','one','two'],true) : $source==='pass') continue;
                $counts['without_matching_prep']++;
                if (!empty($scientific['overrides'][$group][$student][$week][$day][$field])) {
                    $counts['manual_override']++;
                    continue;
                }
                $default = $scientific['configs'][$group]['defaultScores'][$field] ?? null;
                if (!is_numeric($default) || (float)$default!==(float)$score) {
                    $counts['other_without_evidence']++;
                } elseif (!array_key_exists($field,$prep)) {
                    $counts['missing_field_default_match']++;
                    if (($prep['attendance'] ?? '') === 'present') $counts['present_with_unearned_default']++;
                    if (empty($prep['attendance'])) $counts['empty_attendance_with_unearned_default']++;
                } elseif ($source==='fail' && $field!=='hifz') {
                    $counts['failed_result_default_match']++;
                } else {
                    $counts['other_without_evidence']++;
                }
            }
        }
    }
    $pdo->rollBack();
    echo json_encode(['status'=>'scientific_scores_audited','release'=>trim(file_get_contents($root.'/deploy-sha.txt')),
        'production_read_only'=>true]+$counts,JSON_THROW_ON_ERROR).PHP_EOL;
} catch (Throwable $error) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    echo json_encode(['status'=>'audit_failed','class'=>get_class($error)]).PHP_EOL;
    exit(1);
}
