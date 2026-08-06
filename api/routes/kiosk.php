<?php

declare(strict_types=1);

require_once __DIR__ . '/complex_branding.php';

const KIOSK_DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** @return array<string, mixed> */
function kiosk_default_settings(): array
{
    return [
        'enabled' => false,
        'token' => '',
        'open_minutes_after_asr' => 0,
        'present_minutes_after_asr' => 20,
        'close_minutes_after_asr' => 55,
        'city' => 'Buraydah',
        'country' => 'Saudi Arabia',
        'prayer_method' => 4,
    ];
}

/** @param array<string, mixed> $decoded */
function kiosk_normalize_settings(array $decoded): array
{
    $defaults = kiosk_default_settings();
    $open = (int) ($decoded['open_minutes_after_asr'] ?? $defaults['open_minutes_after_asr']);
    $present = (int) ($decoded['present_minutes_after_asr'] ?? $defaults['present_minutes_after_asr']);
    $close = (int) ($decoded['close_minutes_after_asr'] ?? $defaults['close_minutes_after_asr']);
    $method = (int) ($decoded['prayer_method'] ?? $defaults['prayer_method']);
    $city = trim((string) ($decoded['city'] ?? $defaults['city']));
    $country = trim((string) ($decoded['country'] ?? $defaults['country']));

    $openMin = max(0, min(180, $open >= 0 ? $open : 0));
    $presentMin = max(0, min(180, $present >= 0 ? $present : 20));
    $closeMin = max(1, min(180, $close > 0 ? $close : 55));
    if ($presentMin < $openMin) {
        $presentMin = $openMin;
    }
    if ($closeMin < $presentMin) {
        $closeMin = $presentMin;
    }

    return [
        'enabled' => !empty($decoded['enabled']),
        'token' => (string) ($decoded['token'] ?? ''),
        'open_minutes_after_asr' => $openMin,
        'present_minutes_after_asr' => $presentMin,
        'close_minutes_after_asr' => $closeMin,
        'city' => $city !== '' ? $city : (string) $defaults['city'],
        'country' => $country !== '' ? $country : (string) $defaults['country'],
        'prayer_method' => max(1, min(15, $method > 0 ? $method : 4)),
    ];
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
    return kiosk_normalize_settings($decoded);
}

