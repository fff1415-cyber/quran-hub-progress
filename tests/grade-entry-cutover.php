<?php
declare(strict_types=1);
define('QHP_GRADE_RELEASE_LIBRARY', true);
require __DIR__ . '/../scripts/grade-release-entry.php';
require __DIR__ . '/../api/lib/grade-cutover.php';
if (($argv[1] ?? '') === '--worker') {
    echo grade_cutover_protocol($argv[2], $argv[3]) ? "atomic\n" : "legacy\n";
    fflush(STDOUT);
    if (($argv[4] ?? '') === '--hold') fgets(STDIN);
    exit;
}
function expect(bool $passed, string $message): void {
    if (!$passed) throw new LogicException($message);
    echo "PASS: $message\n";
}
function start_grade_worker(string $entry, string $lock, bool $hold): array {
    $process = proc_open([PHP_BINARY, __FILE__, '--worker', $entry, $lock, $hold ? '--hold' : ''],
        [0 => ['pipe','r'], 1 => ['pipe','w'], 2 => ['pipe','w']], $pipes);
    if (!is_resource($process)) throw new RuntimeException('Fixture worker failed');
    return [$process, $pipes, trim((string) fgets($pipes[1]))];
}
function stop_grade_worker(array $worker): void {
    [$process, $pipes] = $worker;
    foreach ($pipes as $pipe) fclose($pipe);
    proc_close($process);
}
$root = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'qhp-cutover-' . bin2hex(random_bytes(6));
mkdir($root, 0700); mkdir($root . '/assets', 0700);
$entry = $root . '/index.html';
$lock = $root . '/cutover.lock';
$base = str_repeat('a', 40);
$target = str_repeat('b', 40);
$main = '<html><head><script src="/assets/main.js"></script></head><body></body></html>';
$fallback = '<html><head><script src="/assets/fallback.js"></script></head><body></body></html>';
if (isset($argv[1], $argv[2])) {
    foreach ([$argv[1], $argv[2]] as $i => $build) {
        $html = file_get_contents($build . '/index.html');
        preg_match_all('~(?:src|href)="(/assets/[a-zA-Z0-9_.-]+\.(?:js|css))"~', $html, $matches);
        foreach ($matches[1] as $asset) copy($build . $asset, $root . $asset);
        if ($i === 0) $main = $html; else $fallback = $html;
    }
} else {
    file_put_contents($root . '/assets/main.js', '/* main */');
    file_put_contents($root . '/assets/fallback.js', '/* fallback */');
}
file_put_contents($entry, '<html><head></head><body>legacy</body></html>');
file_put_contents($root . '/deploy-sha.txt', $base . "\n");
fclose(grade_release_lock($lock));
$worker = null;
try {
    $worker = start_grade_worker($entry, $lock, true);
    expect($worker[2] === 'legacy', 'prepared backend keeps existing grade writes in legacy mode');
    $probe = fopen($lock, 'r+b');
    expect(!flock($probe, LOCK_EX | LOCK_NB), 'legacy request holds the fence until it finishes');
    fclose($probe);
    stop_grade_worker($worker); $worker = null;
    grade_release_publish($root, $lock, $main, $base, $target);
    $worker = start_grade_worker($entry, $lock, false);
    expect($worker[2] === 'atomic' && str_contains(file_get_contents($entry), $target), 'one entry switch activates the candidate frontend and atomic backend');
    stop_grade_worker($worker); $worker = null;
    grade_release_fallback($root, $lock, $fallback, $target);
    $worker = start_grade_worker($entry, $lock, false);
    expect($worker[2] === 'atomic' && str_contains(file_get_contents($entry), GRADE_FALLBACK_VERSION), 'earlier frontend package runs with the same atomic API');
    expect(trim(file_get_contents($root . '/deploy-sha.txt')) === $target, 'frontend rollback cannot downgrade or replace the API version');
    stop_grade_worker($worker); $worker = null;
    file_put_contents($entry, '<html><head></head><body>unmarked entry</body></html>');
    $worker = start_grade_worker($entry, $lock, false);
    expect($worker[2] === 'atomic', 'an unmarked entry cannot reopen legacy writes after activation');
} finally {
    if ($worker) stop_grade_worker($worker);
    foreach (glob($root . '/assets/*') as $asset) unlink($asset);
    foreach ([$entry, $lock, $root . '/deploy-sha.txt'] as $file) unlink($file);
    rmdir($root . '/assets'); rmdir($root);
}
