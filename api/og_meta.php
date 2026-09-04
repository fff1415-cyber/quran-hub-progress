<?php

declare(strict_types=1);

const OG_RESERVED_SEGMENTS = [
    'register', 'platform-admin', 'prelaunch-audit', 'admin', 'dashboard', 'daily-operations',
    'manager', 'teacher', 'secretary', 'supervisor', 'student', 'musammi', 'kiosk',
    'staff-attendance', 'program-supervisor', 'api', 'assets', 'og-preview.php',
];

function og_is_social_crawler(): bool
{
    $ua = strtolower((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''));

    return preg_match(
        '/facebookexternalhit|whatsapp|twitterbot|linkedinbot|slackbot|telegrambot|discordbot|embedly|pinterest/i',
        $ua,
    ) === 1;
}

function og_request_origin(): string
{
    $host = strtolower(trim((string) ($_SERVER['HTTP_HOST'] ?? 'msht.io')));
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';

    return rtrim($scheme . '://' . $host, '/');
}

function og_subdomain_from_host(string $host): ?string
{
    $host = strtolower(trim($host));
    $apex = tenant_apex_domain();

    if ($host === $apex || $host === 'www.' . $apex) {
        return null;
    }

    $suffix = '.' . $apex;
    if (str_ends_with($host, $suffix)) {
        $label = substr($host, 0, -strlen($suffix));
        if ($label !== '' && $label !== 'www') {
            $sub = explode('.', $label)[0];
            return $sub !== '' ? $sub : null;
        }
    }

    return null;
}

function og_subdomain_from_path(string $path): ?string
{
    $segment = strtolower(trim(explode('/', trim($path, '/'))[0] ?? ''));
    if ($segment === '' || in_array($segment, OG_RESERVED_SEGMENTS, true)) {
        return null;
    }
    if (!preg_match('/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/', $segment)) {
        return null;
    }

    return $segment;
}

function og_resolve_subdomain(): ?string
{
    $fromQuery = strtolower(trim((string) ($_GET['slug'] ?? '')));
    if ($fromQuery !== '' && preg_match('/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/', $fromQuery)) {
        return $fromQuery;
    }

    $fromHost = og_subdomain_from_host((string) ($_SERVER['HTTP_HOST'] ?? ''));
    if ($fromHost !== null) {
        return $fromHost;
    }

    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';

    return og_subdomain_from_path($path);
}

/** @return array{name: string, logo_url: ?string, subdomain: string}|null */
function og_fetch_complex_by_subdomain(PDO $pdo, string $sub): ?array
{
    if (!table_column_exists($pdo, 'complexes', 'subdomain')) {
        $stmt = $pdo->query('SELECT id, name, logo_url FROM complexes WHERE id = 1 LIMIT 1');
        $row = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : false;

        return $row ? [
            'name' => (string) $row['name'],
            'logo_url' => og_normalize_logo($row['logo_url'] ?? null),
            'subdomain' => $sub,
        ] : null;
    }

    $stmt = $pdo->prepare('SELECT name, logo_url, subdomain FROM complexes WHERE subdomain = ? LIMIT 1');
    $stmt->execute([$sub]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return null;
    }

    return [
        'name' => (string) $row['name'],
        'logo_url' => og_normalize_logo($row['logo_url'] ?? null),
        'subdomain' => (string) ($row['subdomain'] ?? $sub),
    ];
}

function og_normalize_logo(mixed $raw): ?string
{
    if (!is_string($raw)) {
        return null;
    }
    $url = trim($raw);

    return $url !== '' ? $url : null;
}

function og_absolute_asset(?string $logoUrl, string $origin): string
{
    $fallback = $origin . '/shtaiwi-logo.png';
    if ($logoUrl === null || $logoUrl === '') {
        return $fallback;
    }
    if (preg_match('#^https?://#i', $logoUrl)) {
        return $logoUrl;
    }

    return $origin . '/' . ltrim($logoUrl, '/');
}

function og_escape(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** @param array{name: string, logo_url: ?string, subdomain: string} $complex */
function og_render_html(array $complex, string $pageUrl, string $origin): void
{
    $title = $complex['name'];
    $description = $complex['name'] . ' — منصة إدارة مجمعات تحفيظ القرآن الكريم';
    $image = og_absolute_asset($complex['logo_url'], $origin);

    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: public, max-age=300');

    echo '<!DOCTYPE html><html lang="ar" dir="rtl"><head>';
    echo '<meta charset="utf-8">';
    echo '<meta name="viewport" content="width=device-width, initial-scale=1">';
    echo '<title>' . og_escape($title) . '</title>';
    echo '<meta name="description" content="' . og_escape($description) . '">';
    echo '<meta property="og:type" content="website">';
    echo '<meta property="og:url" content="' . og_escape($pageUrl) . '">';
    echo '<meta property="og:title" content="' . og_escape($title) . '">';
    echo '<meta property="og:description" content="' . og_escape($description) . '">';
    echo '<meta property="og:image" content="' . og_escape($image) . '">';
    echo '<meta property="og:image:width" content="512">';
    echo '<meta property="og:image:height" content="512">';
    echo '<meta name="twitter:card" content="summary_large_image">';
    echo '<meta name="twitter:title" content="' . og_escape($title) . '">';
    echo '<meta name="twitter:description" content="' . og_escape($description) . '">';
    echo '<meta name="twitter:image" content="' . og_escape($image) . '">';
    echo '<link rel="icon" type="image/png" href="' . og_escape($image) . '">';
    echo '<meta http-equiv="refresh" content="0;url=' . og_escape($pageUrl) . '">';
    echo '</head><body>';
    echo '<p><a href="' . og_escape($pageUrl) . '">' . og_escape($title) . '</a></p>';
    echo '</body></html>';
}

function og_render_platform_html(string $pageUrl, string $origin): void
{
    og_render_html([
        'name' => 'msht.io',
        'logo_url' => $origin . '/shtaiwi-logo.png',
        'subdomain' => '',
    ], $pageUrl, $origin);
}

function og_handle_preview(): void
{
    $origin = og_request_origin();
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
    $pageUrl = rtrim($origin, '/') . $path;
    if (!empty($_SERVER['QUERY_STRING'])) {
        $pageUrl = strtok($pageUrl, '?') ?: $pageUrl;
    }

    $sub = og_resolve_subdomain();
    if ($sub === null) {
        og_render_platform_html($pageUrl, $origin);
        return;
    }

    try {
        $pdo = db();
    } catch (Throwable) {
        og_render_platform_html($pageUrl, $origin);
        return;
    }

    $complex = og_fetch_complex_by_subdomain($pdo, $sub);
    if ($complex === null) {
        og_render_platform_html($pageUrl, $origin);
        return;
    }

    if (tenant_is_platform_host((string) ($_SERVER['HTTP_HOST'] ?? ''))) {
        $pageUrl = $origin . '/' . $complex['subdomain'];
    }

    og_render_html($complex, $pageUrl, $origin);
}
