<?php

declare(strict_types=1);

function academic_reports_ensure(PDO $pdo): void
{
    $pdo->exec('CREATE TABLE IF NOT EXISTS academic_report_notes (
        complex_id INT UNSIGNED NOT NULL, student_id VARCHAR(50) NOT NULL,
        note TEXT NOT NULL, updated_by VARCHAR(255) NOT NULL, updated_at DATETIME NOT NULL,
        PRIMARY KEY (complex_id, student_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    $pdo->exec('CREATE TABLE IF NOT EXISTS academic_report_approvals (
        complex_id INT UNSIGNED NOT NULL, fingerprint CHAR(64) NOT NULL,
        scope VARCHAR(20) NOT NULL, period_from DATE NOT NULL, period_to DATE NOT NULL,
        approved_by VARCHAR(255) NOT NULL, approved_at DATETIME NOT NULL,
        snapshot_json LONGTEXT NOT NULL,
        PRIMARY KEY (complex_id, fingerprint)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
}

function handle_list_academic_report_notes(): void
{
    $auth = require_auth();
    $role = (string) ($auth['role'] ?? '');
    if (!in_array($role, ['manager', 'teacher'], true)) error_response('غير مصرح', 403);
    $cid = require_complex_id($auth);
    $pdo = db();
    academic_reports_ensure($pdo);
    if ($role === 'manager') {
        $stmt = $pdo->prepare('SELECT student_id, note FROM academic_report_notes WHERE complex_id = ?');
        $stmt->execute([$cid]);
    } else {
        $tenant = table_column_exists($pdo, 'students', 'complex_id');
        $stmt = $pdo->prepare('SELECT n.student_id, n.note FROM academic_report_notes n JOIN students s ON s.id = n.student_id
            WHERE n.complex_id = ? AND s.halaqa_id = ?' . ($tenant ? ' AND s.complex_id = ?' : ''));
        $stmt->execute($tenant ? [$cid, (int) ($auth['halaqaId'] ?? 0), $cid] : [$cid, (int) ($auth['halaqaId'] ?? 0)]);
    }
    $out = [];
    foreach ($stmt->fetchAll() as $row) $out[$row['student_id']] = $row['note'];
    json_response(['notes' => $out]);
}

function handle_save_academic_report_note(): void
{
    $auth = require_auth();
    if (($auth['role'] ?? '') !== 'teacher') error_response('المعلم فقط يكتب التوصية', 403);
    $cid = require_complex_id($auth);
    $input = json_input();
    $id = trim((string) ($input['studentId'] ?? ''));
    $note = trim((string) ($input['note'] ?? ''));
    if ($id === '' || mb_strlen($note) > 500) error_response('التوصية لا تتجاوز 500 حرف', 400);
    $pdo = db();
    $tenant = table_column_exists($pdo, 'students', 'complex_id');
    $stmt = $pdo->prepare('SELECT id FROM students WHERE id = ? AND halaqa_id = ?' . ($tenant ? ' AND complex_id = ?' : '') . ' LIMIT 1');
    $stmt->execute($tenant ? [$id, (int) ($auth['halaqaId'] ?? 0), $cid] : [$id, (int) ($auth['halaqaId'] ?? 0)]);
    if (!$stmt->fetchColumn()) error_response('الطالب خارج حلقتك', 403);
    academic_reports_ensure($pdo);
    $stmt = $pdo->prepare('INSERT INTO academic_report_notes (complex_id, student_id, note, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE note = VALUES(note), updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)');
    $stmt->execute([$cid, $id, $note, (string) ($auth['name'] ?? 'معلم'), (new DateTimeImmutable('now', new DateTimeZone('Asia/Riyadh')))->format('Y-m-d H:i:s')]);
    json_response(['ok' => true]);
}

function handle_academic_report_approval(): void
{
    $auth = require_auth();
    if (($auth['role'] ?? '') !== 'manager') error_response('اعتماد المدير فقط', 403);
    $cid = require_complex_id($auth);
    $input = $_SERVER['REQUEST_METHOD'] === 'POST' ? json_input() : $_GET;
    $fingerprint = (string) ($input['fingerprint'] ?? '');
    if (!preg_match('/^[a-f0-9]{64}$/', $fingerprint)) error_response('بصمة التقرير غير صالحة', 400);
    $pdo = db();
    academic_reports_ensure($pdo);
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $scope = (string) ($input['scope'] ?? '');
        $from = (string) ($input['from'] ?? '');
        $to = (string) ($input['to'] ?? '');
        if (!in_array($scope, ['student', 'halaqa', 'complex'], true) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $from) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $to) || $from > $to) error_response('بيانات التقرير غير صالحة', 400);
        $snapshot = (string) ($input['snapshotJson'] ?? '');
        $decoded = json_decode($snapshot, true);
        if (strlen($snapshot) > 2_000_000 || hash('sha256', $snapshot) !== $fingerprint || !is_array($decoded)
            || ($decoded['options']['scope'] ?? '') !== $scope || ($decoded['options']['from'] ?? '') !== $from
            || ($decoded['options']['to'] ?? '') !== $to) error_response('نسخة التقرير غير صالحة', 400);
        $stmt = $pdo->prepare('INSERT IGNORE INTO academic_report_approvals
            (complex_id, fingerprint, scope, period_from, period_to, approved_by, approved_at, snapshot_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$cid, $fingerprint, $scope, $from, $to, (string) ($auth['name'] ?? 'المدير'), (new DateTimeImmutable('now', new DateTimeZone('Asia/Riyadh')))->format('Y-m-d H:i:s'), $snapshot]);
    }
    $stmt = $pdo->prepare('SELECT approved_by, approved_at, snapshot_json FROM academic_report_approvals WHERE complex_id = ? AND fingerprint = ?');
    $stmt->execute([$cid, $fingerprint]);
    $row = $stmt->fetch();
    json_response(['approval' => $row ? ['by' => $row['approved_by'], 'at' => $row['approved_at'], 'snapshot' => json_decode($row['snapshot_json'], true)] : null]);
}

function handle_list_academic_report_archive(): void
{
    $auth = require_auth();
    if (($auth['role'] ?? '') !== 'manager') error_response('غير مصرح', 403);
    $cid = require_complex_id($auth);
    $pdo = db();
    academic_reports_ensure($pdo);
    $stmt = $pdo->prepare('SELECT fingerprint, scope, period_from, period_to, approved_by, approved_at
        FROM academic_report_approvals WHERE complex_id = ? ORDER BY approved_at DESC LIMIT 100');
    $stmt->execute([$cid]);
    json_response(['items' => $stmt->fetchAll()]);
}
