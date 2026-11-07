<?php
declare(strict_types=1);

// CLI-only metadata/plan. There is deliberately no production apply flag in this release.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/../api/schema.php';
require_once __DIR__ . '/../database/runtime-column-migrations.php';
$config = $argv[1] ?? '';
if (!$config || !is_file($config) || realpath($config) === false) {
    fwrite(STDERR, "Usage: php scripts/inspect-runtime-schema.php /absolute/private/config.php\n");
    exit(2);
}
try {
    require $config;
    $pdo = new PDO('mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET, DB_USER, DB_PASS, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $pdo->exec('SET TRANSACTION READ ONLY');
    $pdo->beginTransaction();
    $schema = schema_inspect($pdo);
    $plan = runtime_column_migration_plan($pdo);
    $pdo->rollBack();
    echo json_encode(['schema' => $schema, 'pending_additions' => $plan, 'applied' => false], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n";
    exit($schema['ready'] ? 0 : 1);
} catch (Throwable $error) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    fwrite(STDERR, "Schema inspection incomplete; no changes applied.\n");
    exit(1);
}
