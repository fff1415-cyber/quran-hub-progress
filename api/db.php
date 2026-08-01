<?php

declare(strict_types=1);

function db_is_stale_connection(PDOException $e): bool
{
    $msg = strtolower($e->getMessage());
    $info = $e->errorInfo ?? [];
    $driverCode = isset($info[1]) ? (int) $info[1] : 0;

    return in_array($driverCode, [2006, 2013], true)
        || str_contains($msg, 'server has gone away')
        || str_contains($msg, 'lost connection');
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        try {
            $pdo->query('SELECT 1');
        } catch (PDOException $e) {
            if (db_is_stale_connection($e)) {
                $pdo = null;
            } else {
                throw $e;
            }
        }
    }

    if (!$pdo instanceof PDO) {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }

    return $pdo;
}
