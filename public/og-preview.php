<?php

declare(strict_types=1);

/**
 * Dynamic Open Graph HTML for WhatsApp / Facebook / Twitter link previews.
 * Routed via .htaccess for social crawlers on tenant paths (/m6, /m6/…).
 */

$configPath = __DIR__ . '/api/config.php';
if (!file_exists($configPath)) {
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Not configured';
    exit;
}

require_once __DIR__ . '/api/bootstrap.php';
require_once $configPath;
require_once __DIR__ . '/api/config-loader.php';
api_load_optional_config();
require_once __DIR__ . '/api/db.php';
require_once __DIR__ . '/api/tenant.php';
require_once __DIR__ . '/api/og_meta.php';

og_handle_preview();
