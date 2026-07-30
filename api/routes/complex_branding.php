<?php

declare(strict_types=1);

/** @return array<string, array{label: string, primary: string, secondary?: string, gradient: bool}> */
function brand_theme_presets(): array
{
    return [
        'navy' => [
            'label' => 'كحلي',
            'primary' => '#1e3a5f',
            'gradient' => false,
        ],
        'navy_gradient' => [
            'label' => 'كحلي مدرج',
            'primary' => '#1e3a5f',
            'secondary' => '#2d5a87',
            'gradient' => true,
        ],
        'beige' => [
            'label' => 'بيجي',
            'primary' => '#C9A227',
            'gradient' => false,
        ],
        'olive' => [
            'label' => 'زيتي',
            'primary' => '#4A5D23',
            'gradient' => false,
        ],
    ];
}

function brand_theme_validate_key(string $key): bool
{
    return array_key_exists($key, brand_theme_presets());
}

function brand_theme_primary(string $key): string
{
    $presets = brand_theme_presets();
    return $presets[$key]['primary'] ?? $presets['navy']['primary'];
}

function complex_branding_require_manager(): array
{
    $auth = require_auth();
    if (($auth['role'] ?? '') !== 'manager') {
        error_response('Forbidden — managers only', 403);
    }
    return $auth;
}

function complex_branding_uploads_dir(int $complexId): string
{
    $root = dirname(__DIR__, 2) . '/uploads/c/' . $complexId;
    if (!is_dir($root) && !mkdir($root, 0755, true) && !is_dir($root)) {
        error_response('تعذّر إنشاء مجلد الرفع', 500);
    }
    return $root;
}

function complex_branding_public_url(int $complexId, string $filename): string
{
    return '/uploads/c/' . $complexId . '/' . $filename;
}

function complex_branding_fetch(PDO $pdo, int $complexId): array
{
    $hasTheme = table_column_exists($pdo, 'complexes', 'theme_key');
    $cols = 'id, name, logo_url, primary_color, subdomain';
    if ($hasTheme) {
        $cols .= ', theme_key';
    }
    $stmt = $pdo->prepare("SELECT $cols FROM complexes WHERE id = ? LIMIT 1");
    $stmt->execute([$complexId]);
    $row = $stmt->fetch();
    if (!$row) {
        error_response('المجمع غير موجود', 404);
    }

    $themeKey = $hasTheme ? (string) ($row['theme_key'] ?? 'navy') : 'navy';
    if (!brand_theme_validate_key($themeKey)) {
        $themeKey = 'navy';
    }
    $preset = brand_theme_presets()[$themeKey];

    return [
        'id' => (int) $row['id'],
        'name' => (string) $row['name'],
        'subdomain' => (string) ($row['subdomain'] ?? ''),
        'logo_url' => $row['logo_url'] !== null && trim((string) $row['logo_url']) !== ''
            ? (string) $row['logo_url']
            : null,
        'theme_key' => $themeKey,
        'primary_color' => (string) ($row['primary_color'] ?? $preset['primary']),
        'theme' => $preset,
    ];
}

function handle_get_complex_branding(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    $pdo = db();
    json_response(complex_branding_fetch($pdo, $cid));
}

function handle_put_complex_branding(): void
{
    complex_branding_require_manager();
    $auth = require_auth();
    $cid = require_complex_id($auth);
    $input = json_input();
    $themeKey = trim((string) ($input['theme_key'] ?? ''));

    if ($themeKey === '' || !brand_theme_validate_key($themeKey)) {
        error_response('اختر لوناً صالحاً من الهوية', 400);
    }

    $primary = brand_theme_primary($themeKey);
    $pdo = db();

    if (table_column_exists($pdo, 'complexes', 'theme_key')) {
        $stmt = $pdo->prepare(
            'UPDATE complexes SET theme_key = ?, primary_color = ? WHERE id = ? LIMIT 1'
        );
        $stmt->execute([$themeKey, $primary, $cid]);
    } else {
        $stmt = $pdo->prepare('UPDATE complexes SET primary_color = ? WHERE id = ? LIMIT 1');
        $stmt->execute([$primary, $cid]);
    }

    json_response(complex_branding_fetch($pdo, $cid));
}

function complex_branding_validate_upload(array $file): void
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        error_response('فشل رفع الملف — حاول مرة أخرى', 400);
    }
    if (($file['size'] ?? 0) > 2 * 1024 * 1024) {
        error_response('حجم الشعار: 2 ميجابايت كحد أقصى', 400);
    }

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = $finfo ? finfo_file($finfo, (string) $file['tmp_name']) : '';
    if ($finfo) {
        finfo_close($finfo);
    }

    $allowed = [
        'image/png' => 'png',
        'image/jpeg' => 'jpg',
        'image/webp' => 'webp',
    ];
    if (!isset($allowed[$mime])) {
        error_response('الصيغ المسموحة: PNG, JPG, WebP', 400);
    }
}

function handle_post_complex_branding_logo(): void
{
    complex_branding_require_manager();
    $auth = require_auth();
    $cid = require_complex_id($auth);

    if (!isset($_FILES['logo'])) {
        error_response('لم يُرفَع ملف الشعار', 400);
    }

    complex_branding_validate_upload($_FILES['logo']);

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, (string) $_FILES['logo']['tmp_name']);
    finfo_close($finfo);
    $ext = match ($mime) {
        'image/jpeg' => 'jpg',
        'image/webp' => 'webp',
        default => 'png',
    };

    $dir = complex_branding_uploads_dir($cid);
    foreach (glob($dir . '/logo.*') ?: [] as $old) {
        if (is_file($old)) {
            unlink($old);
        }
    }

    $filename = 'logo.' . $ext;
    $dest = $dir . '/' . $filename;
    if (!move_uploaded_file((string) $_FILES['logo']['tmp_name'], $dest)) {
        error_response('تعذّر حفظ الشعار على الخادم', 500);
    }

    $publicUrl = complex_branding_public_url($cid, $filename) . '?v=' . time();
    $pdo = db();
    $pdo->prepare('UPDATE complexes SET logo_url = ? WHERE id = ? LIMIT 1')
        ->execute([$publicUrl, $cid]);

    json_response(complex_branding_fetch($pdo, $cid));
}

function handle_delete_complex_branding_logo(): void
{
    complex_branding_require_manager();
    $auth = require_auth();
    $cid = require_complex_id($auth);

    $dir = complex_branding_uploads_dir($cid);
    foreach (glob($dir . '/logo.*') ?: [] as $old) {
        if (is_file($old)) {
            unlink($old);
        }
    }

    $pdo = db();
    $pdo->prepare('UPDATE complexes SET logo_url = NULL WHERE id = ? LIMIT 1')->execute([$cid]);

    json_response(complex_branding_fetch($pdo, $cid));
}
