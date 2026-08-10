<?php

declare(strict_types=1);

require_once __DIR__ . '/push_send.php';

const PUSH_SUBSCRIPTIONS_KEY = 'push_subscriptions';
const PUSH_SETTINGS_KEY = 'push_notification_settings';

/**
 * @return array{enabled:bool,studentAbsent:bool,studentLate:bool,staffCheckIn:bool,teacherTransfer:bool}
 */
function push_default_settings(): array
{
    return [
        'enabled' => true,
        'studentAbsent' => true,
        'studentLate' => true,
        'staffCheckIn' => true,
        'teacherTransfer' => true,
    ];
}

/**
 * @return array{enabled:bool,studentAbsent:bool,studentLate:bool,staffCheckIn:bool,teacherTransfer:bool}
 */
function push_load_settings(PDO $pdo, int $complexId): array
{
    $defaults = push_default_settings();
    $tenants = app_state_tenant_enabled($pdo);
    if ($tenants) {
        $stmt = $pdo->prepare('SELECT value FROM app_state WHERE complex_id = ? AND `key` = ? LIMIT 1');
        $stmt->execute([$complexId, PUSH_SETTINGS_KEY]);
    } else {
        $stmt = $pdo->prepare('SELECT value FROM app_state WHERE `key` = ? LIMIT 1');
        $stmt->execute([PUSH_SETTINGS_KEY]);
    }
    $row = $stmt->fetch();
    if (!$row) {
        return $defaults;
    }
    $decoded = json_decode((string) ($row['value'] ?? '{}'), true);
    if (!is_array($decoded)) {
        return $defaults;
    }
    return [
        'enabled' => array_key_exists('enabled', $decoded) ? (bool) $decoded['enabled'] : $defaults['enabled'],
        'studentAbsent' => array_key_exists('studentAbsent', $decoded) ? (bool) $decoded['studentAbsent'] : $defaults['studentAbsent'],
        'studentLate' => array_key_exists('studentLate', $decoded) ? (bool) $decoded['studentLate'] : $defaults['studentLate'],
        'staffCheckIn' => array_key_exists('staffCheckIn', $decoded) ? (bool) $decoded['staffCheckIn'] : $defaults['staffCheckIn'],
        'teacherTransfer' => array_key_exists('teacherTransfer', $decoded) ? (bool) $decoded['teacherTransfer'] : $defaults['teacherTransfer'],
    ];
}

function push_event_field(string $event): ?string
{
    return match ($event) {
        'student_absent' => 'studentAbsent',
        'student_late' => 'studentLate',
        'staff_checkin' => 'staffCheckIn',
        'teacher_transfer' => 'teacherTransfer',
        default => null,
    };
}

function push_event_allowed(array $settings, string $event): bool
{
    if (!($settings['enabled'] ?? true)) {
        return false;
    }
    $field = push_event_field($event);
    if ($field === null) {
        return true;
    }
    return ($settings[$field] ?? true) === true;
}

/**
 * @return list<array<string, mixed>>
 */
function push_load_subscriptions(PDO $pdo, int $complexId): array
{
    $tenants = app_state_tenant_enabled($pdo);
    if ($tenants) {
        $stmt = $pdo->prepare('SELECT value FROM app_state WHERE complex_id = ? AND `key` = ? LIMIT 1');
        $stmt->execute([$complexId, PUSH_SUBSCRIPTIONS_KEY]);
    } else {
        $stmt = $pdo->prepare('SELECT value FROM app_state WHERE `key` = ? LIMIT 1');
        $stmt->execute([PUSH_SUBSCRIPTIONS_KEY]);
    }
    $row = $stmt->fetch();
    if (!$row) {
        return [];
    }
    $decoded = json_decode((string) ($row['value'] ?? '[]'), true);
    return is_array($decoded) ? $decoded : [];
}

/**
 * @param list<array<string, mixed>> $subs
 */
function push_save_subscriptions(PDO $pdo, int $complexId, array $subs): void
{
    app_state_upsert($pdo, PUSH_SUBSCRIPTIONS_KEY, array_values($subs), app_state_tenant_enabled($pdo) ? $complexId : null);
}

function push_subscription_id(string $endpoint): string
{
    return hash('sha256', $endpoint);
}

function handle_push_vapid_public(): void
{
    if (!push_vapid_configured()) {
        json_response(['publicKey' => null, 'enabled' => false]);
    }
    json_response(['publicKey' => VAPID_PUBLIC_KEY, 'enabled' => true]);
}

