<?php
declare(strict_types=1);
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/diagnostics.php';
require_once __DIR__ . '/lib/grade-write-api.php';

function handle_health_check(): void
{
    $result = ['ok' => false, 'service' => 'quran-hub-api', 'checks' => []];
    if (!defined('DB_NAME')) {
        $result['checks']['config'] = 'missing';
        json_response($result, 503);
        return;
    }
    $result['checks']['config'] = 'ok';
    // A later schema failure must never relabel a successful connection.
    try {
        $pdo = db();
        $pdo->query('SELECT 1');
        $result['checks']['db_connect'] = 'ok';
    } catch (Throwable $error) {
        $result['checks']['db_connect'] = 'failed';
        $result['checks']['failure_category'] = api_database_error_category($error);
        $result['checks']['reference'] = api_log_failure($error, 'health_connection');
        json_response($result, 503);
        return;
    }
    try {
        $schema = schema_inspect($pdo);
        $result['checks']['schema_ready'] = $schema['ready'];
        $result['checks']['retry_delay_configurable'] = $schema['retry_delay_configurable'];
        $result['checks']['grade_protocol'] = grade_writes_enabled() ? 'atomic' : 'legacy';
        $result['checks']['grade_workers_reloadable'] = !filter_var(ini_get('opcache.enable'), FILTER_VALIDATE_BOOLEAN) ||
            (filter_var(ini_get('opcache.validate_timestamps'), FILTER_VALIDATE_BOOLEAN) && (int) ini_get('opcache.revalidate_freq') <= 30);
        if (!$schema['ready']) {
            $result['checks']['failure_category'] = 'schema';
            $result['checks']['reference'] = api_log_failure(new ApiSchemaException(array_merge(
                $schema['missing_columns'], $schema['missing_unique_keys'],
                $schema['app_state_capacity_ready'] ? [] : ['app_state.value capacity'],
            )), 'health_schema');
        }
        $result['ok'] = $schema['ready'];
    } catch (Throwable $error) {
        $result['checks']['schema_ready'] = false;
        $result['checks']['failure_category'] = api_database_error_category($error);
        $result['checks']['reference'] = api_log_failure($error, 'health_schema');
    }
    json_response($result, $result['ok'] ? 200 : 503);
}
