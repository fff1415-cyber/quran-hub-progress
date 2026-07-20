<?php

declare(strict_types=1);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$configPath = __DIR__ . '/config.php';
if (!file_exists($configPath)) {
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'ok' => false,
        'checks' => ['config' => 'missing — انسخ config.example.php إلى config.php'],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

require_once __DIR__ . '/bootstrap.php';
api_register_error_handlers();
require_once $configPath;
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/routes/health.php';

handle_health_check();
