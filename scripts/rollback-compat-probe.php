<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);

final class ProbeResponse extends RuntimeException {
    public function __construct(public mixed $body, int $status) { parent::__construct('', $status); }
}
function json_response(mixed $data, int $status = 200): never {
    $GLOBALS['probeHttpResponse'] = new ProbeResponse($data, $status);
    throw $GLOBALS['probeHttpResponse'];
}
function error_response(string $message, int $status = 400): never {
    // Production exits in json_response(). Its broad catch blocks can catch
    // the test sentinel, but they cannot change the original HTTP response.
    throw $GLOBALS['probeHttpResponse'] ?? new ProbeResponse(null, $status);
}
function db(): PDO { return $GLOBALS['testPdo']; }
function require_auth(): array { return $GLOBALS['testAuth']; }
function json_input(): array { return $GLOBALS['testInput']; }
function probe(string $handler, array $query = [], array $input = []): ProbeResponse {
    $_GET = $query;
    $GLOBALS['testInput'] = $input;
    $GLOBALS['probeHttpResponse'] = null;
    try { $handler(); }
    catch (ProbeResponse $response) { return $response; }
    throw new RuntimeException('handler_did_not_respond');
}
function grade_body(ProbeResponse $response): array {
    if ($response->getCode() !== 200) throw new RuntimeException('grade_read_failed');
    foreach ($response->body as $row) if (($row['key'] ?? null) === 'grades' && is_array($row['value'])) return $row['value'];
    throw new RuntimeException('grade_snapshot_missing');
}

$stage = 'scope';
try {
    $home = $argv[1] ?? '';
    $root = $argv[2] ?? '';
    if (!preg_match('~^/home/[A-Za-z0-9_-]+$~D', $home) ||
        $root !== $home.'/domains/msht.io/public_html/api' || realpath($root) !== $root) throw new RuntimeException('site_scope');
    $secret = $home.'/.qhp-private/msht-test.php';
    if (realpath($secret) !== $secret || (fileperms($secret) & 0077) !== 0) throw new RuntimeException('test_config_permissions');
    require $root.'/config.php';
    $settings = qhp_load_private_test_config((string) file_get_contents($secret));
    if (DB_NAME !== 'u112851217_msht_io' || $settings['database'] !== 'u112851217_msht_test' ||
        $settings['user'] === DB_USER) throw new RuntimeException('isolation_check');
    $pdo = new PDO('mysql:host='.$settings['host'].';dbname='.$settings['database'].';charset=utf8mb4',
        $settings['user'], $settings['password'], [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
    qhp_restore_identity($pdo, 'u112851217_msht_test');
    $GLOBALS['testPdo'] = $pdo;
    $stage = 'read';
    $pdo->exec('SET TRANSACTION READ ONLY');
    $pdo->beginTransaction();
    $cid = (int) $pdo->query("SELECT id FROM complexes WHERE subdomain='mm'")->fetchColumn();
    $find = $pdo->prepare("SELECT s.id,s.halaqa_id FROM students s JOIN student_plan_assignments a ON a.student_id=s.id WHERE s.complex_id=? AND a.status='active' LIMIT 1");
    $find->execute([$cid]); $sample = $find->fetch();
    if (!$cid || !$sample) throw new RuntimeException('sample_not_available');
    $reads = [];
    foreach (['manager','teacher','assistant'] as $role) {
        $GLOBALS['testAuth'] = ['role'=>$role,'complexId'=>$cid,'halaqaId'=>(int)$sample['halaqa_id'],'name'=>'Rollback compatibility fixture'];
        $checks = [
            'students'=>['handle_list_students', []],
            'calendar'=>['handle_get_active_semester', []],
            'grades'=>['handle_list_app_state', ['key'=>'grades']],
            'plans'=>['handle_student_plan_sheet', ['student_id'=>$sample['id']]],
        ];
        foreach ($checks as $name => [$handler,$args]) {
            try { $reads[$role][$name] = probe($handler, $args)->getCode(); }
            catch (Throwable $ignored) { $reads[$role][$name] = 500; }
        }
    }
    $before = grade_body(probe('handle_list_app_state',['key'=>'grades']));
    $receiptCount = (int)$pdo->query('SELECT COUNT(*) FROM grade_operation_receipts')->fetchColumn();
    $pdo->rollBack();

    $stage = 'stale_write_reproduction';
    // Isolated database only. The legacy handler never commits this outer
    // transaction, so the test changes never survive the rollback.
    $pdo->beginTransaction();
    $baseline = ['qhp-synthetic-a'=>['attendance'=>0], 'qhp-synthetic-b'=>['attendance'=>0]];
    $GLOBALS['testAuth']['role'] = 'manager';
    $seed = probe('handle_set_app_state', [], ['key'=>'grades','value'=>$baseline]);
    if ($seed->getCode() !== 200) throw new RuntimeException('synthetic_seed_failed');
    $GLOBALS['testAuth']['role'] = 'teacher';
    $a = grade_body(probe('handle_list_app_state',['key'=>'grades']));
    $GLOBALS['testAuth']['role'] = 'assistant';
    $b = grade_body(probe('handle_list_app_state',['key'=>'grades']));
    $a['qhp-synthetic-a']['attendance'] = 1;
    $b['qhp-synthetic-b']['attendance'] = 1;
    $GLOBALS['testAuth']['role'] = 'teacher';
    $writeA = probe('handle_set_app_state', [], ['key'=>'grades','value'=>$a])->getCode();
    $GLOBALS['testAuth']['role'] = 'assistant';
    $writeB = probe('handle_set_app_state', [], ['key'=>'grades','value'=>$b])->getCode();
    $after = grade_body(probe('handle_list_app_state',['key'=>'grades']));
    $pdo->rollBack();
    $restored = grade_body(probe('handle_list_app_state',['key'=>'grades']));
    if ($restored !== $before || $writeA !== 200 || $writeB !== 200) throw new RuntimeException('test_incomplete');
    echo json_encode(['database'=>'isolated_test','old_revision'=>'7e9adf1','reads'=>$reads,
        'existing_atomic_receipts'=>$receiptCount,'old_save_responses'=>[$writeA,$writeB],
        'first_confirmed_edit_lost'=>$after['qhp-synthetic-a']['attendance']===0,
        'second_edit_retained'=>$after['qhp-synthetic-b']['attendance']===1,
        'isolated_test_transaction_reverted'=>true,'production_writes'=>false], JSON_THROW_ON_ERROR).PHP_EOL;
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    echo json_encode(['status'=>'incomplete','stage'=>$stage,'class'=>get_class($e),'reason'=>$e instanceof RuntimeException && preg_match('/^[a-z_]+$/D',$e->getMessage()) ? $e->getMessage() : null]).PHP_EOL;
    exit(1);
}
