<?php

declare(strict_types=1);

require_once __DIR__ . '/complex_branding.php';

const KIOSK_DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** @return array{enabled: bool, token: string} */
function kiosk_default_settings(): array
{
    return ['enabled' => false, 'token' => ''];
}

function kiosk_settings_key(): string
{
    return 'kiosk_settings';
}

function kiosk_load_settings(PDO $pdo, int $complexId): array
{
    $tenants = app_state_tenant_enabled($pdo);
    if ($tenants) {
        $stmt = $pdo->prepare('SELECT value FROM app_state WHERE complex_id = ? AND `key` = ? LIMIT 1');
        $stmt->execute([$complexId, kiosk_settings_key()]);
    } else {
        $stmt = $pdo->prepare('SELECT value FROM app_state WHERE `key` = ? LIMIT 1');
        $stmt->execute([kiosk_settings_key()]);
    }
    $raw = $stmt->fetchColumn();
    if ($raw === false || $raw === '') {
        return kiosk_default_settings();
    }
    $decoded = json_decode((string) $raw, true);
    if (!is_array($decoded)) {
        return kiosk_default_settings();
    }
    return [
        'enabled' => !empty($decoded['enabled']),
        'token' => (string) ($decoded['token'] ?? ''),
    ];
}

function kiosk_save_settings(PDO $pdo, int $complexId, array $settings): void
{
    $payload = json_encode([
        'enabled' => !empty($settings['enabled']),
        'token' => (string) ($settings['token'] ?? ''),
    ], JSON_UNESCAPED_UNICODE);
    $tenants = app_state_tenant_enabled($pdo);
    if ($tenants) {
        $sql = 'INSERT INTO app_state (`complex_id`, `key`, value) VALUES (:complex_id, :key, :value)
                ON DUPLICATE KEY UPDATE value = VALUES(value)';
        $pdo->prepare($sql)->execute([':complex_id' => $complexId, ':key' => kiosk_settings_key(), ':value' => $payload]);
    } else {
        $sql = 'INSERT INTO app_state (`key`, value) VALUES (:key, :value)
                ON DUPLICATE KEY UPDATE value = VALUES(value)';
        $pdo->prepare($sql)->execute([':key' => kiosk_settings_key(), ':value' => $payload]);
    }
}

function kiosk_token_from_request(): string
{
    $header = $_SERVER['HTTP_X_KIOSK_TOKEN'] ?? '';
    if (is_string($header) && trim($header) !== '') {
        return trim($header);
    }
    $q = trim((string) ($_GET['token'] ?? ''));
    if ($q !== '') {
        return $q;
    }
    $input = json_input();
    return trim((string) ($input['token'] ?? ''));
}

/** @return array{complex_id: int, settings: array} */
function kiosk_require_token(PDO $pdo, string $token): array
{
    if ($token === '') {
        error_response('رمز الكيوسك مطلوب', 401);
    }
    $tenants = app_state_tenant_enabled($pdo);
    if ($tenants) {
        $stmt = $pdo->prepare('SELECT complex_id, value FROM app_state WHERE `key` = ?');
        $stmt->execute([kiosk_settings_key()]);
        foreach ($stmt->fetchAll() as $row) {
            $settings = json_decode((string) ($row['value'] ?? ''), true);
            if (!is_array($settings)) {
                continue;
            }
            if (!empty($settings['enabled']) && hash_equals((string) ($settings['token'] ?? ''), $token)) {
                return ['complex_id' => (int) $row['complex_id'], 'settings' => $settings];
            }
        }
    } else {
        $settings = kiosk_load_settings($pdo, 1);
        if (!empty($settings['enabled']) && hash_equals((string) ($settings['token'] ?? ''), $token)) {
            return ['complex_id' => 1, 'settings' => $settings];
        }
    }
    error_response('رمز الكيوسك غير صالح أو معطّل', 403);
}

function kiosk_branding_payload(PDO $pdo, int $complexId): array
{
    $brand = complex_branding_fetch($pdo, $complexId);
    return [
        'brandName' => $brand['name'] ?? 'المجمع',
        'logoUrl' => $brand['logo_url'] ?? null,
        'primaryColor' => $brand['primary_color'] ?? '#1e3a5f',
        'themeKey' => $brand['theme_key'] ?? 'navy',
    ];
}

function kiosk_decode_json_array(mixed $raw): array
{
    if (is_array($raw)) {
        return $raw;
    }
    if (is_string($raw) && $raw !== '') {
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }
    return [];
}

function kiosk_working_day_keys(array $workingDays): array
{
    $keys = [];
    foreach ($workingDays as $d) {
        $idx = (int) $d;
        if ($idx >= 0 && $idx <= 6) {
            $keys[] = KIOSK_DAY_KEYS[$idx];
        }
    }
    if ($keys === []) {
        return ['sun', 'mon', 'tue', 'wed', 'thu'];
    }
    return $keys;
}

function kiosk_today_day_key(): string
{
    return KIOSK_DAY_KEYS[(int) date('w')] ?? 'sun';
}

