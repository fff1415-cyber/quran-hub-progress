<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
umask(0077);
$stage = 'verify_scope';
$created = [];
function grade_release_evidence(string $path): array {
    foreach ([$path, dirname($path)] as $entry) {
        if (realpath($entry) !== $entry || is_link($entry) || (fileperms($entry) & 0077) !== 0) throw new RuntimeException('private_evidence_path_invalid');
    }
    return json_decode(file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
}
try {
    $home = realpath($argv[1] ?? '');
    $api = realpath($argv[2] ?? '');
    $ddl = base64_decode($argv[3] ?? '', true);
    [$backupId, $sha, $evidence] = array_slice($argv, 4, 3);
    $marker = 'c2d339b801cbb666ef91b1e704a5606267468d63';
    if (!$home || $api !== $home . '/domains/msht.io/public_html/api' ||
        trim(file_get_contents(dirname($api) . '/deploy-sha.txt')) !== $marker ||
        !$ddl || !preg_match('/^\d{8}T\d{6}Z-[a-f0-9]{10}$/D', $backupId) ||
        !preg_match('/^[a-f0-9]{64}$/D', $sha) ||
        !preg_match('/^grade-schema-test-[a-f0-9]{16}$/D', $evidence)) throw new RuntimeException('invalid_release_scope');
    $stage = 'verify_fresh_backup_and_exact_test';
    $backupDir = $home . '/.qhp-db-backups/' . $backupId;
    $manifest = grade_release_evidence($backupDir . '/manifest.json');
    $test = grade_release_evidence($home . '/.qhp-private/' . $evidence . '/verified.json');
    $archive = $backupDir . '/production.sql.gz';
    $time = strtotime($manifest['created_at_utc'] ?? '');
    if (!$time || $time > time() || time() - $time > 1800 || realpath($archive) !== $archive || is_link($archive) ||
        (fileperms($archive) & 0077) !== 0 || ($manifest['backup_id'] ?? null) !== $backupId ||
        ($manifest['sha256'] ?? null) !== $sha || !hash_equals($sha, hash_file('sha256', $archive)) ||
        ($manifest['consistent_snapshot'] ?? null) !== true) throw new RuntimeException('recent_verified_backup_required');
    $tables = ['grade_cell_versions', 'grade_operation_receipts'];
    if (($test['status'] ?? null) !== 'grade_schema_verified_on_independent_restore' ||
        ($test['source_backup_id'] ?? null) !== $backupId || ($test['source_sha256'] ?? null) !== $sha ||
        ($test['migration_sha256'] ?? null) !== hash('sha256', $ddl) || ($test['repeat_unchanged'] ?? null) !== true ||
        ($test['production_database_connected'] ?? null) !== false || ($test['legacy_tables_unchanged'] ?? null) !== 16 ||
        ($test['empty_new_tables'] ?? null) !== $tables) throw new RuntimeException('matching_independent_test_required');
    $statements = array_values(array_filter(array_map('trim', explode(';', $ddl))));
    if (count($statements) !== count($tables) ||
        hash('sha256', $ddl) !== '74b04b562176d5f7159276f4e1f21beac6f9b9b61766eb3347128a5752a9f79c') throw new RuntimeException('unexpected_ddl_content');
    foreach ($tables as $i => $table) {
        if (!str_starts_with($statements[$i], 'CREATE TABLE IF NOT EXISTS ' . $table . ' (')) throw new RuntimeException('unexpected_table');
    }
    $stage = 'confirm_production_and_disabled_protocol';
    require $api . '/config.php';
    require $api . '/config-loader.php';
    api_load_optional_config();
    foreach (['QHP_GRADE_WRITES_V1', 'QHP_SHARED_GRADE_WRITES_V1', 'QHP_SEMESTER_STORES_V1', 'QHP_TRANSFER_WRITES_V1'] as $flag) {
        if (defined($flag) && constant($flag) === true) throw new RuntimeException('protocol_already_active');
    }
    if (DB_NAME !== 'u112851217_msht_io') throw new RuntimeException('unexpected_main_database');
    $pdo = new PDO('mysql:host=' . DB_HOST . (defined('DB_PORT') ? ';port=' . DB_PORT : '') . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET,
        DB_USER, DB_PASS, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::MYSQL_ATTR_MULTI_STATEMENTS => false]);
    if ($pdo->query('SELECT DATABASE()')->fetchColumn() !== 'u112851217_msht_io') throw new RuntimeException('unexpected_main_database');
    $before = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    if (count($before) !== 16 || array_intersect($tables, $before)) throw new RuntimeException('unexpected_existing_schema');
    $pdo->exec('SET SESSION lock_wait_timeout=3');
    $stage = 'create_only_two_empty_tables';
    foreach ($tables as $i => $table) {
        $pdo->exec($statements[$i]);
        $created[] = $table;
    }
    $stage = 'verify_exact_new_schema';
    $after = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    if (array_values(array_diff($after, $tables)) !== $before) throw new RuntimeException('unexpected_table_inventory');
    foreach ($tables as $table) {
        $definition = $pdo->query('SHOW CREATE TABLE `' . $table . '`')->fetch(PDO::FETCH_NUM);
        if (hash('sha256', $definition[1]) !== ($test['definitions_sha256'][$table] ?? null) ||
            $pdo->query('SELECT 1 FROM `' . $table . '` LIMIT 1')->fetchColumn() !== false) throw new RuntimeException('new_table_did_not_match_test');
    }
    echo json_encode(['status' => 'production_grade_tables_prepared', 'created_empty_tables' => $created,
        'same_definitions_as_verified_test' => true, 'backup_id' => $backupId, 'protocol_active' => false, 'existing_records_written' => false]) . "\n";
} catch (Throwable $error) {
    echo json_encode(['status' => 'production_grade_preparation_incomplete', 'stage' => $stage, 'ddl_returned_success_for' => $created,
        'reason' => !$error instanceof PDOException && preg_match('/^[a-z_]+$/D', $error->getMessage()) ? $error->getMessage() : null,
        'errno' => $error instanceof PDOException ? (int) ($error->errorInfo[1] ?? 0) : null, 'existing_records_written' => false]) . "\n";
    exit(1);
}
