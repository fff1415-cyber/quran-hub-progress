<?php

declare(strict_types=1);

/** Visit rows are separate from app_state, so concurrent entrances are never overwritten. */
function student_entries_ensure_table(PDO $pdo): void
{
    $pdo->exec('CREATE TABLE IF NOT EXISTS student_portal_entries (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        complex_id INT UNSIGNED NOT NULL,
        student_id VARCHAR(50) NOT NULL,
        visit_key CHAR(36) NOT NULL,
        visit_date DATE NOT NULL,
        visited_at DATETIME NOT NULL,
        UNIQUE KEY uk_student_portal_entry (complex_id, visit_key),
        KEY idx_student_portal_date (complex_id, visit_date, student_id),
        KEY idx_student_portal_student (complex_id, student_id, visit_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
}

function student_entries_today(): string
{
    return (new DateTimeImmutable('now', new DateTimeZone('Asia/Riyadh')))->format('Y-m-d');
}

function student_entries_valid_date(string $date): bool
{
    $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
    return $parsed !== false && $parsed->format('Y-m-d') === $date;
}

function handle_record_student_entry(): void
{
    $auth = require_auth();
    if (($auth['role'] ?? '') !== 'student' || empty($auth['studentId'])) error_response('غير مصرح', 403);
    $cid = require_complex_id($auth);
    $studentId = (string) $auth['studentId'];
    $key = (string) (json_input()['visitKey'] ?? '');
    if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $key)) {
        error_response('معرّف الزيارة غير صالح', 400);
    }
    $pdo = db();
    $tenants = table_column_exists($pdo, 'students', 'complex_id');
    $check = $pdo->prepare($tenants
        ? 'SELECT id FROM students WHERE id = ? AND complex_id = ? LIMIT 1'
        : 'SELECT id FROM students WHERE id = ? LIMIT 1');
    $check->execute($tenants ? [$studentId, $cid] : [$studentId]);
    if (!$check->fetchColumn()) error_response('الطالب غير موجود', 404);

    student_entries_ensure_table($pdo);
    $now = new DateTimeImmutable('now', new DateTimeZone('Asia/Riyadh'));
    $stmt = $pdo->prepare('INSERT IGNORE INTO student_portal_entries
        (complex_id, student_id, visit_key, visit_date, visited_at) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([$cid, $studentId, $key, $now->format('Y-m-d'), $now->format('Y-m-d H:i:s')]);
    json_response(['ok' => true]);
}

function handle_list_student_entries(): void
{
    $auth = require_auth();
    if (($auth['role'] ?? '') !== 'manager') error_response('غير مصرح بعرض نشاط الدخول', 403);
    $cid = require_complex_id($auth);
    $date = (string) ($_GET['date'] ?? student_entries_today());
    if (!student_entries_valid_date($date) || $date > student_entries_today()) error_response('التاريخ غير صالح', 400);
    $pdo = db();
    student_entries_ensure_table($pdo);

    $semestersTenant = table_column_exists($pdo, 'semesters', 'complex_id');
    $semester = $pdo->prepare($semestersTenant
        ? 'SELECT id, name, start_date FROM semesters WHERE complex_id = ? AND is_active = 1 LIMIT 1'
        : 'SELECT id, name, start_date FROM semesters WHERE is_active = 1 LIMIT 1');
    $semester->execute($semestersTenant ? [$cid] : []);
    $activeSemester = $semester->fetch() ?: null;

    $studentsTenant = table_column_exists($pdo, 'students', 'complex_id');
    $studentJoin = $studentsTenant ? 'AND s.complex_id = e.complex_id' : '';
    $halaqatTenant = table_column_exists($pdo, 'halaqat', 'complex_id');
    $halaqaJoin = $halaqatTenant ? 'AND h.complex_id = e.complex_id' : '';
    $daily = $pdo->prepare("SELECT e.student_id AS studentId, COALESCE(s.name, 'طالب محذوف') AS studentName,
        COALESCE(h.name, '—') AS halaqaName, COUNT(*) AS visits
        FROM student_portal_entries e
        LEFT JOIN students s ON s.id = e.student_id $studentJoin
        LEFT JOIN halaqat h ON h.id = s.halaqa_id $halaqaJoin
        WHERE e.complex_id = ? AND e.visit_date = ?
        GROUP BY e.student_id, s.name, h.name
        ORDER BY visits DESC, studentName ASC");
    $daily->execute([$cid, $date]);
    $rows = array_map(static fn (array $row): array => [
        'studentId' => $row['studentId'], 'studentName' => $row['studentName'],
        'halaqaName' => $row['halaqaName'], 'visits' => (int) $row['visits'],
    ], $daily->fetchAll());

    $semesterTotal = null;
    if ($activeSemester) {
        $sum = $pdo->prepare('SELECT COUNT(*) FROM student_portal_entries
            WHERE complex_id = ? AND visit_date BETWEEN ? AND ?');
        $sum->execute([$cid, $activeSemester['start_date'], student_entries_today()]);
        $semesterTotal = (int) $sum->fetchColumn();
    }
    json_response([
        'date' => $date, 'today' => student_entries_today(),
        'total' => array_sum(array_column($rows, 'visits')), 'people' => count($rows),
        'rows' => $rows, 'semesterTotal' => $semesterTotal,
        'semester' => $activeSemester ? ['name' => $activeSemester['name'], 'startDate' => $activeSemester['start_date']] : null,
    ]);
}
