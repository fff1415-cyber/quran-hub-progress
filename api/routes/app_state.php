<?php

declare(strict_types=1);

function app_state_tenant_enabled(PDO $pdo): bool
{
    return table_column_exists($pdo, 'app_state', 'complex_id');
}

/** Encode for app_state.value — always valid JSON (string, object, array, …). */
function app_state_json_encode(mixed $value): string
{
    $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    if ($json === false) {
        throw new InvalidArgumentException('تعذّر ترميز البيانات');
    }
    return $json;
}

function app_state_upsert(PDO $pdo, string $key, mixed $value, ?int $complexId = null): void
{
    $json = app_state_json_encode($value);
    $tenants = app_state_tenant_enabled($pdo);

    if ($tenants) {
        if ($complexId === null || $complexId <= 0) {
            throw new InvalidArgumentException('complex_id مطلوب');
        }
        $stmt = $pdo->prepare(
            'INSERT INTO app_state (`complex_id`, `key`, value) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE value = ?'
        );
        $stmt->execute([$complexId, $key, $json, $json]);
        return;
    }

    $stmt = $pdo->prepare(
        'INSERT INTO app_state (`key`, value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE value = ?'
    );
    $stmt->execute([$key, $json, $json]);
}

function handle_list_app_state(): void
{
    $auth = require_auth();
    $role = (string) ($auth['role'] ?? '');
    $cid = require_complex_id($auth);
    $pdo = db();
    $tenants = app_state_tenant_enabled($pdo);
    $keyFilter = (string) ($_GET['key'] ?? '');
    if ($keyFilter === 'staff_tasks_v1') error_response('اعرض المهام من الواجهة المخصصة', 403);

    if (in_array($role, ['test_member', 'test_chair'], true)) {
        $allowed = ['weekly_tests', 'weekly_tests_settings'];
        if ($role === 'test_chair') $allowed = array_merge($allowed, ['staff_attendance', 'staff_attendance_settings']);
        if ($keyFilter !== '' && !in_array($keyFilter, $allowed, true)) error_response('غير مصرح بعرض هذه البيانات', 403);
        $placeholders = implode(',', array_fill(0, count($allowed), '?'));
        $sql = $tenants
            ? "SELECT `key`, value FROM app_state WHERE complex_id = ? AND `key` IN ($placeholders)"
            : "SELECT `key`, value FROM app_state WHERE `key` IN ($placeholders)";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($tenants ? array_merge([$cid], $allowed) : $allowed);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$row) {
            $row['value'] = json_decode($row['value'] ?? '{}', true);
            $row['context_complex_id'] = $cid;
        }
        json_response($keyFilter === '' ? $rows : array_values(array_filter($rows, fn($row) => $row['key'] === $keyFilter)));
    }

    if ($tenants) {
        if ($keyFilter !== '') {
            $stmt = $pdo->prepare('SELECT `key`, value FROM app_state WHERE complex_id = ? AND `key` = ?');
            $stmt->execute([$cid, $keyFilter]);
            $rows = $stmt->fetchAll();
        } else {
            $stmt = $pdo->prepare('SELECT `key`, value FROM app_state WHERE complex_id = ?');
            $stmt->execute([$cid]);
            $rows = $stmt->fetchAll();
        }
    } else if ($keyFilter !== '') {
        $stmt = $pdo->prepare('SELECT `key`, value FROM app_state WHERE `key` = ?');
        $stmt->execute([$keyFilter]);
        $rows = $stmt->fetchAll();
    } else {
        $rows = $pdo->query('SELECT `key`, value FROM app_state')->fetchAll();
    }
    $rows = array_values(array_filter($rows, static fn (array $row): bool => ($row['key'] ?? '') !== 'staff_tasks_v1'));
    foreach ($rows as &$row) {
        $row['value'] = json_decode($row['value'] ?? '{}', true);
        $row['context_complex_id'] = $cid;
        if (($row['key'] ?? '') === 'grades') $row['cell_sync'] = grade_cells_context($pdo, $cid);
        if (($row['key'] ?? '') === 'sard_queue' && is_array($row['value'])) {
            $row['value'] = sard_reconcile_queue($row['value'], sard_current_assignments($pdo, $cid));
        }
    }
    if (!$rows && $keyFilter === 'grades') $rows[] = ['key'=>'grades','value'=>new stdClass(),'context_complex_id'=>$cid,'cell_sync'=>grade_cells_context($pdo,$cid)];
    json_response($rows);
}

