<?php
declare(strict_types=1);

/** Only additions previously attempted by request handlers. No rewriting or attribution of records. */
function runtime_column_migrations(): array
{
    $faces = [
        'daily_hifz_faces' => 'TINYINT UNSIGNED NOT NULL DEFAULT 2',
        'daily_rabt_faces' => 'TINYINT UNSIGNED NOT NULL DEFAULT 2',
        'daily_muraja_faces' => 'TINYINT UNSIGNED NOT NULL DEFAULT 2',
        'faces_per_half' => 'TINYINT UNSIGNED NOT NULL DEFAULT 1',
        'faces_per_one' => 'TINYINT UNSIGNED NOT NULL DEFAULT 2',
        'faces_per_two' => 'TINYINT UNSIGNED NOT NULL DEFAULT 4',
    ];
    return [
        'students' => ['student_phone' => "VARCHAR(30) NOT NULL DEFAULT ''", 'institute_level' => 'VARCHAR(50) NULL DEFAULT NULL', 'phase_number' => 'INT UNSIGNED NULL DEFAULT NULL', 'assigned_assistant_code' => 'VARCHAR(50) NULL DEFAULT NULL'],
        'halaqat' => ['extra_assistants' => 'JSON NULL DEFAULT NULL'],
        'education_plans' => $faces,
        'student_plan_assignments' => array_merge(['plan_start_date' => 'DATE NULL DEFAULT NULL', 'start_muraja_segment' => 'INT NULL DEFAULT NULL', 'transferred_at' => 'TIMESTAMP NULL DEFAULT NULL'], $faces),
        'segment_completions' => ['assignment_id' => 'CHAR(36) NULL DEFAULT NULL'],
        'complexes' => ['is_active' => 'TINYINT(1) NOT NULL DEFAULT 1'],
    ];
}

function runtime_column_migration_plan(PDO $pdo): array
{
    $plan = [];
    foreach (runtime_column_migrations() as $table => $columns) {
        $check = $pdo->prepare('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?');
        $check->execute([$table]);
        if (!(int) $check->fetchColumn()) throw new RuntimeException('Required base table absent: ' . $table);
        foreach ($columns as $column => $definition) {
            $check = $pdo->prepare('SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?');
            $check->execute([$table, $column]);
            if (!(int) $check->fetchColumn()) $plan[] = "ALTER TABLE `$table` ADD COLUMN `$column` $definition";
        }
    }
    return $plan;
}

/** DDL is explicitly non-transactional. Resume by recomputing the remaining additions after any interruption. */
function runtime_apply_column_migrations(PDO $pdo): int
{
    if ($pdo->inTransaction()) throw new RuntimeException('Cannot migrate inside a transaction');
    $lock = $pdo->query("SELECT GET_LOCK(CONCAT(DATABASE(), ':qhp-runtime-schema'), 10)")->fetchColumn();
    if ((int) $lock !== 1) throw new RuntimeException('Migration lock unavailable');
    try {
        $plan = runtime_column_migration_plan($pdo);
        foreach ($plan as $statement) $pdo->exec($statement);
        return count($plan);
    } finally {
        $pdo->query("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':qhp-runtime-schema'))");
    }
}