function kiosk_today_iso(): string
{
    return date('Y-m-d');
}

function kiosk_resolve_week_number(array $weeks, string $isoDate): int
{
    if ($weeks === []) {
        return 1;
    }
    foreach ($weeks as $w) {
        $start = (string) ($w['start_date'] ?? '');
        $end = (string) ($w['end_date'] ?? '');
        if ($start !== '' && $end !== '' && $isoDate >= $start && $isoDate <= $end) {
            return (int) ($w['week_number'] ?? 1);
        }
    }
    $first = $weeks[0];
    if (!empty($first['start_date']) && $isoDate < (string) $first['start_date']) {
        return (int) ($first['week_number'] ?? 1);
    }
    $last = $weeks[count($weeks) - 1];
    return (int) ($last['week_number'] ?? 1);
}

function kiosk_empty_day(): array
{
    return [
        'attendance' => '',
        'hifz' => '',
        'rabt' => '',
        'muraja' => '',
        'wajib' => false,
    ];
}

function kiosk_empty_week(array $workingDayKeys): array
{
    $days = [];
    foreach ($workingDayKeys as $key) {
        $days[$key] = kiosk_empty_day();
    }
    return [
        'days' => $days,
        'testMuraja' => false,
        'testRabt' => false,
        'sard' => false,
        'compensationFaces' => 0,
        'compensationPlanSegments' => [],
    ];
}

function kiosk_load_grades(PDO $pdo, int $complexId): array
{
    $tenants = app_state_tenant_enabled($pdo);
    if ($tenants) {
        $stmt = $pdo->prepare('SELECT value FROM app_state WHERE complex_id = ? AND `key` = ? LIMIT 1');
        $stmt->execute([$complexId, 'grades']);
    } else {
        $stmt = $pdo->prepare('SELECT value FROM app_state WHERE `key` = ? LIMIT 1');
        $stmt->execute(['grades']);
    }
    $raw = $stmt->fetchColumn();
    if ($raw === false || $raw === '') {
        return [];
    }
    $decoded = json_decode((string) $raw, true);
    return is_array($decoded) ? $decoded : [];
}

function kiosk_save_grades(PDO $pdo, int $complexId, array $grades): void
{
    $payload = json_encode($grades, JSON_UNESCAPED_UNICODE);
    $tenants = app_state_tenant_enabled($pdo);
    if ($tenants) {
        $sql = 'INSERT INTO app_state (`complex_id`, `key`, value) VALUES (:complex_id, :key, :value)
                ON DUPLICATE KEY UPDATE value = VALUES(value)';
        $pdo->prepare($sql)->execute([':complex_id' => $complexId, ':key' => 'grades', ':value' => $payload]);
    } else {
        $sql = 'INSERT INTO app_state (`key`, value) VALUES (:key, :value)
                ON DUPLICATE KEY UPDATE value = VALUES(value)';
        $pdo->prepare($sql)->execute([':key' => 'grades', ':value' => $payload]);
    }
}

/** @return array{semester: ?array, weeks: array} */
function kiosk_active_semester(PDO $pdo, int $complexId): array
{
    $tenants = semesters_tenant_enabled($pdo);
    if ($tenants) {
        $stmt = $pdo->prepare(
            'SELECT id, name, start_date, weeks_count, working_days, excluded_dates, is_active
             FROM semesters WHERE complex_id = ? AND is_active = 1 LIMIT 1'
        );
        $stmt->execute([$complexId]);
        $semester = $stmt->fetch();
    } else {
        $semester = $pdo->query(
            'SELECT id, name, start_date, weeks_count, working_days, excluded_dates, is_active
             FROM semesters WHERE is_active = 1 LIMIT 1'
        )->fetch();
    }
    if (!$semester) {
        return ['semester' => null, 'weeks' => []];
    }
    $weekStmt = $pdo->prepare(
        'SELECT week_number, start_date, end_date FROM academic_weeks WHERE semester_id = ? ORDER BY week_number'
    );
    $weekStmt->execute([$semester['id']]);
    $weeks = $weekStmt->fetchAll();
    return [
        'semester' => [
            'id' => $semester['id'],
            'working_days' => kiosk_decode_json_array($semester['working_days'] ?? '[]'),
        ],
        'weeks' => $weeks,
    ];
}

function kiosk_find_student(PDO $pdo, int $complexId, string $studentId): ?array
{
    $tenants = table_column_exists($pdo, 'students', 'complex_id');
    if ($tenants) {
        $stmt = $pdo->prepare('SELECT id, name, halaqa_id FROM students WHERE id = ? AND complex_id = ? LIMIT 1');
        $stmt->execute([$studentId, $complexId]);
    } else {
        $stmt = $pdo->prepare('SELECT id, name, halaqa_id FROM students WHERE id = ? LIMIT 1');
        $stmt->execute([$studentId]);
    }
    $row = $stmt->fetch();
    return $row ?: null;
}