/** Native grade data stays native; only future writes create a separate revision record. */
function grade_cells_context(PDO $pdo, int $cid, bool $lockSemester = false): array
{
    $scoped = app_state_tenant_enabled($pdo);
    $stmt = $pdo->prepare('SELECT value FROM app_state WHERE '.($scoped?'complex_id = ? AND ':'').'`key` = ?');
    $stmt->execute($scoped?[$cid,'__qhp_grade_cell_versions_v1']:['__qhp_grade_cell_versions_v1']);
    $raw = $stmt->fetchColumn();
    $meta = $raw === false ? [] : json_decode((string)$raw,true);
    if (!is_array($meta)) throw new RuntimeException('مرجع تعديلات الدرجات يحتاج مراجعة؛ لم تُغيّر البيانات');
    $semester = null;
    if (plans_table_exists($pdo,'semesters')) {
        $tenants = table_column_exists($pdo,'semesters','complex_id');
        $s = $pdo->prepare('SELECT id FROM semesters WHERE is_active = 1'.($tenants?' AND complex_id = ?':'').' ORDER BY id'.($lockSemester?' FOR UPDATE':''));
        $s->execute($tenants?[$cid]:[]);$ids=$s->fetchAll(PDO::FETCH_COLUMN);
        if (count($ids)>1) throw new RuntimeException('تعذّر تأكيد الفصل الحالي؛ توجد فصول نشطة متعددة');
        if ($ids) $semester=(string)$ids[0];
    }
    return ['version'=>1,'semester_id'=>$semester,'versions'=>$meta['versions']??new stdClass()];
}

function grade_cells_lock(PDO $pdo, int $cid): array
{
    $scoped=app_state_tenant_enabled($pdo);
    foreach(['grades','__qhp_grade_cell_versions_v1'] as $key){
        $args=$scoped?[$cid,$key]:[$key];
        $pdo->prepare($scoped?'INSERT IGNORE INTO app_state (complex_id, `key`, value) VALUES (?, ?, ?)':'INSERT IGNORE INTO app_state (`key`, value) VALUES (?, ?)')->execute([...$args,'{}']);
        $s=$pdo->prepare('SELECT value FROM app_state WHERE '.($scoped?'complex_id = ? AND ':'').'`key` = ? FOR UPDATE');$s->execute($args);
        $raw=$s->fetchColumn();$value=json_decode((string)$raw,true);
        if ($raw===false || !is_array($value)) throw new RuntimeException('مخزن الدرجات أو مرجعه بصيغة تحتاج مراجعة؛ لم تُغيّر البيانات');
        if ($key==='grades') $grades=$value; else $meta=$value;
    }
    return [$grades,$meta];
}

function grade_cell_value(array $store, array $path): array
{
    $value=$store;
    foreach($path as $part){if(!is_array($value)||!array_key_exists($part,$value))return ['present'=>false];$value=$value[$part];}
    return ['present'=>true,'value'=>$value];
}
function grade_cell_tokens(array $versions,array $path): array
{
    $tokens=[];
    for($i=1;$i<=count($path);$i++){$key='d:'.grade_cell_path_key(array_slice($path,0,$i));$tokens[$key]=$versions[$key]??null;}
    $key='a:'.grade_cell_path_key($path);$tokens[$key]=$versions[$key]??null;return $tokens;
}
function grade_cell_path_key(array $path): string {return (string)json_encode($path,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);}
function grade_cell_same(mixed $left,mixed $right): bool
{
    $canonical=function(mixed $value)use(&$canonical):mixed{if(is_array($value)){if(!app_state_history_is_list($value))ksort($value);foreach($value as &$item)$item=$canonical($item);unset($item);}return $value;};
    return app_state_json_encode($canonical($left))===app_state_json_encode($canonical($right));
}
function grade_cell_unversioned_default(array $cell,array $path): bool
{
    if(!$cell['present'])return true;
    $defaults=['attendance'=>'','hifz'=>'','rabt'=>'','muraja'=>'','wajib'=>false,'compensationFaces'=>0,'hifzPlanSegments'=>[]];
    $field=end($path);return $path[2]==='days'&&count($path)===5&&array_key_exists($field,$defaults)&&grade_cell_same($cell['value']??null,$defaults[$field]);
}
function grade_cell_mark(array &$meta,array $path,string $id): void
{
    $meta['versions']['d:'.grade_cell_path_key($path)]=$id;
    for($i=1;$i<=count($path);$i++)$meta['versions']['a:'.grade_cell_path_key(array_slice($path,0,$i))]=$id;
}
function grade_cell_put(array &$store,array $path,array $next): void
{
    $ref=&$store;$last=array_pop($path);
    foreach($path as $part){if(!isset($ref[$part])||!is_array($ref[$part]))$ref[$part]=[];$ref=&$ref[$part];}
    if($next['present'])$ref[$last]=$next['value']??null;else unset($ref[$last]);
}

