<?php
declare(strict_types=1);
if (!function_exists('qhp_load_private_test_config')) require_once __DIR__ . '/private-test-config.php';

// Executed only through CLI on the server. No HTTP entry point or production writes.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$stage = 'configuration';
$checks = [];
try {
    $root = realpath($argv[1] ?? '');
    $home = realpath($argv[2] ?? '');
    if (!$root || !$home || !str_starts_with($root . '/', $home . '/')) throw new RuntimeException('Invalid main root');
    require $root . '/config.php';
    $checks['production_identity_matches'] = DB_NAME === 'u112851217_msht_io';
    if (DB_NAME !== 'u112851217_msht_io') throw new RuntimeException('Unexpected production identity');
    $testName = 'u112851217_msht_test';
    $privateConfig = $home . '/.qhp-private/msht-test.php';
    $settings = ['host' => DB_HOST, 'database' => $testName, 'user' => DB_USER, 'password' => DB_PASS];
    $source = 'existing_server_credentials';
    $checks['private_config_present'] = is_file($privateConfig);
    if (is_file($privateConfig)) {
        $realConfig = realpath($privateConfig);
        if (!$realConfig || is_link($privateConfig) || !str_starts_with($realConfig, $home . '/.qhp-private/')) throw new RuntimeException('Invalid private test config');
        if ((fileperms($privateConfig) & 0077) !== 0) {
            if (!chmod($privateConfig, 0600)) throw new RuntimeException('Cannot secure private test config');
            clearstatcache(true, $privateConfig);
        }
        $checks['private_config_secured'] = (fileperms($privateConfig) & 0077) === 0;
        if (!$checks['private_config_secured']) throw new RuntimeException('Private test config remains insecure');
        $privateContents = file_get_contents($privateConfig);
        if ($privateContents === false) throw new RuntimeException('Cannot read private test configuration');
        $settings = qhp_load_private_test_config($privateContents);
        $source = 'private_server_file';
    }
    $checks['private_config_array'] = is_array($settings);
    $checks['test_identity_matches'] = is_array($settings) && ($settings['database'] ?? '') === $testName;
    if (!is_array($settings) || ($settings['database'] ?? '') !== $testName) throw new RuntimeException('Test identity must be explicit');
    foreach (['host', 'user', 'password'] as $key) if (!is_string($settings[$key] ?? null) || $settings[$key] === '') throw new RuntimeException('Incomplete test config');
    $options = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];
    $stage = 'test_connection';
    $test = new PDO('mysql:host=' . $settings['host'] . ';dbname=' . $testName . ';charset=utf8mb4', $settings['user'], $settings['password'], $options);
    if ($test->query('SELECT DATABASE()')->fetchColumn() !== $testName) throw new RuntimeException('Unexpected test connection');
    // Preserve the original private file and normalize only after its credentials prove the exact test identity.
    if (isset($privateContents)) {
        $canonical = "<?php\nreturn " . var_export($settings, true) . ";\n";
        if (trim($privateContents) !== trim($canonical)) {
            if (!hash_equals(hash('sha256', $privateContents), (string) hash_file('sha256', $privateConfig))) throw new RuntimeException('Private configuration changed during verification');
            $suffix = bin2hex(random_bytes(6));
            $backupFile = $privateConfig . '.before-normalize-' . $suffix;
            $temporaryFile = $privateConfig . '.normalized-' . $suffix;
            $previousMask = umask(0077);
            try {
                if (file_put_contents($backupFile, $privateContents, LOCK_EX) === false || file_put_contents($temporaryFile, $canonical, LOCK_EX) === false) throw new RuntimeException('Cannot preserve private configuration');
                if (!rename($temporaryFile, $privateConfig)) throw new RuntimeException('Cannot normalize private configuration');
            } finally { umask($previousMask); }
            $checks['private_config_normalized'] = true;
        }
    }
    $stage = 'production_connection';
    $production = new PDO('mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET, DB_USER, DB_PASS, $options);
    foreach ([$production, $test] as $pdo) {
        $pdo->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        $pdo->exec('SET TRANSACTION READ ONLY');
        $pdo->beginTransaction();
    }
    $stage = 'schema_comparison';
    function restore_metadata(PDO $pdo): array {
        $columns = $pdo->query('SELECT TABLE_NAME,COLUMN_NAME,ORDINAL_POSITION,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA FROM information_schema.columns WHERE table_schema=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION')->fetchAll();
        $indexes = $pdo->query('SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,SUB_PART FROM information_schema.statistics WHERE table_schema=DATABASE() ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX')->fetchAll();
        return ['columns'=>$columns,'indexes'=>$indexes];
    }
    $productionMetadata = restore_metadata($production);
    $testMetadata = restore_metadata($test);
    $tables = $production->query("SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME")->fetchAll(PDO::FETCH_COLUMN);
    $testTables = $test->query("SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME")->fetchAll(PDO::FETCH_COLUMN);
    $stage = 'record_comparison';
    $report = [];
    $hmacKey = random_bytes(32); // Never exported; only whole-table equality is reported.
    foreach ($tables as $table) {
        if (!preg_match('/^[A-Za-z0-9_]+$/', $table)) throw new RuntimeException('Unexpected table identifier');
        if (!in_array($table, $testTables, true)) { $report[$table] = ['present'=>false]; continue; }
        $pk=[];
        foreach ($productionMetadata['indexes'] as $index) if ($index['TABLE_NAME']===$table && $index['INDEX_NAME']==='PRIMARY') $pk[]=$index['COLUMN_NAME'];
        if (!$pk) { $report[$table]=['present'=>true,'comparison'=>'no_stable_primary_key']; continue; }
        $sql = 'SELECT * FROM `' . $table . '` ORDER BY `' . implode('`,`', $pk) . '`';
        $summaries = [];
        foreach ([$production, $test] as $pdo) {
            $hash = hash_init('sha256', HASH_HMAC, $hmacKey);
            $query = $pdo->query($sql); $count = 0;
            while ($row=$query->fetch(PDO::FETCH_ASSOC)) {
                foreach ($row as &$value) if ($value!==null) $value=(string)$value;
                unset($value); ksort($row);
                hash_update($hash, (string)json_encode($row, JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE) . "\n"); $count++;
            }
            $summaries[]=['count'=>$count,'digest'=>hash_final($hash)];
        }
        $report[$table]=['present'=>true,'production_rows'=>$summaries[0]['count'],'restored_rows'=>$summaries[1]['count'],'matches_current_production'=>hash_equals($summaries[0]['digest'],$summaries[1]['digest'])];
    }
    foreach ([$production, $test] as $pdo) $pdo->rollBack();
    $stage='main_isolation';
    $mainFront=realpath(dirname($root)); $isolation=[];
    foreach (['m1','m2'] as $sub) {
        $front=realpath($home.'/domains/'.$sub.'.msht.io/public_html');
        $api=realpath($home.'/domains/'.$sub.'.msht.io/public_html/api');
        $isolation[$sub]=['expected_front_present'=>$front!==false,'same_front_root'=>$front!==false&&$front===$mainFront,'expected_api_present'=>$api!==false,'same_api_root'=>$api!==false&&$api===$root];
    }
    echo json_encode(['status'=>'verified_readonly','test_credential_source'=>$source,'schema_matches_current_production'=>$productionMetadata===$testMetadata,'table_sets_match'=>$tables===$testTables,'tables'=>$report,'isolation'=>$isolation,'subdomain_sync_variable_enabled'=>getenv('SEPARATE_SUBDOMAINS')==='true','production_writes'=>false,'test_writes'=>false],JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT)."\n";
} catch (Throwable $error) {
    // Only classify our own fixed messages; never expose PDO, token values or parser diagnostics.
    $knownConfigurationErrors = [
        'Private test configuration too large'=>'too_large',
        'Ambiguous private configuration'=>'ambiguous',
        'Private configuration needs literal connection fields'=>'missing_literal_fields',
        'Private configuration names an unexpected database'=>'unexpected_database',
    ];
    if ($stage === 'configuration') $checks['private_config_problem'] = $knownConfigurationErrors[$error->getMessage()] ?? ($error instanceof ParseError ? 'php_syntax' : 'unclassified');
    foreach (['production','test'] as $name) if (isset($$name) && $$name instanceof PDO && $$name->inTransaction()) $$name->rollBack();
    echo json_encode(['status'=>'incomplete','checks'=>$checks,'failed_stage'=>$stage,'errno'=>$error instanceof PDOException?(int)($error->errorInfo[1]??0):null,'private_test_config_required'=>$stage==='test_connection','production_writes'=>false,'test_writes'=>false])."\n";
    exit(1);
}
