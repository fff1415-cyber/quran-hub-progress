<?php

declare(strict_types=1);

function parent_recommendations_ensure_table(PDO $pdo): void
{
    $pdo->exec('CREATE TABLE IF NOT EXISTS parent_recommendations (
        id CHAR(36) NOT NULL PRIMARY KEY,
        complex_id INT UNSIGNED NOT NULL,
        student_id VARCHAR(50) NOT NULL,
        teacher_name VARCHAR(255) NOT NULL,
        recommendation TEXT NOT NULL,
        created_at DATETIME NOT NULL,
        KEY idx_parent_recommendations_student (complex_id, student_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
}

function handle_list_parent_recommendations(): void
{
    $auth = require_auth();
    if (($auth['role'] ?? '') !== 'student' || empty($auth['studentId'])) {
        error_response('غير مصرح بعرض التوصيات', 403);
    }
    $cid = require_complex_id($auth);
    $studentId = (string) $auth['studentId'];
    if ((string) ($_GET['studentId'] ?? '') !== $studentId) {
        error_response('لا يمكنك عرض توصيات طالب آخر', 403);
    }
    $pdo = db();
    $tenants = table_column_exists($pdo, 'students', 'complex_id');
    $check = $pdo->prepare($tenants
        ? 'SELECT id FROM students WHERE id = ? AND complex_id = ? LIMIT 1'
        : 'SELECT id FROM students WHERE id = ? LIMIT 1');
    $check->execute($tenants ? [$studentId, $cid] : [$studentId]);
    if (!$check->fetchColumn()) error_response('الطالب غير موجود', 404);

    parent_recommendations_ensure_table($pdo);
    $stmt = $pdo->prepare('SELECT id, teacher_name AS teacherName, recommendation, created_at AS createdAt
        FROM parent_recommendations WHERE complex_id = ? AND student_id = ?
        ORDER BY created_at DESC, id DESC');
    $stmt->execute([$cid, $studentId]);
    json_response(['items' => $stmt->fetchAll()]);
}

function handle_send_parent_recommendation(): void
{
    $auth = require_auth();
    if (($auth['role'] ?? '') !== 'teacher') error_response('المعلم فقط يرسل التوصية', 403);
    $cid = require_complex_id($auth);
    $input = json_input();
    $studentId = trim((string) ($input['studentId'] ?? ''));
    $recommendation = trim((string) ($input['recommendation'] ?? ''));
    if ($studentId === '' || $recommendation === '' || mb_strlen($recommendation) > 1000) {
        error_response('اختر الطالب واكتب توصية لا تتجاوز 1000 حرف', 400);
    }
    $pdo = db();
    $tenants = table_column_exists($pdo, 'students', 'complex_id');
    $check = $pdo->prepare($tenants
        ? 'SELECT id FROM students WHERE id = ? AND halaqa_id = ? AND complex_id = ? LIMIT 1'
        : 'SELECT id FROM students WHERE id = ? AND halaqa_id = ? LIMIT 1');
    $check->execute($tenants
        ? [$studentId, (int) ($auth['halaqaId'] ?? 0), $cid]
        : [$studentId, (int) ($auth['halaqaId'] ?? 0)]);
    if (!$check->fetchColumn()) error_response('الطالب خارج حلقتك', 403);

    parent_recommendations_ensure_table($pdo);
    $item = [
        'id' => new_uuid(),
        'teacherName' => (string) ($auth['name'] ?? 'المعلم'),
        'recommendation' => $recommendation,
        'createdAt' => (new DateTimeImmutable('now', new DateTimeZone('Asia/Riyadh')))->format('Y-m-d H:i:s'),
    ];
    $stmt = $pdo->prepare('INSERT INTO parent_recommendations
        (id, complex_id, student_id, teacher_name, recommendation, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    $stmt->execute([$item['id'], $cid, $studentId, $item['teacherName'], $recommendation, $item['createdAt']]);
    json_response(['item' => $item], 201);
}