function app_state_save_grade_cells(PDO $pdo,int $cid,mixed $input): array
{
    if(!is_array($input)||($input['protocol']??null)!=='grade_cells_v1'||!is_array($input['changes']??null))error_response('حدّث الصفحة؛ حفظ الدرجات يتطلب تعديلات الخلايا المحددة، ولم تُغيّر البيانات',409);
    $id=(string)($input['operation_id']??'');
    if(!preg_match('/^[A-Za-z0-9:_-]{8,128}$/',$id))error_response('طلب حفظ الدرجات غير صالح',400);
    $pdo->beginTransaction();
    try{
        [$store,$meta]=grade_cells_lock($pdo,$cid);
        $context=grade_cells_context($pdo,$cid,true);
        if(!array_key_exists('semester_id',$input)||$input['semester_id']!==$context['semester_id'])throw new RuntimeException('تغيّر الفصل الدراسي؛ لم تُحفظ درجات التبويب القديم');
        foreach($input['changes'] as $change){
            $path=$change['path']??null;$base=$change['base']??null;$next=$change['next']??null;
            if(!is_array($path)||count($path)<3||count($path)>12||!is_array($base)||!is_array($next)||!isset($base['present'],$next['present'])||!is_bool($base['present'])||!is_bool($next['present'])||!is_array($change['tokens']??null))throw new RuntimeException('خلية درجات غير صالحة');
            foreach($path as $part)if(!is_string($part)||$part===''||in_array($part,['__proto__','prototype','constructor'],true))throw new RuntimeException('مسار درجة غير صالح');
            if(!ctype_digit($path[1])||(int)$path[1]<1||($path[2]==='days'?count($path)<5:count($path)!==3))throw new RuntimeException('موضع الدرجة غير صالح');
            $current=grade_cell_value($store,$path);$versions=$meta['versions']??[];$leaf='d:'.grade_cell_path_key($path);
            if(($versions[$leaf]??null)===$id){if(!grade_cell_same($current,$next))throw new RuntimeException('معرّف الحفظ مستخدم لقيمة أخرى');continue;}
            $actualTokens=grade_cell_tokens($versions,$path);
            $emptyInitialization=!array_filter($actualTokens,static fn($v)=>$v!==null)&&grade_cell_unversioned_default($current,$path)&&grade_cell_unversioned_default($base,$path);
            if(!grade_cell_same($actualTokens,$change['tokens'])||(!grade_cell_same($current,$base)&&!$emptyInitialization))throw new RuntimeException('تعارض تعديل الدرجة من جهاز آخر؛ احفظ نسخة المسودة وحدّث القيم قبل إعادة التعديل');
            grade_cell_put($store,$path,$next);grade_cell_mark($meta,$path,$id);
        }
        $scoped=app_state_tenant_enabled($pdo);app_state_upsert($pdo,'grades',$store,$scoped?$cid:null);app_state_upsert($pdo,'__qhp_grade_cell_versions_v1',$meta,$scoped?$cid:null);
        $context['versions']=$meta['versions']??new stdClass();$pdo->commit();
        return ['ok'=>true,'value'=>$store?:new stdClass(),'cell_sync'=>$context,'context_complex_id'=>$cid];
    }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();error_response($e->getMessage(),$e instanceof PDOException?500:409);}
}

