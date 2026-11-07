<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
umask(0077);
$stage = 'test_identity';
try {
    $home = realpath($argv[1] ?? '');
    $api = realpath($argv[2] ?? '');
    $ddl = base64_decode($argv[3] ?? '', true);
    $target = 'u112851217_msht_test';
    if (!$home || $api !== $home . '/domains/msht.io/public_html/api' || !$ddl) throw new RuntimeException('invalid_test_target');
    require $api . '/config.php'; // Only used to reject reuse of the production account.
    if (DB_NAME !== 'u112851217_msht_io') throw new RuntimeException('unexpected_main_identity');
    $private = $home . '/.qhp-private';
    $config = $private . '/msht-test.php';
    $fresh = isset($argv[4], $argv[5]);
    $baselineName = $argv[4] ?? 'compatibility-6fca1415377b4d9f';
    $sourceSha = $argv[5] ?? '72a1db96694b9f386a4ca3b9a5a5313855e976e85571318b46b8de872405dea6';
    if (!preg_match($fresh ? '/^restore-\d{8}T\d{6}Z-[a-f0-9]{10}-[a-f0-9]{10}$/D' : '/^compatibility-[a-f0-9]{16}$/D', $baselineName) ||
        !preg_match('/^[a-f0-9]{64}$/D', $sourceSha)) throw new RuntimeException('invalid_restore_evidence');
    $baseline = $private . '/' . $baselineName;
    $expectedArchive = $baseline . ($fresh ? '/restored-roundtrip.sql.gz' : '/after-index.sql.gz');
    foreach ([$private, $config, $baseline, $baseline . '/verified.json', $expectedArchive] as $path) {
        if (realpath($path) !== $path || is_link($path) || (fileperms($path) & 0077) !== 0) throw new RuntimeException('unsafe_private_path');
    }
    $proof = json_decode(file_get_contents($baseline . '/verified.json'), true, 512, JSON_THROW_ON_ERROR);
    if (($proof['status'] ?? null) !== ($fresh ? 'independent_restore_verified' : 'test_compatibility_verified') ||
        ($proof['source_sha256'] ?? null) !== $sourceSha ||
        ($proof[$fresh ? 'schema_and_values_roundtrip_match' : 'all_row_values_unchanged'] ?? null) !== true ||
        ($fresh && (($proof['restored_database'] ?? null) !== $target || ($proof['application_schema']['ready'] ?? null) !== true))) {
        throw new RuntimeException('verified_baseline_required');
    }
    $settings = qhp_load_private_test_config(file_get_contents($config));
    if ($settings['user'] === DB_USER || !preg_match('/^[A-Za-z0-9.:-]+$/D', $settings['host'])) throw new RuntimeException('test_credentials_not_independent');
    $lockPath = $private . '/test-restore.lock';
    if (is_link($lockPath)) throw new RuntimeException('unsafe_restore_lock');
    $lock = fopen($lockPath, 'c');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) throw new RuntimeException('test_database_busy');
    $pdo = new PDO('mysql:host=' . $settings['host'] . ';dbname=' . $target . ';charset=utf8mb4', $settings['user'], $settings['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::MYSQL_ATTR_MULTI_STATEMENTS => false]);
    qhp_restore_identity($pdo, $target);
    $directory = $private . '/grade-schema-test-' . bin2hex(random_bytes(8));
    if (!mkdir($directory, 0700)) throw new RuntimeException('private_evidence_directory_failed');

    $stage = 'migration_allowlist';
    $tables = ['grade_cell_versions', 'grade_operation_receipts'];
    $statements = array_values(array_filter(array_map('trim', explode(';', $ddl))));
    if (count($statements) !== count($tables) || sha1('blob ' . strlen($ddl) . "\0" . $ddl) !== 'c6e2de84ce67147e6bf941f9326d003b9003cb41') {
        throw new RuntimeException('unexpected_migration_content');
    }
    foreach ($tables as $i => $table) {
        if (!str_starts_with($statements[$i], 'CREATE TABLE IF NOT EXISTS ' . $table . ' (')) throw new RuntimeException('unexpected_migration_table');
    }
    $stage = 'verify_restored_baseline';
    $expected = qhp_restore_archive($expectedArchive);
    $before = qhp_restore_archive(qhp_restore_dump($settings, $target, $directory, 'before'));
    if ($expected !== $before || count($before) !== 16) throw new RuntimeException('test_baseline_changed');
    $stage = 'add_test_tables';
    $pdo->exec('SET SESSION lock_wait_timeout=3');
    foreach ($statements as $statement) $pdo->exec($statement);
    $stage = 'verify_existing_tables_and_idempotence';
    $after = qhp_restore_archive(qhp_restore_dump($settings, $target, $directory, 'after'));
    $old = $after;
    foreach ($tables as $table) {
        if (($after[$table]['row_count'] ?? null) !== 0) throw new RuntimeException('unexpected_protocol_rows');
        unset($old[$table]);
    }
    if ($old !== $before) throw new RuntimeException('existing_test_values_changed');
    foreach ($statements as $statement) $pdo->exec($statement);
    if ($after !== qhp_restore_archive(qhp_restore_dump($settings, $target, $directory, 'repeat'))) throw new RuntimeException('migration_not_idempotent');
    $definitions = [];
    foreach ($tables as $table) {
        $create = $pdo->query('SHOW CREATE TABLE `' . $table . '`')->fetch(PDO::FETCH_NUM);
        $definitions[$table] = hash('sha256', $create[1]);
    }
    $report = ['status' => 'grade_schema_verified_on_independent_restore', 'source_backup_id' => $proof['source_backup_id'], 'source_sha256' => $sourceSha,
        'migration_sha256' => hash('sha256', $ddl), 'legacy_tables_unchanged' => count($old),
        'legacy_rows_unchanged' => array_sum(array_column($old, 'row_count')), 'empty_new_tables' => $tables,
        'definitions_sha256' => $definitions, 'repeat_unchanged' => true, 'production_database_connected' => false, 'evidence' => basename($directory)];
    file_put_contents($directory . '/verified.json', json_encode($report, JSON_THROW_ON_ERROR) . "\n", LOCK_EX);
    echo json_encode($report, JSON_THROW_ON_ERROR) . "\n";
} catch (Throwable $error) {
    echo json_encode(['status' => 'grade_schema_test_incomplete', 'stage' => $stage,
        'reason' => !$error instanceof PDOException && preg_match('/^[a-z_]+$/D', $error->getMessage()) ? $error->getMessage() : null,
        'errno' => $error instanceof PDOException ? (int) ($error->errorInfo[1] ?? 0) : null, 'production_database_connected' => false]) . "\n";
    exit(1);
}
