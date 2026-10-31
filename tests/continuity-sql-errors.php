<?php
declare(strict_types=1);
// Exact production SQL error helpers; no database or credential bootstrap.
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

    if (str_contains($msg, 'app_state') && str_contains($msg, 'value')) {
        return 'تعذّر حفظ بيانات التطبيق — قد تحتاج migrate-app-state-value-longtext.sql على Hostinger';
    }
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

function pdo_sql_error_detail(PDOException $e): string
{
    $info = $e->errorInfo ?? [];
    $sqlState = isset($info[0]) ? (string) $info[0] : '';
    $driverCode = isset($info[1]) ? (string) $info[1] : '';
    $driverMsg = isset($info[2]) && is_string($info[2]) && $info[2] !== ''
        ? $info[2]
        : $e->getMessage();
    $parts = [$driverMsg];
    if ($sqlState !== '') {
        $parts[] = 'SQLSTATE=' . $sqlState;
    }
    if ($driverCode !== '') {
        $parts[] = 'errno=' . $driverCode;
    }
    return implode(' | ', $parts);
}