/** Preserve obsolete requests as history while excluding them from actionable queues. */
function sard_reconcile_queue(array $queue, array $assignments): array
{
    $passed = [];
    foreach ($queue as &$q) {
        if (($q['status'] ?? '') !== 'passed') continue;
        $a = $assignments[$q['studentId'] ?? ''] ?? null;
        if (empty($q['assignmentId']) && $a) {
            $passedTime = strtotime((string) ($q['passedAt'] ?? ''));
            $assignedTime = strtotime((string) ($a['assigned_at'] ?? ''));
            if (($q['closedPlanTitle'] ?? $q['planTitle'] ?? '') === ($a['title'] ?? '') && $passedTime && $assignedTime && $passedTime >= $assignedTime) $q['assignmentId'] = $a['id'];
        }
        if (!empty($q['assignmentId'])) $passed[$q['assignmentId']] = true;
    }
    unset($q);
    $active = ['plan_completed', 'pending', 'scheduled', 'awaiting_review', 'awaiting_supervisor', 'approved_third'];
    foreach ($queue as &$q) {
        if (!in_array($q['status'] ?? '', $active, true)) continue;
        $a = $assignments[$q['studentId'] ?? ''] ?? null;
        $reason = null;
        if (!$a) $reason = 'no_current_assignment';
        elseif (!empty($q['assignmentId']) && $q['assignmentId'] !== $a['id']) $reason = 'previous_assignment';
        elseif (empty($q['assignmentId'])) {
            $eventTime = strtotime((string) ($q['planCompletedAt'] ?? $q['createdAt'] ?? ''));
            $assignedTime = strtotime((string) ($a['assigned_at'] ?? ''));
            if (($q['planTitle'] ?? '') !== ($a['title'] ?? '') || !$eventTime || !$assignedTime || $eventTime < $assignedTime) $reason = 'unverified_legacy_assignment';
            else $q['assignmentId'] = $a['id'];
        }
        if (!$reason && isset($passed[$a['id']])) $reason = 'already_passed';
        if ($reason) {
            $q['status'] = 'archived';
            $q['archiveReason'] = $reason;
        }
    }
    unset($q);
    // One live request per assignment, including historical duplicates created by different devices.
    $winner = [];
    foreach ($queue as $i => $q) {
        if (!in_array($q['status'] ?? '', $active, true) || empty($q['assignmentId'])) continue;
        $key = $q['assignmentId'];
        if (!isset($winner[$key])) { $winner[$key] = $i; continue; }
        $prior = $winner[$key];
        $currentForwarded = !empty($q['supervisorForwardedAt']);
        $priorForwarded = !empty($queue[$prior]['supervisorForwardedAt']);
        $lose = $currentForwarded && !$priorForwarded ? $prior : $i;
        if ($lose === $prior) $winner[$key] = $i;
        $queue[$lose]['status'] = 'archived';
        $queue[$lose]['archiveReason'] = 'duplicate_assignment_request';
    }
    return $queue;
}

function sard_current_assignments(PDO $pdo, int $cid): array
{
    if (!plans_table_exists($pdo, 'student_plan_assignments')) return [];
    $scoped = table_column_exists($pdo, 'students', 'complex_id');
    $sql = "SELECT a.id, a.student_id, a.plan_id, a.assigned_at, a.start_segment_index, p.title
            FROM student_plan_assignments a JOIN students s ON s.id = a.student_id
            JOIN education_plans p ON p.id = a.plan_id
            WHERE a.status IN ('active', 'frozen')" . ($scoped ? ' AND s.complex_id = ?' : '') . ' ORDER BY a.assigned_at DESC';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($scoped ? [$cid] : []);
    $out = [];
    foreach ($stmt->fetchAll() as $a) if (!isset($out[$a['student_id']])) $out[$a['student_id']] = $a;
    return $out;
}