function handle_kiosk_session(): void
{
    $pdo = db();
    $token = kiosk_token_from_request();
    $ctx = kiosk_require_token($pdo, $token);
    $cid = $ctx['complex_id'];
    json_response([
        'ok' => true,
        ...kiosk_branding_payload($pdo, $cid),
    ]);
}

function handle_kiosk_check_in(): void
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        error_response('Method not allowed', 405);
    }
    $pdo = db();
    $token = kiosk_token_from_request();
    $ctx = kiosk_require_token($pdo, $token);
    $cid = $ctx['complex_id'];

    $input = json_input();
    $studentId = trim((string) ($input['studentId'] ?? $input['student_id'] ?? ''));
    if ($studentId === '') {
        json_response(['status' => 'invalid_qr', 'message' => 'رمز غير صالح']);
        return;
    }

    $student = kiosk_find_student($pdo, $cid, $studentId);
    if (!$student) {
        json_response(['status' => 'invalid_qr', 'message' => 'الطالب غير موجود']);
        return;
    }

    $cal = kiosk_active_semester($pdo, $cid);
    if ($cal['semester'] === null) {
        json_response(['status' => 'error', 'message' => 'لا يوجد فصل دراسي نشط']);
        return;
    }

    $workingKeys = kiosk_working_day_keys($cal['semester']['working_days']);
    $dayKey = kiosk_today_day_key();
    if (!in_array($dayKey, $workingKeys, true)) {
        json_response([
            'status' => 'not_working_day',
            'message' => 'اليوم ليس يوم دراسة',
            'studentName' => $student['name'],
        ]);
        return;
    }

    $iso = kiosk_today_iso();
    $weekNum = kiosk_resolve_week_number($cal['weeks'], $iso);
    $weekKey = (string) $weekNum;
    $sid = (string) $student['id'];

    $grades = kiosk_load_grades($pdo, $cid);
    if (!isset($grades[$sid]) || !is_array($grades[$sid])) {
        $grades[$sid] = [];
    }
    if (!isset($grades[$sid][$weekKey]) || !is_array($grades[$sid][$weekKey])) {
        $grades[$sid][$weekKey] = kiosk_empty_week($workingKeys);
    }

    $week = $grades[$sid][$weekKey];
    if (!isset($week['days']) || !is_array($week['days'])) {
        $week['days'] = [];
    }
    foreach ($workingKeys as $k) {
        if (!isset($week['days'][$k]) || !is_array($week['days'][$k])) {
            $week['days'][$k] = kiosk_empty_day();
        }
    }

    $current = $week['days'][$dayKey]['attendance'] ?? '';
    if ($current === 'present') {
        json_response([
            'status' => 'already_checked_in',
            'message' => 'تم تحضيرك مسبقاً',
            'studentName' => $student['name'],
        ]);
        return;
    }
    if ($current === 'late' || $current === 'excused') {
        json_response([
            'status' => 'already_checked_in',
            'message' => 'مسجّل مسبقاً اليوم',
            'studentName' => $student['name'],
        ]);
        return;
    }

    $week['days'][$dayKey]['attendance'] = 'present';
    $grades[$sid][$weekKey] = $week;
    kiosk_save_grades($pdo, $cid, $grades);

    json_response([
        'status' => 'success',
        'message' => 'تم التحضير بنجاح',
        'studentName' => $student['name'],
        'week' => $weekNum,
        'dayKey' => $dayKey,
    ]);
}

function handle_kiosk_get_settings(): void
{
    $auth = require_auth();
    if (($auth['role'] ?? '') !== 'manager') {
        error_response('Forbidden — managers only', 403);
    }
    $cid = require_complex_id($auth);
    $pdo = db();
    $settings = kiosk_load_settings($pdo, $cid);
    $brand = kiosk_branding_payload($pdo, $cid);
    $origin = ($_SERVER['HTTP_ORIGIN'] ?? '') ?: (((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost'));
    $kioskUrl = rtrim($origin, '/') . '/kiosk';
    if ($settings['token'] !== '') {
        $kioskUrl .= '?token=' . urlencode($settings['token']);
    }
    json_response([
        'settings' => $settings,
        'kioskUrl' => $kioskUrl,
        ...$brand,
    ]);
}

function handle_kiosk_put_settings(): void
{
    $auth = require_auth();
    if (($auth['role'] ?? '') !== 'manager') {
        error_response('Forbidden — managers only', 403);
    }
    $cid = require_complex_id($auth);
    $pdo = db();
    $input = json_input();
    $current = kiosk_load_settings($pdo, $cid);

    $enabled = array_key_exists('enabled', $input) ? !empty($input['enabled']) : $current['enabled'];
    $regenerate = !empty($input['regenerate']);
    $token = $current['token'];
    if ($regenerate || $token === '') {
        $token = bin2hex(random_bytes(24));
    }

    $next = ['enabled' => $enabled, 'token' => $token];
    kiosk_save_settings($pdo, $cid, $next);

    handle_kiosk_get_settings();
}
