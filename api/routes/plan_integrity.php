<?php

declare(strict_types=1);

/** Data-integrity helpers only. Callers retain their existing auth/role/tenant checks. */
function plans_require_integrity_schema(PDO $pdo): void
{
    foreach (['plan_assignment_completions', 'plan_operations'] as $table) {
        if (!plans_table_exists($pdo, $table)) {
            throw new RuntimeException('تحديث حماية سجل الخطط لم يُنفّذ بعد — راجع دليل الترحيل');
        }
    }
    if (!plans_column_exists($pdo, 'student_plan_assignments', 'content_snapshot')) {
        throw new RuntimeException('تحديث إصدارات الخطط لم يُنفّذ بعد');
    }
}

function plans_lock_student(PDO $pdo, string $studentId): void
{
    $pdo->prepare('SELECT id FROM students WHERE id = ? FOR UPDATE')->execute([$studentId]);
}

function plans_current_assignment(PDO $pdo, string $studentId): ?array
{
    $stmt = $pdo->prepare("SELECT a.*, p.track, p.title, p.level_number FROM student_plan_assignments a JOIN education_plans p ON p.id = a.plan_id WHERE a.student_id = ? AND a.status IN ('active', 'frozen') ORDER BY a.assigned_at DESC, a.id FOR UPDATE");
    $stmt->execute([$studentId]);
    $rows = $stmt->fetchAll();
    if (count($rows) > 1) throw new RuntimeException('للطالب تعيينات حالية متعددة محفوظة — يلزم مراجعتها دون حذفها');
    $row=$rows[0]??null;
    if($row){$snapshot=json_decode((string)($row['content_snapshot']??''),true);foreach(['track','title','level_number'] as $field)if(isset($snapshot['plan'][$field]))$row[$field]=$snapshot['plan'][$field];}
    return $row;
}

function plans_operation_id(array $input): string
{
    $id = trim((string) ($input['operation_id'] ?? ''));
    if (!preg_match('/^[a-zA-Z0-9:_-]{8,128}$/', $id)) throw new RuntimeException('حدّث الصفحة؛ معرّف عملية الحفظ مطلوب لإعادة المحاولة بأمان');
    return $id;
}

function plans_operation_replay(PDO $pdo, string $id, string $studentId, string $kind, array $input, ?int $cid = null): ?array
{
    $stmt = $pdo->prepare('SELECT student_id, operation_kind, input_hash, response_json FROM plan_operations WHERE id = ? FOR UPDATE');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) return null;
    $hash = hash('sha256', app_state_json_encode($input));
    if ($row['student_id'] !== $studentId || $row['operation_kind'] !== $kind || $row['input_hash'] !== $hash) throw new RuntimeException('معرّف العملية مستخدم لطلب مختلف — أعد تحميل الحالة');
    $response=json_decode($row['response_json'],true);
    foreach($response['_bulk_keys']??[] as $key){
        if($cid===null)throw new RuntimeException('سياق استعادة العملية غير متاح');
        $scoped=app_state_tenant_enabled($pdo);$s=$pdo->prepare('SELECT value FROM app_state WHERE '.($scoped?'complex_id = ? AND ':'').'`key` = ?');$s->execute($scoped?[$cid,$key]:[$key]);$raw=json_decode((string)$s->fetchColumn(),true);
        if($key==='sard_queue')$response[$key]=$raw??[];
        else{$value=state_scope_value(state_envelope($raw),$key,$key==='grades'?(string)$response['semester_id']:'_');$response[$key]=state_list_key($key)?array_values($value):$value;}
    }
    unset($response['_bulk_keys']);return $response;
}

function plans_operation_save(PDO $pdo, string $id, string $studentId, string $kind, array $input, array $response): void
{
    // Persist the operation result, not an ever-growing duplicate of every student's store.
    // Replays reload confirmed shared values while retaining the original event/assignment identity.
    $bulk=[];foreach(['grades','academic_records','sard_history','sard_queue'] as $key)if(isset($response[$key])&&is_array($response[$key])){$bulk[]=$key;unset($response[$key]);}
    if($bulk)$response['_bulk_keys']=$bulk;
    $withInput=plans_column_exists($pdo,'plan_operations','input_json');
    $pdo->prepare($withInput
        ? 'INSERT INTO plan_operations (id, student_id, operation_kind, input_hash, response_json, input_json) VALUES (?, ?, ?, ?, ?, ?)'
        : 'INSERT INTO plan_operations (id, student_id, operation_kind, input_hash, response_json) VALUES (?, ?, ?, ?, ?)')
        ->execute(array_merge([$id,$studentId,$kind,hash('sha256',app_state_json_encode($input)),app_state_json_encode($response)],$withInput?[app_state_json_encode($input)]:[]));
}

/** Snapshot means content observed now, never a claim about an unknown past syllabus. */
function plans_content_snapshot(PDO $pdo, string $planId, string $provenance = 'assigned_from_catalog'): array
{
    $stmt = $pdo->prepare('SELECT * FROM education_plans WHERE id = ?'.($pdo->inTransaction()?' FOR UPDATE':''));
    $stmt->execute([$planId]);
    $plan = $stmt->fetch();
    if (!$plan) throw new RuntimeException('الخطة غير موجودة');
    $segments = $pdo->prepare('SELECT id, plan_id, segment_index, hifz_plan, rabt_plan, muraja_plan FROM plan_segments WHERE plan_id = ? ORDER BY segment_index');
    $segments->execute([$planId]);
    return ['plan' => $plan, 'segments' => $segments->fetchAll(), 'observed_at' => gmdate('c'), 'provenance' => $provenance];
}

function plans_assignment_content(PDO $pdo, array $assignment): array
{
    $snapshot = json_decode((string) ($assignment['content_snapshot'] ?? ''), true);
    if (is_array($snapshot) && isset($snapshot['plan'], $snapshot['segments'])) return $snapshot;
    return plans_content_snapshot($pdo, (string) $assignment['plan_id'], 'legacy_catalog_observed_not_original');
}

function plans_hifz_complete(PDO $pdo, array $assignment): bool
{
    $content = plans_assignment_content($pdo, $assignment);
    $eligible = array_values(array_filter($content['segments'], fn($s) => (int) $s['segment_index'] >= (int) $assignment['start_segment_index']));
    if (!$eligible) return false;
    $stmt = $pdo->prepare("SELECT segment_index FROM plan_assignment_completions WHERE student_id = ? AND assignment_id = ? AND task_type = 'hifz' AND revoked_at IS NULL");
    $stmt->execute([$assignment['student_id'], $assignment['id']]);
    $done = array_map('intval', array_column($stmt->fetchAll(), 'segment_index'));
    foreach ($eligible as $segment) if (!in_array((int) $segment['segment_index'], $done, true)) return false;
    return true;
}

function plans_assert_start(array $snapshot, int $start): void
{
    foreach ($snapshot['segments'] as $s) if ((int) $s['segment_index'] === $start) return;
    throw new RuntimeException('مقطع البداية غير موجود في إصدار الخطة');
}

function plans_pin_existing_content(PDO $pdo, string $planId): void
{
    $snapshot = app_state_json_encode(plans_content_snapshot($pdo, $planId, 'observed_before_catalog_update_not_original'));
    $pdo->prepare('UPDATE student_plan_assignments SET content_snapshot = ? WHERE plan_id = ? AND content_snapshot IS NULL')->execute([$snapshot, $planId]);
}
