<?php

declare(strict_types=1);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$configPath = __DIR__ . '/config.php';
if (!file_exists($configPath)) {
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'API not configured. Copy config.example.php to config.php']);
    exit;
}

require_once $configPath;
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/routes/router.php';

$method = $_SERVER['REQUEST_METHOD'];
$uri = (string) ($_GET['path'] ?? '/');
if ($uri === '' || $uri[0] !== '/') {
    $uri = '/' . $uri;
}

route_request($method, $uri);
