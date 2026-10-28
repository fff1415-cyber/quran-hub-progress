<?php
declare(strict_types=1);

/** CLI-only release readiness. SELECT-only; never calls application routes. */
function audit_release_readiness(PDO $pdo): array
{
    $tables = $pdo->query('SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()')->fetchAll(PDO::FETCH_KEY_PAIR);
    $required = ['students', 'education_plans', 'plan_segments', 'student_plan_assignments', 'segment_completions', 'semesters', 'app_state'];
    $missing = array_values(array_diff($required, array_keys($tables)));
    $nonTransactional = array_values(array_filter($required, static fn($name) => isset($tables[$name]) && strcasecmp((string)$tables[$name], 'InnoDB') !== 0));
    $report = ['database_version' => (string)$pdo->query('SELECT VERSION()')->fetchColumn(), 'missing_tables' => $missing, 'non_transactional_tables' => $nonTransactional, 'blockers' => []];
    if ($missing || $nonTransactional) {
        $report['blockers'][] = 'schema_or_storage_requires_review';
        return $report;
    }
    $column = static function(string $table, string $name) use ($pdo): bool {
        $s = $pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
        $s->execute([$table, $name]);
        return (bool)$s->fetchColumn();
    };
    $report['duplicate_current_students'] = (int)$pdo->query("SELECT COUNT(*) FROM (SELECT student_id FROM student_plan_assignments WHERE status IN ('active','frozen') GROUP BY student_id HAVING COUNT(*) > 1) duplicates")->fetchColumn();
    $hasAssignment = $column('segment_completions', 'assignment_id');
    $report['unattributed_plan_completions'] = (int)$pdo->query($hasAssignment
        ? 'SELECT COUNT(*) FROM segment_completions c LEFT JOIN student_plan_assignments a ON a.id = c.assignment_id AND a.student_id = c.student_id AND a.plan_id = c.plan_id WHERE a.id IS NULL'
        : 'SELECT COUNT(*) FROM segment_completions')->fetchColumn();
    $report['integrity_migrations_present'] = isset($tables['plan_assignment_completions'], $tables['plan_operations'], $tables['plan_diary_events']) && $column('student_plan_assignments', 'content_snapshot') && $column('plan_operations', 'input_json');
    $report['legacy_semester_rows'] = ['grades' => 0, 'weekly_tests' => 0, 'scientific_grades' => 0];
    $report['invalid_state_json_rows'] = 0;
    $rows = $pdo->query("SELECT `key`, value FROM app_state WHERE `key` IN ('grades','weekly_tests','scientific_grades')");
    while ($row = $rows->fetch(PDO::FETCH_ASSOC)) {
        $raw = json_decode((string)$row['value'], true);
        if (json_last_error() !== JSON_ERROR_NONE) { $report['invalid_state_json_rows']++; continue; }
        $envelope = is_array($raw) && ($raw['integrity_version'] ?? null) === 1;
        $legacy = $envelope ? ($raw['legacy'] ?? null) : $raw;
        if ($envelope && !empty($raw['legacy_reviewed'])) continue;
        $hasLegacy = $row['key'] === 'scientific_grades'
            ? !empty($legacy['data']) || !empty($legacy['overrides'])
            : is_array($legacy) && count($legacy) > 0;
        if ($hasLegacy) $report['legacy_semester_rows'][$row['key']]++;
    }
    $scope = $column('semesters', 'complex_id') ? 'complex_id' : '1';
    $report['multiple_active_semester_groups'] = (int)$pdo->query("SELECT COUNT(*) FROM (SELECT $scope AS scope_key FROM semesters WHERE is_active = 1 GROUP BY scope_key HAVING COUNT(*) > 1) duplicates")->fetchColumn();
    foreach (['duplicate_current_students', 'unattributed_plan_completions', 'invalid_state_json_rows', 'multiple_active_semester_groups'] as $key) if ($report[$key] > 0) $report['blockers'][] = $key;
    if (array_sum($report['legacy_semester_rows']) > 0) $report['blockers'][] = 'legacy_semester_attribution_requires_evidence';
    return $report;
}

if (PHP_SAPI === 'cli' && ($argv[1] ?? '') === '--production-readiness') {
    // Configuration stays on the server. No credentials, names, IDs or scores in output.
    ini_set('display_errors', '0');
    try {
        $api = realpath((string)($argv[2] ?? ''));
        if (!$api || !is_file($api . '/config.php')) throw new RuntimeException('Missing API configuration');
        require $api . '/config.php';
        $pdo = new PDO('mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . (defined('DB_CHARSET') ? DB_CHARSET : 'utf8mb4'), DB_USER, DB_PASS, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
        $pdo->exec('SET TRANSACTION READ ONLY');
        $pdo->beginTransaction();
        $report = audit_release_readiness($pdo);
        $pdo->rollBack();
        echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . "\n";
    } catch (Throwable $error) {
        if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
        fwrite(STDERR, "Release readiness could not complete; configuration and query details withheld.\n");
        exit(1);
    }
}
