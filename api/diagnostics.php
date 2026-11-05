<?php
declare(strict_types=1);

/** Stable error categories, independent of translated or potentially sensitive SQL text. */
function api_database_error_category(Throwable $error): string
{
    if ($error instanceof ApiSchemaException) return 'schema';
    if (!$error instanceof PDOException) return 'internal';
    $errno = (int) ($error->errorInfo[1] ?? 0);
    $state = (string) ($error->errorInfo[0] ?? $error->getCode());
    if (in_array($errno, [1044, 1045, 1142, 1143, 1227], true)) return 'permission';
    if (in_array($errno, [1205, 3024], true) || in_array($state, ['HYT00', 'HYT01'], true)) return 'timeout';
    if ($errno === 1213 || $state === '40001') return 'conflict';
    if (in_array($errno, [2002, 2003, 2005, 2006, 2013], true) || str_starts_with($state, '08')) return 'connection';
    if (in_array($errno, [1049, 1054, 1146], true) || in_array($state, ['42S02', '42S22'], true)) return 'schema';
    if ($errno === 1064) return 'sql';
    // MySQL 8 reports CHECK violations as HY000/3819 rather than SQLSTATE class 23.
    if ($errno === 3819 || str_starts_with($state, '23')) return 'integrity';
    return 'sql';
}

function api_database_error_status(Throwable $error): int
{
    return match (api_database_error_category($error)) {
        'connection', 'permission', 'schema', 'timeout' => 503,
        'conflict', 'integrity' => 409,
        default => 500,
    };
}

/** Never log credentials, SQL values, request bodies, tokens or student data. */
function api_log_failure(Throwable $error, string $context): string
{
    $reference = bin2hex(random_bytes(8));
    $entry = [
        'event' => 'qhp_failure', 'reference' => $reference,
        'context' => $context, 'category' => api_database_error_category($error),
        'class' => get_class($error),
        'sqlstate' => $error instanceof PDOException ? (string) ($error->errorInfo[0] ?? $error->getCode()) : null,
        'errno' => $error instanceof PDOException ? (int) ($error->errorInfo[1] ?? 0) : null,
        'file' => basename($error->getFile()), 'line' => $error->getLine(),
    ];
    if ($error instanceof ApiSchemaException) $entry['missing_schema'] = $error->missing;
    error_log((string) json_encode($entry, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE));
    return $reference;
}

function api_safe_failure_message(Throwable $error, string $context = 'database'): string
{
    $reference = api_log_failure($error, $context);
    $message = match (api_database_error_category($error)) {
        'connection' => 'تعذّر الوصول إلى قاعدة البيانات؛ لم يتأكد الحفظ. أعد تحميل البيانات قبل إعادة المحاولة',
        'permission' => 'تعذّر تنفيذ العملية بسبب إعدادات وصول قاعدة البيانات؛ تواصل مع الإدارة',
        'schema' => 'بنية قاعدة البيانات تحتاج تحديثًا معتمدًا؛ لم تُنفّذ ترحيلات تلقائية',
        'timeout' => 'انتهت مهلة عملية قاعدة البيانات؛ تحقّق من النتيجة قبل إعادة المحاولة',
        'conflict' => 'تعارضت العملية مع تحديث آخر؛ أعد تحميل البيانات قبل إعادة المحاولة',
        'integrity' => 'تعارضت البيانات مع سجل قائم؛ لم يتأكد حفظ العملية',
        'sql' => 'تعذّر تنفيذ استعلام قاعدة البيانات؛ تواصل مع الإدارة',
        default => 'تعذّر إتمام العملية؛ تواصل مع الإدارة',
    };
    return $message . ' — مرجع: ' . $reference;
}