function kiosk_save_settings(PDO $pdo, int $complexId, array $settings): void
{
    $normalized = kiosk_normalize_settings($settings);
    $payload = json_encode($normalized, JSON_UNESCAPED_UNICODE);
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

function kiosk_timezone(): DateTimeZone
{
    return new DateTimeZone('Asia/Riyadh');
}

function kiosk_now(): DateTimeImmutable
{
    return new DateTimeImmutable('now', kiosk_timezone());
}

function kiosk_asr_cache_key(int $complexId, string $isoDate): string
{
    return 'kiosk_asr_' . $complexId . '_' . $isoDate;
}

function kiosk_load_asr_cache(PDO $pdo, int $complexId, string $isoDate): ?string
{
    $key = kiosk_asr_cache_key($complexId, $isoDate);
    $tenants = app_state_tenant_enabled($pdo);
    if ($tenants) {
        $stmt = $pdo->prepare('SELECT value FROM app_state WHERE complex_id = ? AND `key` = ? LIMIT 1');
        $stmt->execute([$complexId, $key]);
    } else {
        $stmt = $pdo->prepare('SELECT value FROM app_state WHERE `key` = ? LIMIT 1');
        $stmt->execute([$key]);
    }
    $raw = $stmt->fetchColumn();
    if ($raw === false || $raw === '') {
        return null;
    }
    $hhmm = trim((string) $raw);
    return preg_match('/^\d{2}:\d{2}$/', $hhmm) ? $hhmm : null;
}

function kiosk_save_asr_cache(PDO $pdo, int $complexId, string $isoDate, string $hhmm): void
{
    $key = kiosk_asr_cache_key($complexId, $isoDate);
    $tenants = app_state_tenant_enabled($pdo);
    if ($tenants) {
        $sql = 'INSERT INTO app_state (`complex_id`, `key`, value) VALUES (:complex_id, :key, :value)
                ON DUPLICATE KEY UPDATE value = VALUES(value)';
        $pdo->prepare($sql)->execute([':complex_id' => $complexId, ':key' => $key, ':value' => $hhmm]);
    } else {
        $sql = 'INSERT INTO app_state (`key`, value) VALUES (:key, :value)
                ON DUPLICATE KEY UPDATE value = VALUES(value)';
        $pdo->prepare($sql)->execute([':key' => $key, ':value' => $hhmm]);
    }
}

/** @param array<string, mixed> $settings */
function kiosk_fetch_asr_hhmm(PDO $pdo, int $complexId, string $isoDate, array $settings): ?string
{
    $cached = kiosk_load_asr_cache($pdo, $complexId, $isoDate);
    if ($cached !== null) {
        return $cached;
    }

    $parts = explode('-', $isoDate);
    if (count($parts) !== 3) {
        return null;
    }
    [$y, $mo, $d] = $parts;
    $city = (string) ($settings['city'] ?? 'Buraydah');
    $country = (string) ($settings['country'] ?? 'Saudi Arabia');
    $method = (int) ($settings['prayer_method'] ?? 4);
    $url = 'https://api.aladhan.com/v1/timingsByCity/'
        . rawurlencode("{$d}-{$mo}-{$y}")
        . '?city=' . rawurlencode($city)
        . '&country=' . rawurlencode($country)
        . '&method=' . $method;

    $ctx = stream_context_create(['http' => ['timeout' => 10, 'ignore_errors' => true]]);
    $raw = @file_get_contents($url, false, $ctx);
    if ($raw === false || $raw === '') {
        return null;
    }
    $json = json_decode($raw, true);
    if (!is_array($json)) {
        return null;
    }
    $asr = $json['data']['timings']['Asr'] ?? null;
    if (!is_string($asr) || $asr === '') {
        return null;
    }
    $hhmm = substr(explode(' ', trim($asr))[0], 0, 5);
    if (!preg_match('/^\d{2}:\d{2}$/', $hhmm)) {
        return null;
    }
    kiosk_save_asr_cache($pdo, $complexId, $isoDate, $hhmm);
    return $hhmm;
}

function kiosk_datetime_from_hhmm(string $isoDate, string $hhmm): ?DateTimeImmutable
{
    $dt = DateTimeImmutable::createFromFormat('Y-m-d H:i', "{$isoDate} {$hhmm}", kiosk_timezone());
    return $dt instanceof DateTimeImmutable ? $dt : null;
}

/** @param array<string, mixed> $settings */
function kiosk_scan_window(PDO $pdo, int $complexId, array $settings): array
{
    $now = kiosk_now();
    $iso = $now->format('Y-m-d');
    $settings = kiosk_normalize_settings($settings);
    $openMinutes = (int) $settings['open_minutes_after_asr'];
    $presentMinutes = (int) $settings['present_minutes_after_asr'];
    $closeMinutes = (int) $settings['close_minutes_after_asr'];
    $city = (string) $settings['city'];

    $emptyWindow = [
        'openMinutesAfterAsr' => $openMinutes,
        'presentMinutesAfterAsr' => $presentMinutes,
        'closeMinutesAfterAsr' => $closeMinutes,
        'secondsUntilOpen' => 0,
        'secondsUntilPresentEnd' => 0,
        'secondsUntilClose' => 0,
        'timezone' => 'Asia/Riyadh',
        'city' => $city,
    ];

    $asr = kiosk_fetch_asr_hhmm($pdo, $complexId, $iso, $settings);
    if ($asr === null) {
        return [
            'phase' => 'unknown',
            'message' => 'تعذّر جلب وقت العصر — تحقق من اتصال الخادم',
            'asrTime' => null,
            'openAt' => null,
            'presentUntilAt' => null,
            'closeAt' => null,
            ...$emptyWindow,
        ];
    }

    $asrAt = kiosk_datetime_from_hhmm($iso, $asr);
    if ($asrAt === null) {
        return [
            'phase' => 'unknown',
            'message' => 'تعذّر حساب وقت التحضير',
            'asrTime' => $asr,
            'openAt' => null,
            'presentUntilAt' => null,
            'closeAt' => null,
            ...$emptyWindow,
        ];
    }

    $openAt = $asrAt->modify("+{$openMinutes} minutes");
    $presentUntilAt = $asrAt->modify("+{$presentMinutes} minutes");
    $closeAt = $asrAt->modify("+{$closeMinutes} minutes");

    $openTs = $openAt->getTimestamp();
    $presentTs = $presentUntilAt->getTimestamp();
    $closeTs = $closeAt->getTimestamp();
    $nowTs = $now->getTimestamp();

    if ($nowTs < $openTs) {
        $phase = 'before';
        $message = 'لم يُفتح وقت التحضير بعد';
    } elseif ($nowTs > $closeTs) {
        $phase = 'closed';
        $message = 'انتهى وقت التحضير الذاتي';
    } elseif ($nowTs > $presentTs) {
        $phase = 'late';
        $message = '';
    } else {
        $phase = 'present';
        $message = '';
    }

    return [
        'phase' => $phase,
        'message' => $message,
        'asrTime' => $asr,
        'openAt' => $openAt->format('H:i'),
        'presentUntilAt' => $presentUntilAt->format('H:i'),
        'closeAt' => $closeAt->format('H:i'),
        ...$emptyWindow,
        'secondsUntilOpen' => max(0, $openTs - $nowTs),
        'secondsUntilPresentEnd' => max(0, $presentTs - $nowTs),
        'secondsUntilClose' => max(0, $closeTs - $nowTs),
    ];
}

function kiosk_today_day_key(): string
{
    return KIOSK_DAY_KEYS[(int) kiosk_now()->format('w')] ?? 'sun';
}

function kiosk_today_iso(): string
{
    return kiosk_now()->format('Y-m-d');
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
        'compensationMurajaFaces' => 0,
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
    $settings = kiosk_normalize_settings($ctx['settings']);
    json_response([
        'ok' => true,
        ...kiosk_branding_payload($pdo, $cid),
        'scanWindow' => kiosk_scan_window($pdo, $cid, $settings),
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
    $settings = kiosk_normalize_settings($ctx['settings']);

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

    $window = kiosk_scan_window($pdo, $cid, $settings);
    if ($window['phase'] === 'before') {
        json_response([
            'status' => 'window_not_open',
            'message' => (string) ($window['message'] ?: 'لم يُفتح وقت التحضير بعد'),
            'studentName' => $student['name'],
        ]);
        return;
    }
    if ($window['phase'] === 'closed') {
        json_response([
            'status' => 'window_closed',
            'message' => (string) ($window['message'] ?: 'انتهى وقت التحضير الذاتي'),
            'studentName' => $student['name'],
        ]);
        return;
    }
    if ($window['phase'] === 'unknown') {
        json_response([
            'status' => 'error',
            'message' => (string) ($window['message'] ?: 'تعذّر التحقق من وقت التحضير'),
        ]);
        return;
    }

    $attendance = $window['phase'] === 'late' ? 'late' : 'present';
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
    if ($current === 'present' || $current === 'late') {
        json_response([
            'status' => 'already_checked_in',
            'message' => 'تم تحضيرك مسبقاً',
            'studentName' => $student['name'],
        ]);
        return;
    }
    if ($current === 'excused') {
        json_response([
            'status' => 'already_checked_in',
            'message' => 'مسجّل مسبقاً اليوم',
            'studentName' => $student['name'],
        ]);
        return;
    }

    $week['days'][$dayKey]['attendance'] = $attendance;
    $grades[$sid][$weekKey] = $week;
    kiosk_save_grades($pdo, $cid, $grades);

    if ($attendance === 'late') {
        json_response([
            'status' => 'success_late',
            'message' => 'تم تسجيل التأخر',
            'studentName' => $student['name'],
            'week' => $weekNum,
            'dayKey' => $dayKey,
            'attendance' => 'late',
        ]);
        return;
    }

    json_response([
        'status' => 'success',
        'message' => 'تم التحضير بنجاح',
        'studentName' => $student['name'],
        'week' => $weekNum,
        'dayKey' => $dayKey,
        'attendance' => 'present',
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
        'scanWindow' => kiosk_scan_window($pdo, $cid, $settings),
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

    $next = kiosk_normalize_settings([
        'enabled' => $enabled,
        'token' => $token,
        'open_minutes_after_asr' => array_key_exists('open_minutes_after_asr', $input)
            ? $input['open_minutes_after_asr']
            : ($current['open_minutes_after_asr'] ?? 0),
        'present_minutes_after_asr' => array_key_exists('present_minutes_after_asr', $input)
            ? $input['present_minutes_after_asr']
            : ($current['present_minutes_after_asr'] ?? 20),
        'close_minutes_after_asr' => array_key_exists('close_minutes_after_asr', $input)
            ? $input['close_minutes_after_asr']
            : ($current['close_minutes_after_asr'] ?? 55),
        'city' => $input['city'] ?? ($current['city'] ?? 'Buraydah'),
        'country' => $input['country'] ?? ($current['country'] ?? 'Saudi Arabia'),
        'prayer_method' => $input['prayer_method'] ?? ($current['prayer_method'] ?? 4),
    ]);
    kiosk_save_settings($pdo, $cid, $next);

    handle_kiosk_get_settings();
}
