<?php
declare(strict_types=1);

final class ApiSchemaException extends RuntimeException
{
    public function __construct(public readonly array $missing)
    {
        parent::__construct('بنية قاعدة البيانات تحتاج تحديثًا معتمدًا؛ لم تتغير أي جداول', 503);
    }
}

/** Runtime guards inspect metadata only. DDL belongs exclusively to reviewed CLI migrations. */
function schema_require_columns(PDO $pdo, string $table, array $columns): void
{
    $missing = [];
    foreach ($columns as $column) {
        if (!table_column_exists($pdo, $table, $column)) $missing[] = $table . '.' . $column;
    }
    if ($missing) throw new ApiSchemaException($missing);
}

/** Contract for the currently shipped multi-tenant application, not proposed future tables. */
function schema_required_columns(): array
{
    $faces = ['daily_hifz_faces', 'daily_rabt_faces', 'daily_muraja_faces', 'faces_per_half', 'faces_per_one', 'faces_per_two'];
    return [
        'complexes' => ['id', 'name', 'subdomain', 'logo_url', 'primary_color', 'theme_key', 'contact_phone', 'is_active'],
        'halaqat' => ['complex_id', 'id', 'name', 'is_talqeen', 'teacher_name', 'teacher_code', 'assistant_name', 'assistant_code', 'extra_assistants'],
        'students' => ['id', 'complex_id', 'name', 'halaqa_id', 'national_id', 'parent_phone', 'student_phone', 'level', 'level_type', 'institute_level', 'phase_number', 'assigned_to', 'assigned_assistant_code', 'memorized'],
        'role_accounts' => ['id', 'complex_id', 'role', 'name', 'code', 'permissions', 'created_at'],
        'app_state' => ['complex_id', 'key', 'value', 'updated_at'],
        'semesters' => ['id', 'complex_id', 'name', 'start_date', 'weeks_count', 'working_days', 'excluded_dates', 'is_active', 'created_at'],
        'academic_weeks' => ['id', 'semester_id', 'week_number', 'start_date', 'end_date', 'created_at'],
        'education_plans' => array_merge(['id', 'complex_id', 'track', 'level_number', 'title', 'segment_count', 'created_at'], $faces),
        'plan_segments' => ['id', 'plan_id', 'segment_index', 'hifz_plan', 'rabt_plan', 'muraja_plan', 'created_at'],
        'student_plan_assignments' => array_merge(['id', 'student_id', 'plan_id', 'start_segment_index', 'plan_start_date', 'start_muraja_segment', 'status', 'assigned_by', 'assigned_at', 'frozen_at', 'transferred_at'], $faces),
        'segment_completions' => ['id', 'assignment_id', 'student_id', 'plan_id', 'segment_index', 'task_type', 'completed_at', 'recorded_by', 'created_at'],
        'evaluation_settings' => ['complex_id', 'hifz_max_score', 'review_max_score', 'error_deduction', 'warning_deduction', 'review_error_deduction', 'review_warning_deduction', 'hifz_max_errors', 'hifz_max_warnings', 'review_max_errors_per_segment', 'review_max_warnings_per_segment', 'pass_percent', 'max_minutes_per_face', 'review_segments_under_10', 'review_segments_10_to_20', 'review_segments_over_20'],
        'student_portal_entries' => ['id', 'complex_id', 'student_id', 'visit_key', 'visit_date', 'visited_at'],
        'academic_report_notes' => ['complex_id', 'student_id', 'note', 'updated_by', 'updated_at'],
        'academic_report_approvals' => ['complex_id', 'fingerprint', 'scope', 'period_from', 'period_to', 'approved_by', 'approved_at', 'snapshot_json'],
        'parent_recommendations' => ['id', 'complex_id', 'student_id', 'teacher_name', 'recommendation', 'created_at'],
    ];
}

function schema_required_unique_keys(): array
{
    return [
        'complexes' => [['id'], ['subdomain']],
        'halaqat' => [['complex_id', 'id']],
        'students' => [['id'], ['complex_id', 'national_id']],
        'role_accounts' => [['id'], ['complex_id', 'code']],
        'app_state' => [['complex_id', 'key']],
        'semesters' => [['id']],
        'academic_weeks' => [['id'], ['semester_id', 'week_number']],
        'education_plans' => [['id'], ['complex_id', 'track', 'level_number']],
        'plan_segments' => [['id'], ['plan_id', 'segment_index']],
        'student_plan_assignments' => [['id']],
        'segment_completions' => [['id'], ['student_id', 'plan_id', 'segment_index', 'task_type']],
        'evaluation_settings' => [['complex_id']],
        'student_portal_entries' => [['id'], ['complex_id', 'visit_key']],
        'academic_report_notes' => [['complex_id', 'student_id']],
        'academic_report_approvals' => [['complex_id', 'fingerprint']],
        'parent_recommendations' => [['id']],
    ];
}

function schema_inspect(PDO $pdo): array
{
    $columns = $pdo->query('SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM information_schema.columns WHERE table_schema = DATABASE()')->fetchAll(PDO::FETCH_ASSOC);
    $present = [];
    foreach ($columns as $row) $present[$row['TABLE_NAME']][$row['COLUMN_NAME']] = $row['DATA_TYPE'];
    $missing = [];
    foreach (schema_required_columns() as $table => $expected) {
        foreach ($expected as $column) if (!isset($present[$table][$column])) $missing[] = $table . '.' . $column;
    }
    $indexes = $pdo->query('SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, SUB_PART FROM information_schema.statistics WHERE table_schema = DATABASE() ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX')->fetchAll(PDO::FETCH_ASSOC);
    $keys = [];
    foreach ($indexes as $row) {
        if ((int) $row['NON_UNIQUE'] === 0) $keys[$row['TABLE_NAME']][$row['INDEX_NAME']][] = $row['SUB_PART'] === null ? $row['COLUMN_NAME'] : $row['COLUMN_NAME'] . '(prefix)';
    }
    $missingKeys = [];
    foreach (schema_required_unique_keys() as $table => $expected) {
        foreach ($expected as $key) {
            $available = array_values($keys[$table] ?? []);
            if (in_array($key, $available, true)) continue;
            if ($table === 'segment_completions' && $key === ['student_id', 'plan_id', 'segment_index', 'task_type'] &&
                in_array([...$key, 'assignment_id'], $available, true)) continue;
            $missingKeys[] = $table . '(' . implode(',', $key) . ')';
        }
    }
    $stateType = $present['app_state']['value'] ?? null;
    $capacityReady = in_array($stateType, ['json', 'longtext'], true);
    return [
        'ready' => !$missing && !$missingKeys && $capacityReady,
        'missing_columns' => $missing, 'missing_unique_keys' => $missingKeys,
        'app_state_capacity_ready' => $capacityReady,
        // Existing two-day compatibility remains valid when this optional column is absent.
        'retry_delay_configurable' => isset($present['evaluation_settings']['retry_delay_days']),
    ];
}
