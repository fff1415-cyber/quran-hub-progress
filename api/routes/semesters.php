<?php

declare(strict_types=1);

function decode_json_array(mixed $raw): array
{
    if (is_array($raw)) {
        return $raw;
    }
    if (is_string($raw) && $raw !== '') {
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }
    return [];
}

function semester_row_to_array(array $row): array
{
    return [
        'id' => $row['id'],
        'name' => $row['name'],
        'start_date' => $row['start_date'],
        'weeks_count' => (int) $row['weeks_count'],
        'working_days' => decode_json_array($row['working_days'] ?? '[]'),
        'excluded_dates' => decode_json_array($row['excluded_dates'] ?? '[]'),
        'is_active' => (bool) $row['is_active'],
        'created_at' => $row['created_at'] ?? null,
    ];
}

function handle_list_semesters(): void
{
    require_auth();
    $pdo = db();
    $rows = $pdo->query(
        'SELECT id, name, start_date, weeks_count, working_days, excluded_dates, is_active, created_at
         FROM semesters ORDER BY created_at DESC'
    )->fetchAll();
    json_response(array_map('semester_row_to_array', $rows));
}

function handle_get_active_semester(): void
{
    require_auth();
    $pdo = db();
    $stmt = $pdo->query(
        'SELECT id, name, start_date, weeks_count, working_days, excluded_dates, is_active, created_at
         FROM semesters WHERE is_active = 1 LIMIT 1'
    );
    $semester = $stmt->fetch();
    if (!$semester) {
        json_response(['semester' => null, 'weeks' => []]);
        return;
    }

    $weekStmt = $pdo->prepare(
        'SELECT id, semester_id, week_number, start_date, end_date, created_at
         FROM academic_weeks WHERE semester_id = ? ORDER BY week_number'
    );
    $weekStmt->execute([$semester['id']]);
    $weeks = $weekStmt->fetchAll();

    json_response([
        'semester' => semester_row_to_array($semester),
        'weeks' => $weeks,
    ]);
}

function handle_create_semester(): void
{
    require_auth();
    $input = json_input();
    $semester = $input['semester'] ?? [];
    $weeks = $input['weeks'] ?? [];

    if (!is_array($semester) || !is_array($weeks)) {
        error_response('بيانات الفصل غير صالحة');
    }

    $name = trim((string) ($semester['name'] ?? ''));
    $startDate = trim((string) ($semester['start_date'] ?? ''));
    $weeksCount = (int) ($semester['weeks_count'] ?? 0);
    $workingDays = $semester['working_days'] ?? [];
    $excludedDates = $semester['excluded_dates'] ?? [];

    if ($name === '' || $startDate === '' || $weeksCount < 1) {
        error_response('الاسم وتاريخ البداية وعدد الأسابيع مطلوبة');
    }
    if (!is_array($workingDays) || count($workingDays) === 0) {
        error_response('يجب تحديد يوم عمل واحد على الأقل');
    }
    if (count($weeks) === 0) {
        error_response('يجب إرسال الأسابيع المولّدة');
    }

    $semesterId = new_uuid();
    $pdo = db();

    try {
        $pdo->beginTransaction();

        $pdo->exec('UPDATE semesters SET is_active = 0 WHERE is_active = 1');

        $insertSemester = $pdo->prepare(
            'INSERT INTO semesters (id, name, start_date, weeks_count, working_days, excluded_dates, is_active)
             VALUES (:id, :name, :start_date, :weeks_count, :working_days, :excluded_dates, 1)'
        );
        $insertSemester->execute([
            ':id' => $semesterId,
            ':name' => $name,
            ':start_date' => $startDate,
            ':weeks_count' => $weeksCount,
            ':working_days' => json_encode(array_values($workingDays), JSON_UNESCAPED_UNICODE),
            ':excluded_dates' => json_encode(array_values($excludedDates), JSON_UNESCAPED_UNICODE),
        ]);

        $insertWeek = $pdo->prepare(
            'INSERT INTO academic_weeks (id, semester_id, week_number, start_date, end_date)
             VALUES (:id, :semester_id, :week_number, :start_date, :end_date)'
        );

        foreach ($weeks as $w) {
            if (!is_array($w)) {
                throw new RuntimeException('بيانات أسبوع غير صالحة');
            }
            $weekNumber = (int) ($w['week_number'] ?? 0);
            $weekStart = trim((string) ($w['start_date'] ?? ''));
            $weekEnd = trim((string) ($w['end_date'] ?? ''));
            if ($weekNumber < 1 || $weekStart === '' || $weekEnd === '') {
                throw new RuntimeException('بيانات أسبوع ناقصة');
            }
            $insertWeek->execute([
                ':id' => new_uuid(),
                ':semester_id' => $semesterId,
                ':week_number' => $weekNumber,
                ':start_date' => $weekStart,
                ':end_date' => $weekEnd,
            ]);
        }

        $pdo->commit();
        json_response(['ok' => true, 'id' => $semesterId, 'weeks_count' => count($weeks)]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_response('فشل حفظ الفصل الدراسي: ' . $e->getMessage(), 500);
    }
}
