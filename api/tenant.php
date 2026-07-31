<?php

declare(strict_types=1);

/**
 * Multi-tenant helpers — every authenticated request must scope data to one complex.
 *
 * Usage in route handlers:
 *   $auth = require_auth();
 *   $cid  = require_complex_id($auth);
 *   $stmt = $pdo->prepare('SELECT * FROM students WHERE complex_id = ? AND ...');
 *   $stmt->execute([$cid, ...]);
 */

/** Default complex for legacy tokens / single-tenant installs. */
const LEGACY_DEFAULT_COMPLEX_ID = 1;

function table_column_exists(PDO $pdo, string $table, string $column): bool
{
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?'
    );
    $stmt->execute([$table, $column]);
    return (int) $stmt->fetchColumn() > 0;
}

function complex_id_from_auth(array $auth): ?int
{
    if (isset($auth['complexId']) && (int) $auth['complexId'] > 0) {
        return (int) $auth['complexId'];
    }
    if (isset($auth['complex_id']) && (int) $auth['complex_id'] > 0) {
        return (int) $auth['complex_id'];
    }
    return null;
}

function require_complex_id(array $auth): int
{
    $id = complex_id_from_auth($auth);
    if ($id !== null) {
        return $id;
    }
    return LEGACY_DEFAULT_COMPLEX_ID;
}

/** complexId from login request body (optional until UI sends it). */
function login_complex_id_from_input(array $input): int
{
    if (isset($input['complexId']) && (int) $input['complexId'] > 0) {
        return (int) $input['complexId'];
    }
    if (isset($input['complex_id']) && (int) $input['complex_id'] > 0) {
        return (int) $input['complex_id'];
    }
    return LEGACY_DEFAULT_COMPLEX_ID;
}

/** complexId for unauthenticated public list endpoints (?complexId=). */
function public_complex_id_from_request(): int
{
    if (isset($_GET['complexId']) && (int) $_GET['complexId'] > 0) {
        return (int) $_GET['complexId'];
    }
    if (isset($_GET['complex_id']) && (int) $_GET['complex_id'] > 0) {
        return (int) $_GET['complex_id'];
    }
    return LEGACY_DEFAULT_COMPLEX_ID;
}

/**
 * @param array<string, mixed> $payload
 * @return array<string, mixed>
 */
function login_token_payload(array $payload, int $complexId, bool $tenantsEnabled): array
{
    if ($tenantsEnabled) {
        $payload['complexId'] = $complexId;
    }
    return $payload;
}

/** Auth payload + resolved complex id (convenience). */
function require_auth_with_complex(): array
{
    $auth = require_auth();
    return [
        'auth' => $auth,
        'complex_id' => require_complex_id($auth),
    ];
}

/**
 * Append tenant filter to a WHERE clause fragment.
 * Example: tenant_where('complex_id', $cid) => 'complex_id = :complex_id'
 */
function tenant_where(string $column = 'complex_id'): string
{
    return "$column = :complex_id";
}

/**
 * Merge complex_id into execute params.
 *
 * @param array<string, mixed> $params
 * @return array<string, mixed>
 */
function with_complex_id(int $complexId, array $params = []): array
{
    return array_merge([':complex_id' => $complexId], $params);
}

/** Ensure a row belongs to the current complex (403 if not). */
function assert_row_belongs_to_complex(?int $rowComplexId, int $currentComplexId): void
{
    if ($rowComplexId === null || $rowComplexId !== $currentComplexId) {
        error_response('Forbidden', 403);
    }
}

function table_index_exists(PDO $pdo, string $table, string $indexName): bool
{
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?'
    );
    $stmt->execute([$table, $indexName]);
    return (int) $stmt->fetchColumn() > 0;
}

function pdo_is_integrity_violation(PDOException $e): bool
{
    $sqlState = (string) $e->getCode();
    if ($sqlState === '23000') {
        return true;
    }
    $info = $e->errorInfo ?? [];
    return isset($info[0]) && (string) $info[0] === '23000';
}

function pdo_integrity_error_message(PDOException $e): string
{
    $msg = strtolower($e->getMessage());

    if (str_contains($msg, 'uk_complexes_subdomain') || str_contains($msg, 'subdomain')) {
        return 'رمز المجمع (العضوية) مستخدم — اختر رمزاً آخر أو حدّث الصفحة';
    }
    if (str_contains($msg, 'uk_complex_code')) {
        return 'رقم عضوية المدير مستخدم في هذا المجمع — اختر رقماً مختلفاً';
    }
    if (str_contains($msg, 'uk_code')) {
        return 'رقم عضوية المدير مستخدم مسبقاً — اختر رقماً مختلفاً';
    }
    if (str_contains($msg, 'primary') && str_contains($msg, 'duplicate')) {
        return 'تعذّر إنشاء المجمع — بيانات متعارضة مع سجل موجود';
    }

    return 'البيانات المدخلة تتعارض مع سجل موجود — تحقق من رمز المجمع ورقم العضوية';
}

function pdo_is_connection_error(PDOException $e): bool
{
    $msg = strtolower($e->getMessage());
    $info = $e->errorInfo ?? [];
    $driverCode = isset($info[1]) ? (int) $info[1] : 0;

    return in_array($driverCode, [1045, 2002, 2006, 2013], true)
        || str_contains($msg, 'access denied')
        || str_contains($msg, 'connection refused')
        || str_contains($msg, 'server has gone away')
        || str_contains($msg, 'getaddrinfo failed');
}

function pdo_is_schema_error(PDOException $e): bool
{
    $info = $e->errorInfo ?? [];
    $sqlState = isset($info[0]) ? (string) $info[0] : '';
    $msg = strtolower($e->getMessage());

    return in_array($sqlState, ['42S02', '42S22', '42000'], true)
        || str_contains($msg, 'unknown column')
        || str_contains($msg, "doesn't exist");
}

/** User-facing PDO message — avoids masking SQL/migration errors as connection failures. */
function pdo_api_error_message(PDOException $e): string
{
    if (pdo_is_connection_error($e)) {
        return 'تعذّر الاتصال بقاعدة البيانات — راجع api/config.php (DB_NAME, DB_USER, DB_PASS) في Hostinger';
    }

    if (pdo_is_schema_error($e)) {
        $msg = strtolower($e->getMessage());
        if (str_contains($msg, 'student_plan_assignments')
            || str_contains($msg, 'education_plans')
            || str_contains($msg, 'daily_hifz')
            || str_contains($msg, 'start_muraja_segment')
            || str_contains($msg, 'plan_start_date')) {
            return 'جداول الخطط تحتاج تحديثاً — أعد فتح الورقة أو نفّذ database/migrate-plan-daily-faces.sql';
        }
        if (str_contains($msg, 'complex_id')) {
            return 'قاعدة البيانات تحتاج migrate-multi-tenant.sql — تواصل مع مدير النظام';
        }
        return 'خطأ في بنية قاعدة البيانات — ' . $e->getMessage();
    }

    if (pdo_is_integrity_violation($e)) {
        return pdo_integrity_error_message($e);
    }

    return 'خطأ في قاعدة البيانات — ' . $e->getMessage();
}