function handle_push_subscribe(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    $input = json_input();
    $sub = $input['subscription'] ?? null;
    if (!is_array($sub) || empty($sub['endpoint']) || !is_array($sub['keys'] ?? null)) {
        error_response('اشتراك إشعارات غير صالح');
    }

    $pdo = db();
    $list = push_load_subscriptions($pdo, $cid);
    $id = push_subscription_id((string) $sub['endpoint']);
    $entry = [
        'id' => $id,
        'endpoint' => (string) $sub['endpoint'],
        'keys' => [
            'p256dh' => (string) ($sub['keys']['p256dh'] ?? ''),
            'auth' => (string) ($sub['keys']['auth'] ?? ''),
        ],
        'role' => (string) ($auth['role'] ?? ''),
        'name' => (string) ($auth['name'] ?? ''),
        'studentId' => isset($auth['studentId']) ? (string) $auth['studentId'] : null,
        'halaqaId' => isset($auth['halaqaId']) ? (int) $auth['halaqaId'] : null,
        'updatedAt' => gmdate('c'),
    ];

    $found = false;
    foreach ($list as $i => $row) {
        if (($row['id'] ?? '') === $id) {
            $list[$i] = $entry;
            $found = true;
            break;
        }
    }
    if (!$found) {
        $list[] = $entry;
    }

    push_save_subscriptions($pdo, $cid, $list);
    json_response(['ok' => true, 'id' => $id]);
}

function handle_push_unsubscribe(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    $input = json_input();
    $endpoint = trim((string) ($input['endpoint'] ?? ''));
    if ($endpoint === '') {
        error_response('Missing endpoint');
    }

    $pdo = db();
    $id = push_subscription_id($endpoint);
    $list = array_values(array_filter(
        push_load_subscriptions($pdo, $cid),
        static fn (array $row): bool => ($row['id'] ?? '') !== $id,
    ));
    push_save_subscriptions($pdo, $cid, $list);
    json_response(['ok' => true]);
}

function handle_push_dispatch(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    $input = json_input();

    $title = trim((string) ($input['title'] ?? ''));
    $body = trim((string) ($input['body'] ?? ''));
    $url = trim((string) ($input['url'] ?? '/'));
    $event = trim((string) ($input['event'] ?? ''));
    $targets = is_array($input['targets'] ?? null) ? $input['targets'] : [];

    if ($title === '' || $body === '') {
        error_response('title و body مطلوبان');
    }

    $pdo = db();
    $settings = push_load_settings($pdo, $cid);
    if (!push_event_allowed($settings, $event)) {
        json_response([
            'ok' => true,
            'skipped' => true,
            'reason' => 'disabled_by_manager',
            'matched' => 0,
            'sent' => 0,
            'failed' => 0,
        ]);
    }

    $roles = [];
    foreach ((array) ($targets['roles'] ?? []) as $role) {
        $r = trim((string) $role);
        if ($r !== '') {
            $roles[] = $r;
        }
    }
    $studentIds = [];
    foreach ((array) ($targets['studentIds'] ?? []) as $sid) {
        $s = trim((string) $sid);
        if ($s !== '') {
            $studentIds[] = $s;
        }
    }

    $all = push_load_subscriptions($pdo, $cid);
    $matched = [];
    foreach ($all as $sub) {
        $role = (string) ($sub['role'] ?? '');
        $studentId = isset($sub['studentId']) ? (string) $sub['studentId'] : '';
        $roleMatch = $roles !== [] && in_array($role, $roles, true);
        $studentMatch = $studentIds !== [] && $role === 'student' && in_array($studentId, $studentIds, true);
        if ($roleMatch || $studentMatch) {
            $matched[] = $sub;
        }
    }

    $sent = 0;
    $failed = 0;
    $removed = [];
    $payload = [
        'title' => $title,
        'body' => $body,
        'url' => $url,
        'tag' => $event !== '' ? $event : 'qshatawi',
    ];

    foreach ($matched as $sub) {
        $ok = push_send_web_notification([
            'endpoint' => (string) ($sub['endpoint'] ?? ''),
            'keys' => is_array($sub['keys'] ?? null) ? $sub['keys'] : [],
        ], $payload);
        if ($ok) {
            $sent++;
            continue;
        }
        if (!push_vapid_configured()) {
            continue;
        }
        $failed++;
    }

    if ($removed !== []) {
        $remaining = array_values(array_filter(
            $all,
            static fn (array $row): bool => !in_array($row['id'] ?? '', $removed, true),
        ));
        push_save_subscriptions($pdo, $cid, $remaining);
    }

    json_response([
        'ok' => true,
        'matched' => count($matched),
        'sent' => $sent,
        'failed' => $failed,
        'pushEnabled' => push_vapid_configured(),
    ]);
}
