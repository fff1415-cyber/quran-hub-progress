<?php

declare(strict_types=1);

const LATE_PERMISSIONS_KEY = 'late_permissions';

function late_permissions_assert_role(array $auth): void
{
    if (!in_array((string) ($auth['role'] ?? ''), ['manager', 'secretary', 'teacher', 'assistant'], true)) {
        error_response('Forbidden', 403);
    }
}

function late_permissions_locked(PDO $pdo, int $cid): array
{
    $tenant = app_state_tenant_enabled($pdo);
    $insert = $pdo->prepare($tenant
        ? 'INSERT IGNORE INTO app_state (complex_id, `key`, value) VALUES (?, ?, ?)'
        : 'INSERT IGNORE INTO app_state (`key`, value) VALUES (?, ?)');
    $insert->execute($tenant ? [$cid, LATE_PERMISSIONS_KEY, '[]'] : [LATE_PERMISSIONS_KEY, '[]']);
    $pdo->beginTransaction();
    $select = $pdo->prepare($tenant
        ? 'SELECT value FROM app_state WHERE complex_id = ? AND `key` = ? FOR UPDATE'
        : 'SELECT value FROM app_state WHERE `key` = ? FOR UPDATE');
    $select->execute($tenant ? [$cid, LATE_PERMISSIONS_KEY] : [LATE_PERMISSIONS_KEY]);
    $rows = json_decode((string) $select->fetchColumn(), true);
    return is_array($rows) ? array_values($rows) : [];
}

function late_permissions_visible(array $row, array $auth): bool
{
    return !in_array(($auth['role'] ?? ''), ['teacher', 'assistant'], true)
        || (int) ($row['halaqaId'] ?? 0) === (int) ($auth['halaqaId'] ?? 0);
}

function handle_list_late_permissions(): void
{
    $auth = require_auth();
    late_permissions_assert_role($auth);
    $pdo = db();
    $rows = late_permissions_locked($pdo, require_complex_id($auth));
    $pdo->commit();
    json_response(['items' => array_values(array_filter($rows, static fn (array $row): bool => late_permissions_visible($row, $auth)))]);
}

function handle_change_late_permission(): void
{
    $auth = require_auth();
    late_permissions_assert_role($auth);
    $input = json_input();
    $action = (string) ($input['action'] ?? '');
    $cid = require_complex_id($auth);
    $pdo = db();

    if ($action === 'grant') {
        if (!in_array(($auth['role'] ?? ''), ['manager', 'secretary'], true)) error_response('Forbidden', 403);
        $studentId = trim((string) ($input['studentId'] ?? ''));
        $date = (new DateTimeImmutable('now', new DateTimeZone('Asia/Riyadh')))->format('Y-m-d');
        $tenants = table_column_exists($pdo, 'students', 'complex_id');
        $stmt = $pdo->prepare($tenants
            ? 'SELECT id, name, halaqa_id FROM students WHERE id = ? AND complex_id = ?'
            : 'SELECT id, name, halaqa_id FROM students WHERE id = ?');
        $stmt->execute($tenants ? [$studentId, $cid] : [$studentId]);
        $student = $stmt->fetch();
        if (!$student) error_response('الطالب غير موجود في المجمع', 404);
    } elseif ($action !== 'acknowledge' && $action !== 'remove') {
        error_response('إجراء غير معروف', 400);
    }

    $rows = late_permissions_locked($pdo, $cid);
    try {
        if ($action === 'grant') {
            foreach ($rows as $row) {
                if (($row['studentId'] ?? '') === $studentId && ($row['date'] ?? '') === $date) {
                    $pdo->commit();
                    json_response(['item' => $row, 'alreadyGranted' => true]);
                }
            }
            $item = [
                'id' => new_uuid(),
                'studentId' => $studentId,
                'studentName' => (string) $student['name'],
                'halaqaId' => (int) $student['halaqa_id'],
                'date' => $date,
                'grantedBy' => (string) ($auth['name'] ?? 'الإدارة'),
                'grantedAt' => (new DateTimeImmutable('now', new DateTimeZone('Asia/Riyadh')))->format(DATE_ATOM),
            ];
            array_unshift($rows, $item);
        } else {
            $id = (string) ($input['id'] ?? '');
            $item = null;
            foreach ($rows as &$row) {
                if (($row['id'] ?? '') !== $id) continue;
                if (!late_permissions_visible($row, $auth)) {
                    $pdo->rollBack();
                    error_response('Forbidden', 403);
                }
                $row[$action === 'remove' ? 'removedAt' : 'acknowledgedAt'] = date(DATE_ATOM);
                $item = $row;
                break;
            }
            unset($row);
            if ($item === null) {
                $pdo->rollBack();
                error_response('الإذن غير موجود', 404);
            }
        }
        app_state_upsert($pdo, LATE_PERMISSIONS_KEY, array_slice($rows, 0, 1000), app_state_tenant_enabled($pdo) ? $cid : null);
        $pdo->commit();
        json_response(['item' => $item, 'alreadyGranted' => false]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}
