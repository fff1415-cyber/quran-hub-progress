<?php

declare(strict_types=1);

function api_register_error_handlers(): void
{
    set_exception_handler(static function (Throwable $e): void {
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
        }
        $message = $e instanceof PDOException && function_exists('pdo_api_error_message')
            ? pdo_api_error_message($e)
            : ($e instanceof PDOException
                ? ('خطأ SQL: ' . (function_exists('pdo_sql_error_detail') ? pdo_sql_error_detail($e) : $e->getMessage()))
                : $e->getMessage());
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
