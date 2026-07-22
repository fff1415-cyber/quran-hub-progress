<?php

declare(strict_types=1);

function handle_health_check(): void
{
    $result = [
        'ok' => false,
        'service' => 'quran-hub-api',
        'php' => PHP_VERSION,
        'checks' => [],
    ];

    if (!defined('DB_NAME')) {
        $result['checks']['config'] = 'missing — انسخ config.example.php إلى config.php';
        json_response($result, 503);
    }

    $result['checks']['config'] = 'ok';
    $result['checks']['db_name'] = DB_NAME;
    $result['checks']['db_host'] = DB_HOST;

    try {
        $pdo = db();
        $pdo->query('SELECT 1');
        $result['checks']['db_connect'] = 'ok';

        $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
        $result['checks']['tables'] = $tables;

        $required = ['halaqat', 'students', 'role_accounts', 'app_state'];
        $missing = array_values(array_diff($required, $tables));
        $result['checks']['missing_tables'] = $missing;

        $planTables = ['education_plans', 'plan_segments', 'student_plan_assignments', 'segment_completions'];
        $missingPlans = array_values(array_diff($planTables, $tables));
        $result['checks']['education_plans_ready'] = count($missingPlans) === 0;
        if (count($missingPlans) > 0) {
            $result['checks']['missing_plan_tables'] = $missingPlans;
            $result['checks']['plans_hint'] = 'نفّذ database/migrate-education-plans.sql في phpMyAdmin';
        }

        if (in_array('role_accounts', $tables, true)) {
            $count = (int) $pdo->query('SELECT COUNT(*) FROM role_accounts')->fetchColumn();
            $result['checks']['role_accounts_count'] = $count;
        }

        $result['ok'] = count($missing) === 0;
    } catch (Throwable $e) {
        $result['checks']['db_connect'] = 'failed';
        $result['checks']['db_error'] = $e->getMessage();
        $result['hint'] = 'من hPanel → MySQL: تأكد أن DB_NAME و DB_USER و DB_PASS في api/config.php صحيحة لقاعدة u112851217_msht_io';
    }

    json_response($result, $result['ok'] ? 200 : 503);
}
