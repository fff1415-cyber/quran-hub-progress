<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);

function table_column_exists(PDO $pdo, string $table, string $column): bool {
    $query = $pdo->prepare('SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?');
    $query->execute([$table, $column]);
    return (int) $query->fetchColumn() === 1;
}
function require_rehearsal(bool $passed, string $reason): void {
    if (!$passed) throw new RuntimeException($reason);
}
function grade_state_digest(PDO $pdo): string {
    $rows = $pdo->query("SELECT complex_id,value FROM app_state WHERE `key`='grades' ORDER BY complex_id")->fetchAll(PDO::FETCH_ASSOC);
    return hash('sha256', serialize($rows));
}
function receipt_count(PDO $pdo): int {
    return (int) $pdo->query('SELECT COUNT(*) FROM grade_operation_receipts')->fetchColumn();
}

$stage = 'test_identity';
try {
    $home = realpath($argv[1] ?? '');
    $target = 'u112851217_msht_test';
    require_rehearsal($home && $home === $argv[1], 'invalid_home');
    $private = $home . '/.qhp-private';
    $path = $private . '/msht-test.php';
    foreach ([$private, $path] as $item) require_rehearsal(realpath($item) === $item && !is_link($item) && (fileperms($item) & 0077) === 0, 'unsafe_private_configuration');
    $lockPath = $private . '/test-restore.lock';
    require_rehearsal(!is_link($lockPath), 'unsafe_test_lock');
    $lock = fopen($lockPath, 'c');
    require_rehearsal($lock && flock($lock, LOCK_EX | LOCK_NB), 'test_database_busy');
    $settings = qhp_load_private_test_config(file_get_contents($path));
    require_rehearsal(preg_match('/^[A-Za-z0-9.:-]+$/D', $settings['host']) === 1, 'invalid_test_host');
    $pdo = new PDO('mysql:host=' . $settings['host'] . ';dbname=' . $target . ';charset=utf8mb4', $settings['user'], $settings['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::MYSQL_ATTR_MULTI_STATEMENTS => false, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    qhp_restore_identity($pdo, $target);
    $stage = 'read_existing_grade_stores';
    $pdo->exec('SET TRANSACTION READ ONLY');
    $pdo->beginTransaction();
    $initial = grade_state_digest($pdo);
    $receipts = receipt_count($pdo);
    $versions = (int) $pdo->query('SELECT COUNT(*) FROM grade_cell_versions')->fetchColumn();
    $scopes = $pdo->query("SELECT complex_id FROM app_state WHERE `key`='grades' ORDER BY complex_id")->fetchAll(PDO::FETCH_COLUMN);
    $writable = null;
    $unknown = 0;
    foreach ($scopes as $scope) {
        $snapshot = grade_write_snapshot($pdo, (int) $scope);
        require_rehearsal($snapshot['protocol'] === 1 && $snapshot['context_complex_id'] === (int) $scope && $snapshot['value'] instanceof stdClass, 'invalid_grade_snapshot');
        if (!$snapshot['calendar_context']['known']) $unknown++;
        else $writable ??= (int) $scope;
    }
    $pdo->rollBack();
    require_rehearsal($scopes && $writable !== null, 'no_grade_scope_for_rehearsal');
    require_rehearsal($unknown === 0, 'ambiguous_restored_grade_calendar');

    $stage = 'synthetic_write_inside_test_transaction';
    $pdo->beginTransaction();
    $key = 'qhp-test-' . bin2hex(random_bytes(12));
    $teacherPath = [$key, '1', 'days', 'sun', 'attendance'];
    $assistantPath = [$key, '1', 'days', 'mon', 'attendance'];
    $initialCapture = grade_cells_capture($pdo, $writable, 'grades', [$teacherPath, $assistantPath]);
    $tokens = ['teacher', 'assistant'];
    foreach ([$teacherPath, $assistantPath] as $i => $cell) {
        $packet = ['operation_id' => $key . '-' . $i, 'calendar_context' => $initialCapture['calendar_context'],
            'changes' => [$initialCapture['cells'][$i] + ['next' => ['present' => true, 'value' => 'present']]]];
        $result = grade_write_request($pdo, $writable, $packet, ['role' => $tokens[$i]]);
        require_rehearsal($result['operation_id'] === $packet['operation_id'] && !$result['replayed'], 'unexpected_write_receipt');
        $replay = grade_write_request($pdo, $writable, $packet, ['role' => $tokens[$i]]);
        require_rehearsal($replay['replayed'] && hash_equals($result['input_sha256'], $replay['input_sha256']), 'replay_not_exact');
    }
    $saved = grade_write_snapshot($pdo, $writable);
    foreach ([$teacherPath, $assistantPath] as $cell) {
        require_rehearsal(grade_cells_at($saved['value'], $cell) === ['present' => true, 'value' => 'present'], 'peer_value_missing');
    }
    require_rehearsal(receipt_count($pdo) === $receipts + 2, 'duplicate_receipt');
    require_rehearsal($pdo->inTransaction(), 'outer_test_transaction_lost');
    $pdo->rollBack();
    $stage = 'verify_test_data_unchanged';
    require_rehearsal(grade_state_digest($pdo) === $initial && receipt_count($pdo) === $receipts &&
        (int) $pdo->query('SELECT COUNT(*) FROM grade_cell_versions')->fetchColumn() === $versions, 'rehearsal_left_changes');
    echo json_encode(['status' => 'restored_grade_protocol_rehearsal_passed', 'grade_stores_read' => count($scopes),
        'synthetic_receipts_verified' => 2, 'all_synthetic_changes_rolled_back' => true, 'production_database_connected' => false]) . "\n";
} catch (Throwable $error) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    echo json_encode(['status' => 'restored_grade_rehearsal_incomplete', 'stage' => $stage,
        'reason' => !$error instanceof PDOException && preg_match('/^[a-z_]+$/D', $error->getMessage()) ? $error->getMessage() : null,
        'errno' => $error instanceof PDOException ? (int) ($error->errorInfo[1] ?? 0) : null,
        'production_database_connected' => false]) . "\n";
    exit(1);
}
