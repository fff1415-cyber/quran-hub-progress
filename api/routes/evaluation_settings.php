<?php

declare(strict_types=1);

function eval_settings_table_exists(PDO $pdo): bool
{
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = ?'
    );
    $stmt->execute(['evaluation_settings']);
    return (int) $stmt->fetchColumn() > 0;
}

function eval_settings_tenant_enabled(PDO $pdo): bool
{
    return table_column_exists($pdo, 'evaluation_settings', 'complex_id');
}

/** @return array<string, int|float> */
function eval_settings_defaults(): array
{
    return [
        'hifz_max_score' => 45,
        'review_max_score' => 50,
        'error_deduction' => 5,
        'warning_deduction' => 2,
        'review_error_deduction' => 2,
        'review_warning_deduction' => 1,
        'hifz_max_errors' => 3,
        'hifz_max_warnings' => 5,
        'review_max_errors_per_segment' => 3,
        'review_max_warnings_per_segment' => 5,
        'pass_percent' => 80,
        'max_minutes_per_face' => 2.0,
        'review_segments_under_10' => 3,
        'review_segments_10_to_20' => 4,
        'review_segments_over_20' => 5,
        'retry_delay_days' => 2,
    ];
}

/** @return list<string> */
function eval_settings_columns(): array
{
    return array_keys(eval_settings_defaults());
}

/** @param array<string, mixed> $row */
function eval_settings_row(array $row): array
{
    $defaults = eval_settings_defaults();
    $out = [];
    foreach ($defaults as $key => $default) {
        if (!array_key_exists($key, $row)) {
            $out[$key] = $default;
            continue;
        }
        $out[$key] = $key === 'max_minutes_per_face'
            ? (float) $row[$key]
            : (int) $row[$key];
    }
    return $out;
}

function eval_settings_fetch(PDO $pdo, int $complexId): array
{
    if (!eval_settings_table_exists($pdo)) {
        return eval_settings_defaults();
    }

    $columns = eval_settings_columns();
    if (!table_column_exists($pdo, 'evaluation_settings', 'retry_delay_days')) {
        $columns = array_values(array_diff($columns, ['retry_delay_days']));
    }
    $cols = implode(', ', $columns);
    $tenants = eval_settings_tenant_enabled($pdo);

    if ($tenants) {
        $stmt = $pdo->prepare("SELECT $cols FROM evaluation_settings WHERE complex_id = ? LIMIT 1");
        $stmt->execute([$complexId]);
        $row = $stmt->fetch();

    } else {
        $stmt = $pdo->query("SELECT $cols FROM evaluation_settings WHERE id = 1 LIMIT 1");
        $row = $stmt->fetch();

    }
    return eval_settings_row($row ?: []);
}

/** @param array<string, mixed> $input */
function eval_settings_sanitize(array $input): array
{
    $defaults = eval_settings_defaults();
    $out = [];
    foreach ($defaults as $key => $default) {
        if (!array_key_exists($key, $input)) {
            $out[$key] = $default;
            continue;
        }
        if ($key === 'max_minutes_per_face') {
            $out[$key] = max(0.1, (float) $input[$key]);
            continue;
        }
        $out[$key] = max(0, (int) $input[$key]);
    }
    if ($out['pass_percent'] > 100) {
        $out['pass_percent'] = 100;
    }
    if ($out['hifz_max_errors'] < 1) {
        $out['hifz_max_errors'] = 1;
    }
    if ($out['review_max_errors_per_segment'] < 1) {
        $out['review_max_errors_per_segment'] = 1;
    }
    if ($out['review_segments_under_10'] < 1) {
        $out['review_segments_under_10'] = 1;
    }
    if ($out['review_segments_10_to_20'] < 1) {
        $out['review_segments_10_to_20'] = 1;
    }
    if ($out['review_segments_over_20'] < 1) {
        $out['review_segments_over_20'] = 1;
    }
    if ($out['retry_delay_days'] < 1) {
        $out['retry_delay_days'] = 1;
    }
    return $out;
}

function handle_get_evaluation_settings(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    $pdo = db();
    if (!eval_settings_table_exists($pdo)) {
        json_response(['settings' => eval_settings_defaults(), 'source' => 'defaults', 'context_complex_id' => $cid]);
        return;
    }
    json_response(['settings' => eval_settings_fetch($pdo, $cid), 'source' => 'database', 'context_complex_id' => $cid]);
}

function handle_put_evaluation_settings(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    $role = (string) ($auth['role'] ?? '');
    if ($role !== 'manager') {
        error_response('Forbidden', 403);
    }
    $input = json_input();
    $settings = eval_settings_sanitize(is_array($input['settings'] ?? null) ? $input['settings'] : $input);

    $pdo = db();
    if (!eval_settings_table_exists($pdo)) {
        error_response('نفّذ migrate-evaluation-settings.sql على قاعدة البيانات أولاً', 503);
    }

    $hasRetryDelay = table_column_exists($pdo, 'evaluation_settings', 'retry_delay_days');
    if (!$hasRetryDelay && $settings['retry_delay_days'] !== eval_settings_defaults()['retry_delay_days']) {
        error_response('تعذّر حفظ مدة الإعادة: مخطط الإعدادات الحالي يدعم المدة السابقة فقط (يومان). لم تتغير الإعدادات؛ تغيير المدة يحتاج ترحيلًا معتمدًا.', 503);
    }
    $tenants = eval_settings_tenant_enabled($pdo);
    $pdo->beginTransaction();
    try {
    $sets = [];
    $params = [];
    foreach ($settings as $key => $val) {
        if ($key === 'retry_delay_days' && !$hasRetryDelay) continue;
        $sets[] = "`$key` = ?";
        $params[] = $val;
    }

    if ($tenants) {
        $pdo->prepare('INSERT IGNORE INTO evaluation_settings (complex_id) VALUES (?)')->execute([$cid]);
        $params[] = $cid;
        $sql = 'UPDATE evaluation_settings SET ' . implode(', ', $sets) . ' WHERE complex_id = ?';
    } else {
        $pdo->exec('INSERT IGNORE INTO evaluation_settings (id) VALUES (1)');
        $params[] = 1;
        $sql = 'UPDATE evaluation_settings SET ' . implode(', ', $sets) . ' WHERE id = ?';
    }
    $exists = $pdo->prepare($tenants ? 'SELECT 1 FROM evaluation_settings WHERE complex_id = ? FOR UPDATE' : 'SELECT 1 FROM evaluation_settings WHERE id = ? FOR UPDATE');
    $exists->execute([$tenants ? $cid : 1]);
    if (!$exists->fetchColumn()) throw new RuntimeException('تعذّر تهيئة صف إعدادات التقييم — لم يتأكد الحفظ');
    $pdo->prepare($sql)->execute($params);
    $saved = eval_settings_fetch($pdo, $cid);
    $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }

    json_response(['ok' => true, 'settings' => $saved, 'context_complex_id' => $cid]);
}
