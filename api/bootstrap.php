<?php

declare(strict_types=1);

function api_register_error_handlers(): void
{
    set_exception_handler(static function (Throwable $e): void {
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
        }
        $message = $e->getMessage();
        if ($e instanceof PDOException) {
            $message = 'تعذّر الاتصال بقاعدة البيانات — راجع api/config.php (DB_NAME, DB_USER, DB_PASS) في Hostinger';
        }
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
