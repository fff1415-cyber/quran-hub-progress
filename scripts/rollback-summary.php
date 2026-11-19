<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') exit(1);
$stage = 'scope';
try {
    $root = $argv[1] ?? '';
    $sha = $argv[2] ?? '';
    if (!preg_match('~^/home/[A-Za-z0-9_-]+/domains/msht\.io/public_html$~D', $root)
        || realpath($root) !== $root || !preg_match('/^[a-f0-9]{40}$/D', $sha)
        || trim(file_get_contents($root.'/deploy-sha.txt')) !== $sha) throw new RuntimeException('scope');
    require $root.'/api/config.php';
    if (DB_NAME !== 'u112851217_msht_io') throw new RuntimeException('db_scope');
    $stage = 'read';
    $pdo = new PDO('mysql:host='.DB_HOST.';dbname='.DB_NAME.';charset='.DB_CHARSET, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('SET TRANSACTION READ ONLY');
    $pdo->beginTransaction();
    $cutoff = '2026-11-03 00:00:00';
    $columns = $pdo->query("SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION")->fetchAll();
    $tables = [];
    foreach ($columns as $column) {
        $table = $column['TABLE_NAME'];
        $field = $column['COLUMN_NAME'];
        if (!preg_match('/^[A-Za-z0-9_]+$/D', $table) || !preg_match('/^[A-Za-z0-9_]+$/D', $field)) continue;
        if (!isset($tables[$table])) $tables[$table] = ['rows' => (int) $pdo->query("SELECT COUNT(*) FROM `$table`")->fetchColumn()];
        if (in_array($field, ['created_at','updated_at','completed_at','recorded_at','assigned_at'], true)
            && in_array($column['DATA_TYPE'], ['date','datetime','timestamp'], true)) {
            $q = $pdo->prepare("SELECT COUNT(*) FROM `$table` WHERE `$field`>=?");
            $q->execute([$cutoff]);
            $tables[$table][$field.'_on_or_after_nov3'] = (int) $q->fetchColumn();
        }
    }
    $byKey = [];
    foreach ($pdo->query('SELECT `key`, COUNT(*) AS n FROM app_state GROUP BY `key`') as $row) {
        $key = preg_replace('/:.*/', ':*', $row['key']);
        if (preg_match('/^[a-z0-9_]+(?::\*)?$/D', $key)) $byKey[$key] = ($byKey[$key] ?? 0) + (int) $row['n'];
    }
    $pdo->rollBack();
    echo json_encode(['release'=>$sha,'database_read_only'=>true,'cutoff'=>$cutoff,'tables'=>$tables,'app_state_key_counts'=>$byKey], JSON_THROW_ON_ERROR).PHP_EOL;
} catch (Throwable $error) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    echo json_encode(['status'=>'audit_failed','stage'=>$stage,'class'=>get_class($error)]).PHP_EOL;
    exit(1);
}
