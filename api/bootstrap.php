<?php

declare(strict_types=1);

require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/diagnostics.php';

function api_register_error_handlers(): void
{
    set_exception_handler(static function (Throwable $e): void {
        if (!headers_sent()) {
            http_response_code(api_database_error_status($e));
            header('Content-Type: application/json; charset=utf-8');
        }
        $message = api_safe_failure_message($e, 'unhandled_request');
        echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
        exit;
    });

    set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
        if (!(error_reporting() & $severity)) {
            return false;
        }
        throw new ErrorException($message, 0, $severity, $file, $line);
    });
}