/** Compare only modified items under a row lock; stale devices cannot erase other items. */
function app_state_patch_sard(PDO $pdo, int $cid, mixed $value): void
{
    if (!is_array($value) || !isset($value['changes']) || !is_array($value['changes'])) {
        error_response('نسخة الصفحة قديمة — حدّث الصفحة قبل تعديل السرد', 409);
    }
    $tenants = app_state_tenant_enabled($pdo);
    $scope = $tenants ? 'complex_id = ? AND `key` = ?' : '`key` = ?';
    $params = $tenants ? [$cid, 'sard_queue'] : ['sard_queue'];
    plans_ensure_completion_assignment_column($pdo);
    $pdo->beginTransaction();
    try {
        $sql = $tenants ? 'INSERT IGNORE INTO app_state (complex_id, `key`, value) VALUES (?, ?, ?)' : 'INSERT IGNORE INTO app_state (`key`, value) VALUES (?, ?)';
        $pdo->prepare($sql)->execute(array_merge($params, ['[]']));
        $stmt = $pdo->prepare('SELECT value FROM app_state WHERE ' . $scope . ' FOR UPDATE');
        $stmt->execute($params);
        $assignments = sard_current_assignments($pdo, $cid);
        $queue = sard_reconcile_queue(json_decode((string) $stmt->fetchColumn(), true) ?: [], $assignments);
        foreach ($value['changes'] as $change) {
            $item = $change['item'] ?? null;
            if (!is_array($item) || empty($item['id']) || empty($item['studentId'])) throw new RuntimeException('عنصر سرد غير صالح');
            $index = null;
            foreach ($queue as $i => $existing) if ($existing['id'] === $item['id']) { $index = $i; break; }
            $current = $index === null ? null : $queue[$index];
            if ($current == $item) continue; // Idempotent retry.
            $restoreSupervisorHifz = $current
                && ($current['status'] ?? '') === 'archived'
                && ($current['archiveReason'] ?? '') === 'supervisor_hifz_removed'
                && ($item['status'] ?? '') === 'plan_completed'
                && ($item['assignmentId'] ?? '') === ($current['assignmentId'] ?? null);
            if ($current && in_array($current['status'] ?? '', ['archived', 'passed'], true) && ($item['status'] ?? '') !== $current['status'] && !$restoreSupervisorHifz) throw new RuntimeException('هذا الطلب منتهٍ — لا يمكن إعادته لقائمة العمل');
            if ($current != ($change['base'] ?? null)) throw new RuntimeException('تغيّر السرد من جهاز آخر — حدّث الصفحة');
            if (($index === null || $restoreSupervisorHifz) && ($item['status'] ?? '') === 'plan_completed') {
                $a = $assignments[$item['studentId']] ?? null;
                if (!$a || empty($item['assignmentId']) || $item['assignmentId'] !== $a['id']) throw new RuntimeException('لا توجد خطة حالية مؤكدة للطلب');
                $done = $pdo->prepare("SELECT COUNT(*) AS total, SUM(EXISTS(SELECT 1 FROM segment_completions c WHERE c.student_id = ? AND c.plan_id = s.plan_id AND c.segment_index = s.segment_index AND c.task_type = 'hifz' AND (c.assignment_id = ? OR (c.assignment_id IS NULL AND c.created_at >= ?)))) AS done FROM plan_segments s WHERE s.plan_id = ? AND s.segment_index >= ?");
                $done->execute([$item['studentId'], $a['id'], $a['assigned_at'], $a['plan_id'], $a['start_segment_index']]);
                $counts = $done->fetch();
                if ((int) $counts['total'] < 1 || (int) $counts['total'] !== (int) $counts['done']) throw new RuntimeException('لم يكتمل حفظ الخطة الحالية');
            }
            $validated = sard_reconcile_queue([$item], $assignments)[0];
            if (($validated['status'] ?? '') === 'archived' && ($item['status'] ?? '') !== 'archived') throw new RuntimeException('الطلب يخص خطة سابقة — حدّث الصفحة');
            if ($index === null) $queue[] = $validated;
            else $queue[$index] = $validated;
        }
        foreach (($value['removals'] ?? []) as $removal) {
            foreach ($queue as &$entry) {
                if ($entry['id'] !== ($removal['id'] ?? '')) continue;
                if ($entry != ($removal['base'] ?? null)) throw new RuntimeException('تغيّر الطلب قبل الحذف — حدّث الصفحة');
                if (($entry['status'] ?? '') === 'passed') throw new RuntimeException('لا يمكن حذف سجل الاجتياز');
                $entry['status'] = 'archived';
                $entry['archiveReason'] = 'removed_by_manager';
            }
            unset($entry);
        }
        $queue = sard_reconcile_queue($queue, $assignments);
        app_state_upsert($pdo, 'sard_queue', $queue, $tenants ? $cid : null);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_response($e->getMessage(), 409);
    }
}

/** Retention comparison only: never assigns an ID to a legacy row. */
function app_state_history_is_list(array $value): bool
{
    return $value === [] || array_keys($value) === range(0, count($value) - 1);
}

