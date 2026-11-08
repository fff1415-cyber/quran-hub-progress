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
function inspect_halaqa_shapes(PDO $pdo, int $cid): array {
    $sql = $pdo->prepare('SELECT h.id, COUNT(s.id) AS students FROM halaqat h LEFT JOIN students s ON s.complex_id=h.complex_id AND s.halaqa_id=h.id WHERE h.complex_id=? GROUP BY h.id ORDER BY h.id');
    $sql->execute([$cid]); $groups = [];
    foreach ($sql->fetchAll() as $row) $groups[(int)$row['id']] = ['students'=>(int)$row['students'],'weeks'=>0,
        'without_days'=>0,'nonobject_weeks'=>0,'empty_or_missing_days'=>0,'nonobject_day_entries'=>0,'weekly_only'=>0,'active_assignments'=>0,
        'current_week_missing'=>0,'placeholder_changes_if_snapshot_pending'=>0];
    $sql = $pdo->prepare("SELECT s.id,s.halaqa_id,(SELECT COUNT(*) FROM student_plan_assignments a WHERE a.student_id=s.id AND a.status IN ('active','frozen')) AS active_assignments FROM students s WHERE s.complex_id=?");
    $sql->execute([$cid]); $students = $sql->fetchAll();
    $snapshot = grade_write_snapshot($pdo,$cid);
    $store = $snapshot['value'];
    $semesterId = $snapshot['calendar_context']['active_semester_id'] ?? null;
    $today = (new DateTimeImmutable('now', new DateTimeZone('Asia/Riyadh')))->format('Y-m-d');
    $lookup = $pdo->prepare('SELECT week_number FROM academic_weeks WHERE semester_id=? AND start_date<=? ORDER BY start_date DESC LIMIT 1');
    $lookup->execute([$semesterId, $today]);
    $current = (int) ($lookup->fetchColumn() ?: 1);
    $lookup = $pdo->prepare('SELECT working_days FROM semesters WHERE id=? LIMIT 1');
    $lookup->execute([$semesterId]);
    $working = json_decode((string)$lookup->fetchColumn(), true);
    $workingCount = is_array($working) && count($working) > 0 ? count($working) : 5;
    foreach ($students as $student) {
        $group = (int)$student['halaqa_id'];
        if (!isset($groups[$group])) continue;
        $groups[$group]['active_assignments'] += (int)$student['active_assignments'];
        $weeks = $store->{$student['id']} ?? null;
        $groups[$group]['placeholder_changes_if_snapshot_pending'] += $workingCount + 2;
        if (!isset(((array)$weeks)[$current])) $groups[$group]['current_week_missing']++;
        if (!is_object($weeks) && !is_array($weeks)) continue;
        foreach ($weeks as $week) {
            $groups[$group]['weeks']++;
            if (!is_object($week)) { $groups[$group]['nonobject_weeks']++; continue; }
            if (!isset($week->days)) {
                $groups[$group]['without_days']++;
                if (isset($week->compensationFaces)||isset($week->compensationMurajaFaces)||isset($week->testMuraja)||isset($week->testRabt)||isset($week->sard)) $groups[$group]['weekly_only']++;
                continue;
            }
            if (count((array)$week->days) < 5) $groups[$group]['empty_or_missing_days']++;
            foreach ((array)$week->days as $day) if (!is_object($day)) $groups[$group]['nonobject_day_entries']++;
        }
    }
    return $groups;
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
    $halaqaShapes = inspect_halaqa_shapes($pdo, (int) $ids[0]);
    $pdo->rollBack();
    $success = !array_filter($report, static fn($result) => $result['status'] !== 200)
        && ($report['app_state_compact']['stores']['grades']['bytes'] ?? null) === 2
        && $report['atomic_grades']['valid_snapshot'] === true;
    echo json_encode(['status'=>'manager_read_probe','published_sha'=>$expected,'compact_and_atomic_reads_verified'=>$success,'results'=>$report,'confirmed_browser_receipts'=>$receipts,'halaqa_shapes'=>$halaqaShapes,'production_writes'=>false], JSON_THROW_ON_ERROR) . "\n";
    if (!$success) exit(1);
} catch (Throwable $error) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    echo json_encode(['status'=>'manager_probe_incomplete','class'=>get_class($error),
        'stage'=>preg_match('/^[a-z_]+$/D',$error->getMessage())?$error->getMessage():null,'production_writes'=>false]) . "\n";
    exit(1);
}
