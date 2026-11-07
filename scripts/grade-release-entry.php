<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
umask(0077);
const GRADE_RELEASE_TAG = '<!-- qhp-grade-protocol:1 -->';
const GRADE_FALLBACK_VERSION = '02aad8f01b4fb420b5456da3fb56bf1b22e956c2';

function grade_release_atomic(string $path, string $contents): void {
    if (is_link($path)) throw new RuntimeException('unexpected_release_link');
    $tmp = tempnam(dirname($path), '.qhp-entry-');
    if (!$tmp) throw new RuntimeException('release_staging_failed');
    try {
        if (file_put_contents($tmp, $contents) !== strlen($contents) || !chmod($tmp, 0644) || !rename($tmp, $path)) {
            throw new RuntimeException('atomic_release_replace_failed');
        }
    } finally { if (is_file($tmp)) unlink($tmp); }
}
function grade_release_check_assets(string $root, string $html): void {
    if (strlen($html) > 100000 || substr_count($html, '</html>') !== 1 || !str_contains($html, '</head>')) throw new RuntimeException('invalid_compiled_entry');
    preg_match_all('~(?:src|href)="(/assets/[a-zA-Z0-9_.-]+\.(?:js|css))"~', $html, $matches);
    $paths = array_unique($matches[1]);
    if (!$paths || count($paths) > 30 || !array_filter($paths, static fn ($path) => str_ends_with($path, '.js'))) throw new RuntimeException('invalid_entry_assets');
    foreach ($paths as $path) {
        $file = $root . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, ltrim($path, '/'));
        if (realpath($file) !== $file || !is_file($file) || filesize($file) === 0) throw new RuntimeException('candidate_asset_missing');
    }
}
function grade_release_lock(string $lockPath) {
    if (is_link($lockPath)) throw new RuntimeException('unexpected_lock_link');
    $lock = fopen($lockPath, 'c+b');
    if (!$lock || !chmod($lockPath, 0600)) throw new RuntimeException('release_lock_unavailable');
    $deadline = microtime(true) + 20;
    while (!flock($lock, LOCK_EX | LOCK_NB)) {
        if (microtime(true) >= $deadline) throw new RuntimeException('legacy_requests_not_drained');
        usleep(20000);
    }
    return $lock;
}
function grade_release_publish(string $root, string $lockPath, string $html, string $base, string $target): void {
    if (!preg_match('/^[a-f0-9]{40}$/D', $base) || !preg_match('/^[a-f0-9]{40}$/D', $target) || str_contains($html, GRADE_RELEASE_TAG)) {
        throw new RuntimeException('invalid_release_identity');
    }
    grade_release_check_assets($root, $html);
    $lock = grade_release_lock($lockPath);
    try {
        if (trim(file_get_contents($root . '/deploy-sha.txt')) !== $base) throw new RuntimeException('published_release_moved');
        $entry = $root . '/index.html';
        $tag = GRADE_RELEASE_TAG . '<!-- qhp-grade-release:' . $target . ' -->';
        // One rename changes both the HTML served to new tabs and the protocol used by PHP.
        grade_release_atomic($entry, str_replace('</head>', $tag . '</head>', $html));
        rewind($lock);
        if (fwrite($lock, '1') !== 1 || !fflush($lock)) throw new RuntimeException('protocol_floor_not_persisted');
        grade_release_atomic($root . '/deploy-sha.txt', $target . "\n");
    } finally { fclose($lock); }
}
function grade_release_fallback(string $root, string $lockPath, string $html, string $apiVersion): void {
    grade_release_check_assets($root, $html);
    if (str_contains($html, GRADE_RELEASE_TAG)) throw new RuntimeException('unexpected_fallback_marker');
    $lock = grade_release_lock($lockPath);
    try {
        rewind($lock);
        if (stream_get_contents($lock, 2) !== '1' || trim(file_get_contents($root . '/deploy-sha.txt')) !== $apiVersion) {
            throw new RuntimeException('fallback_requires_existing_atomic_api');
        }
        $tag = GRADE_RELEASE_TAG . '<!-- qhp-grade-release:' . GRADE_FALLBACK_VERSION . ' -->';
        grade_release_atomic($root . '/index.html', str_replace('</head>', $tag . '</head>', $html));
        // The deployed API SHA must not change when only the HTML entry is rolled back.
    } finally { fclose($lock); }
}
function grade_release_publish_api(string $root, array $items): void {
    if (!$items || count($items) > 80) throw new RuntimeException('invalid_api_package_size');
    $files = []; $directories = [];
    foreach ($items as $item) {
        $relative = $item['path'] ?? '';
        if (!preg_match('~^(?:[a-zA-Z0-9_-]+/)*[a-zA-Z0-9_-]+\.php$~D', $relative) ||
            in_array(basename($relative), ['config.php', 'config.platform.php'], true) || isset($files[$relative])) {
            throw new RuntimeException('invalid_api_path');
        }
        $file = $root . '/api/' . $relative;
        $directory = dirname($file);
        $content = base64_decode($item['content'] ?? '', true);
        $before = $item['beforeSha256'];
        if (realpath($directory) !== $directory) {
            if ($directory !== $root . '/api/lib' || file_exists($directory) || is_link($directory) ||
                realpath(dirname($directory)) !== dirname($directory) || $before !== null) throw new RuntimeException('unexpected_api_parent');
            $directories[$directory] = true;
        }
        $actual = is_file($file) && !is_link($file) ? hash_file('sha256', $file) : null;
        if ($content === false || hash('sha256', $content) !== $item['sha256'] || is_link($file) ||
            ($actual !== $before && $actual !== $item['sha256']) || ($actual === null && file_exists($file))) {
            throw new RuntimeException('api_baseline_or_payload_changed');
        }
        $files[$relative] = [$file, $content, $before === null, $actual === $item['sha256']];
    }
    foreach (array_keys($directories) as $directory) {
        if (!mkdir($directory, 0755) || !chmod($directory, 0755) || realpath($directory) !== $directory) {
            throw new RuntimeException('api_lib_directory_creation_failed');
        }
    }
    // Install new dependencies first. The app-state route supplies the fence before the kiosk route uses it.
    uksort($files, static function ($a, $b) use ($files) {
        $rank = static fn ($p) => $files[$p][2] ? 0 : ($p === 'routes/app_state.php' ? 1 : 2);
        return $rank($a) <=> $rank($b) ?: strcmp($a, $b);
    });
    foreach ($files as [$file, $content, , $unchanged]) if (!$unchanged) grade_release_atomic($file, $content);
}
function grade_release_db(string $root): PDO {
    require_once $root . '/api/config.php';
    if (DB_NAME !== 'u112851217_msht_io') throw new RuntimeException('wrong_production_database');
    $pdo = new PDO('mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET, DB_USER, DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    if ($pdo->query('SELECT DATABASE()')->fetchColumn() !== DB_NAME) throw new RuntimeException('wrong_production_database');
    return $pdo;
}
function grade_release_drain_database(PDO $pdo): void {
    $self = (int) $pdo->query('SELECT CONNECTION_ID()')->fetchColumn();
    $sessions = static function () use ($pdo, $self): array {
        $ids = [];
        foreach ($pdo->query('SHOW PROCESSLIST')->fetchAll(PDO::FETCH_ASSOC) as $row) {
            if ($row['db'] === DB_NAME && (int) $row['Id'] !== $self) $ids[] = (int) $row['Id'];
        }
        return $ids;
    };
    $old = $sessions();
    $deadline = microtime(true) + 40;
    while (array_intersect($old, $sessions())) {
        if (microtime(true) >= $deadline) throw new RuntimeException('precutover_database_sessions_still_open');
        usleep(100000);
    }
}
if (!defined('QHP_GRADE_RELEASE_LIBRARY')) {
    try {
        [$mode, $home, $base, $target] = array_slice($argv, 1, 4);
        $root = $home . '/domains/msht.io/public_html';
        $private = $home . '/.qhp-private';
        if (!preg_match('~^/home/[a-zA-Z0-9_-]+$~D', $home) || realpath($root) !== $root ||
            realpath($private) !== $private || (fileperms($private) & 0077) !== 0) throw new RuntimeException('invalid_main_release_scope');
        if (trim(file_get_contents($root . '/deploy-sha.txt')) !== $base) throw new RuntimeException('published_release_moved');
        $lock = $private . '/grade-cutover.lock';
        if ($mode === 'prepare') {
            $pdo = grade_release_db($root);
            $count = $pdo->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND engine='InnoDB' AND table_name IN ('grade_cell_versions','grade_operation_receipts')")->fetchColumn();
            if ((int) $count !== 2) throw new RuntimeException('verified_grade_tables_required');
            $handle = grade_release_lock($lock);
            if ($base === 'c2d339b801cbb666ef91b1e704a5606267468d63') {
                require_once $root . '/api/config-loader.php';
                api_load_optional_config();
                if ((defined('QHP_GRADE_WRITES_V1') && QHP_GRADE_WRITES_V1 === true) ||
                    stream_get_contents($handle, 2) !== '' || str_contains(file_get_contents($root . '/index.html'), GRADE_RELEASE_TAG)) {
                    throw new RuntimeException('unexpected_existing_grade_activation');
                }
            }
            fclose($handle);
        } elseif ($mode === 'api') {
            if (!is_file($lock) || is_link($lock)) throw new RuntimeException('release_lock_unavailable');
            grade_release_publish_api($root, json_decode(stream_get_contents(STDIN, 5000000), true, 512, JSON_THROW_ON_ERROR));
        } elseif ($mode === 'stage-fallback') {
            $html = base64_decode($argv[5] ?? '', true);
            if (!$html || !preg_match('/^[a-f0-9]{40}$/D', $target)) throw new RuntimeException('candidate_fallback_missing');
            grade_release_check_assets($root, $html);
            $fallback = $private . '/grade-fallback-' . $target . '.html';
            if (is_link($fallback) || file_put_contents($fallback, $html, LOCK_EX) !== strlen($html) || !chmod($fallback, 0600)) {
                throw new RuntimeException('private_fallback_staging_failed');
            }
        } elseif ($mode === 'rollback') {
            if (!preg_match('/^[a-f0-9]{40}$/D', $base)) throw new RuntimeException('invalid_fallback_identity');
            $fallback = $private . '/grade-fallback-' . $base . '.html';
            if (realpath($fallback) !== $fallback || (fileperms($fallback) & 0077) !== 0) throw new RuntimeException('verified_fallback_missing');
            grade_release_fallback($root, $lock, file_get_contents($fallback), $base);
        } elseif ($mode === 'publish') {
            $html = base64_decode($argv[5] ?? '', true);
            if (!$html) throw new RuntimeException('candidate_entry_missing');
            if (file_get_contents($lock) !== '1') {
                $fallback = $private . '/grade-fallback-' . $target . '.html';
                if (realpath($fallback) !== $fallback || (fileperms($fallback) & 0077) !== 0) throw new RuntimeException('verified_fallback_missing');
                grade_release_check_assets($root, file_get_contents($fallback));
                grade_release_drain_database(grade_release_db($root));
            }
            grade_release_publish($root, $lock, $html, $base, $target);
        } else throw new RuntimeException('unknown_release_operation');
        echo json_encode(['status' => 'grade_entry_' . $mode, 'scope' => 'msht.io']) . "\n";
    } catch (Throwable $error) {
        echo json_encode(['status' => 'grade_entry_incomplete',
            'reason' => preg_match('/^[a-z_]+$/D', $error->getMessage()) ? $error->getMessage() : null]) . "\n";
        exit(1);
    }
}