function app_state_history_retention_key(mixed $record): string
{
    if (is_array($record) && (is_string($record['id'] ?? null) && $record['id'] !== '' || is_int($record['id'] ?? null))) {
        return 'id:' . app_state_json_encode($record['id']);
    }
    return 'raw:' . hash('sha256', app_state_json_encode($record));
}

/** Keep the existing array format; a stale or truncated client must not silently omit stored rows. */
function app_state_save_untruncated_history(PDO $pdo, int $cid, string $key, array $value): void
{
    $tenants = app_state_tenant_enabled($pdo);
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('SELECT value FROM app_state WHERE ' . ($tenants ? 'complex_id = ? AND ' : '') . '`key` = ? FOR UPDATE');
        $stmt->execute($tenants ? [$cid, $key] : [$key]);
        $raw = $stmt->fetchColumn();
        $previous = $raw === false ? null : json_decode((string) $raw, true);
        if ($raw !== false && $raw !== 'null' && (!str_starts_with(ltrim((string) $raw), '[') || !is_array($previous) || !app_state_history_is_list($previous))) {
            $pdo->rollBack();
            error_response('السجل السابق محفوظ بصيغة تحتاج مراجعة — لم يُستبدل', 409);
        }
        $remaining = [];
        foreach ($value as $record) {
            $keyForRow = app_state_history_retention_key($record);
            $remaining[$keyForRow] = ($remaining[$keyForRow] ?? 0) + 1;
        }
        foreach ($previous ?? [] as $record) {
            $keyForRow = app_state_history_retention_key($record);
            if (empty($remaining[$keyForRow])) {
                $pdo->rollBack();
                error_response('الطلب مختصر أو قديم وسيُسقط سجلات محفوظة — حدّث الصفحة؛ لم يتغير التاريخ المحفوظ', 409);
            }
            $remaining[$keyForRow]--;
        }
        app_state_upsert($pdo, $key, $value, $tenants ? $cid : null);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

function handle_set_app_state(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    $input = json_input();
    $key = (string) ($input['key'] ?? '');
    if ($key === 'late_permissions') error_response('سجّل إذن الدخول من الواجهة المخصصة', 403);
    if ($key === 'staff_tasks_v1') error_response('حدّث المهام من الواجهة المخصصة', 403);
    $role = (string) ($auth['role'] ?? '');
    if (in_array($role, ['test_member', 'test_chair'], true)) {
        $allowed = $role === 'test_chair' ? ['weekly_tests', 'staff_attendance'] : ['weekly_tests'];
        if (!in_array($key, $allowed, true)) error_response('غير مصرح بتعديل هذه البيانات', 403);
        if ($key === 'weekly_tests' && ($input['value'] ?? null) !== []) error_response('سجّل الاختبارات من الواجهة المخصصة', 403);
    }
    if ($key === '') {
        error_response('Missing key');
    }

    $pdo = db();
    if ($key === '__qhp_grade_cell_versions_v1') error_response('معرّف مخزن داخلي؛ استخدم مسار حفظ خلايا الدرجات', 400);
    if ($key === 'grades') {
        json_response(app_state_save_grade_cells($pdo,$cid,$input['value']??null));
        return;
    }
    if ($key === 'sard_queue') {
        if (!empty($input['value']['removals']) && $role !== 'manager') error_response('المدير فقط يمكنه إزالة الطلب', 403);
        app_state_patch_sard($pdo, $cid, $input['value'] ?? null);
        json_response(['ok' => true]);
        return;
    }
    try {
        if (in_array($key, ['sard_history', 'academic_records'], true) && is_array($input['value'] ?? null) && app_state_history_is_list($input['value'])) {
            app_state_save_untruncated_history($pdo, $cid, $key, $input['value']);
            json_response(['ok' => true]);
            return;
        }
        if (app_state_tenant_enabled($pdo)) {
            app_state_upsert($pdo, $key, $input['value'] ?? null, $cid);
        } else {
            app_state_upsert($pdo, $key, $input['value'] ?? null);
        }
    } catch (PDOException $e) {
        if (pdo_is_integrity_violation($e)) {
            error_response(pdo_integrity_error_message($e) . ' | ' . pdo_sql_error_detail($e), 409);
        }
        throw $e;
    } catch (InvalidArgumentException $e) {
        error_response($e->getMessage(), 400);
    }
    json_response(['ok' => true]);
}
