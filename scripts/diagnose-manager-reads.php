<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
function db(): PDO { return $GLOBALS['probePdo']; }
function require_auth(): array { return ['role' => 'manager', 'complexId' => $GLOBALS['probeComplex']]; }
function require_complex_id(array $auth): int { return $auth['complexId']; }
function table_column_exists(PDO $pdo, string $table, string $column): bool {
    $query = $pdo->prepare('SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?');
    $query->execute([$table, $column]);
    return (int) $query->fetchColumn() === 1;
}
class ManagerProbeResponse extends RuntimeException {
    public function __construct(public mixed $body, int $status) { parent::__construct('', $status); }
}
function json_response(mixed $data, int $status = 200): never { throw new ManagerProbeResponse($data, $status); }
function error_response(string $message, int $status = 400): never { throw new ManagerProbeResponse(['error' => $message], $status); }
function summarize_manager_response(mixed $value, string $label): array {
    $out = ['bytes' => strlen(json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE))];
    if (in_array($label, ['app_state','app_state_compact'], true)) {
        $keys = ['grades','weekly_tests','weekly_tests_settings','staff_attendance','staff_attendance_settings','sard_queue','sard_history','academic_records','halaqa_programs','halaqa_program_grades','scientific_grades','message_templates','late_permissions','student_portal_settings','push_notification_settings','complex_features','financial_ledger','tarbawi_program'];
        foreach ($value as $row) if (in_array($row['key'] ?? null, $keys, true)) {
            $body = $row['value'];
            $out['stores'][$row['key']] = ['type' => get_debug_type($body), 'list' => is_array($body) && array_is_list($body),
                'bytes' => strlen(json_encode($body, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE))];
            if ($row['key'] === 'scientific_grades') {
                $configs = is_array($body['configs'] ?? null) ? $body['configs'] : [];
                $out['scientific_config_shape'] = ['configs'=>count($configs),'missing_default_scores'=>0,'legacy_attendance_defaults'=>0];
                foreach ($configs as $config) {
                    if (!is_array($config['defaultScores'] ?? null)) $out['scientific_config_shape']['missing_default_scores']++;
                    if (is_string($config['defaultScores']['attendance'] ?? null)) $out['scientific_config_shape']['legacy_attendance_defaults']++;
                }
            }
        }
    }
    if ($label === 'atomic_grades') $out['valid_snapshot'] = ($value['protocol'] ?? null) === 1 && $value['value'] instanceof stdClass && ($value['calendar_context']['known'] ?? null) === true;
    return $out;
}
try {
    $root = $argv[1];
    $expected = $argv[2] ?? '';
    if (!preg_match('~^/home/[A-Za-z0-9_-]+/domains/msht\.io/public_html$~D', $root) ||
        !preg_match('/^[0-9a-f]{40}$/D', $expected) || realpath($root) !== $root ||
        trim(file_get_contents($root . '/deploy-sha.txt')) !== $expected) throw new RuntimeException('unexpected_site_scope');
    require $root . '/api/config.php';
    require $root . '/api/config-loader.php';
    api_load_optional_config();
    if (DB_NAME !== 'u112851217_msht_io') throw new RuntimeException('unexpected_database');
    $pdo = new PDO('mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET,
        DB_USER, DB_PASS, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $GLOBALS['probePdo'] = $pdo;
    $pdo->exec('SET TRANSACTION READ ONLY'); $pdo->beginTransaction();
    $query = $pdo->prepare('SELECT id FROM complexes WHERE subdomain=?');
    $query->execute(['mm']);
    $ids = $query->fetchAll(PDO::FETCH_COLUMN);
    if (count($ids) !== 1) throw new RuntimeException('manager_complex_not_unique');
    $GLOBALS['probeComplex'] = (int) $ids[0];
    foreach (['students','halaqat','semesters','plans','app_state'] as $route) require_once $root . '/api/routes/' . $route . '.php';
    $reads = [
        'students' => ['handle_list_students', []], 'halaqat' => ['handle_list_halaqat', []],
        'active_semester' => ['handle_get_active_semester', []], 'app_state' => ['handle_list_app_state', []],
        'app_state_compact' => ['handle_list_app_state', ['omit_grade_value'=>'1']],
        'atomic_grades' => ['handle_list_app_state', ['key'=>'grades','grade_protocol'=>'1']],
    ];
    foreach ($reads as $label => [$handler, $params]) {
        $_GET = $params;
        $started = hrtime(true);
        try { $handler(); $result = ['status'=>'no_response']; }
        catch (ManagerProbeResponse $response) {
            $result = ['status'=>$response->getCode()];
            if ($response->getCode() === 200) $result += summarize_manager_response($response->body, $label);
            elseif (isset($response->body['error'])) $result['message'] = $response->body['error'];
        } catch (Throwable $error) {
            $result = ['status'=>500, 'class'=>get_class($error)];
            if ($error instanceof PDOException) $result['sqlstate'] = $error->errorInfo[0] ?? null;
            else {
                $message = $error->getMessage();
                $result['file'] = basename($error->getFile());
                $result['line'] = $error->getLine();
                if (preg_match('/^[\p{Arabic}\p{P} ]{1,200}$/u', $message) || str_starts_with($message, 'Call to undefined function')) $result['message'] = $message;
            }
        }
        $report[$label] = $result + ['elapsed_ms'=>round((hrtime(true)-$started)/1000000,1)];
    }
    $receipts = (int) $pdo->query("SELECT COUNT(*) FROM grade_operation_receipts WHERE store_key='grades' AND operation_id REGEXP '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'")->fetchColumn();
    $pdo->rollBack();
    $success = !array_filter($report, static fn($result) => $result['status'] !== 200)
        && ($report['app_state_compact']['stores']['grades']['bytes'] ?? null) === 2
        && $report['atomic_grades']['valid_snapshot'] === true;
    echo json_encode(['status'=>'manager_read_probe','published_sha'=>$expected,'compact_and_atomic_reads_verified'=>$success,'results'=>$report,'confirmed_browser_receipts'=>$receipts,'production_writes'=>false], JSON_THROW_ON_ERROR) . "\n";
    if (!$success) exit(1);
} catch (Throwable $error) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    echo json_encode(['status'=>'manager_probe_incomplete','class'=>get_class($error),
        'stage'=>preg_match('/^[a-z_]+$/D',$error->getMessage())?$error->getMessage():null,'production_writes'=>false]) . "\n";
    exit(1);
}
