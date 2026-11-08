<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
umask(0077);
define('QHP_GRADE_RELEASE_LIBRARY', true);
[$script, $mode, $accountHome, $base, $target] = $argv;
$root = $accountHome . '/domains/msht.io/public_html';
$private = $accountHome . '/.qhp-private';
$stage = $private . '/qalaid-release-' . $target;
$backup = $stage . '/previous';
$marker = $root . '/deploy-sha.txt';
$profile = 'lib/plan-profile.php';
$lock = null;

try {
    if (!preg_match('~^/home/[A-Za-z0-9_-]+$~D', $accountHome) ||
        !preg_match('/^[a-f0-9]{40}$/D', $base) || !preg_match('/^[a-f0-9]{40}$/D', $target) ||
        !in_array($mode, ['check','publish','revert','finish'], true) ||
        realpath($root) !== $root || realpath($private) !== $private || realpath($stage) !== $stage ||
        (fileperms($private) & 0077) || (fileperms($stage) & 0077)) {
        throw new RuntimeException('release_scope');
    }
    require $stage . '/grade-release-entry.php';
    $manifest = json_decode(file_get_contents($stage . '/api.json'), true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($manifest) || count($manifest) < 1 || count($manifest) > 80) throw new RuntimeException('release_manifest');
    $items = [];
    foreach ($manifest as $row) {
        $relative = $row['path'] ?? '';
        if (!preg_match('~^(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+\.php$~D', $relative) ||
            in_array(basename($relative), ['config.php','config.platform.php'], true) || isset($items[$relative])) {
            throw new RuntimeException('release_manifest_path');
        }
        $file = $root . '/api/' . $relative;
        if (is_link($file) || realpath(dirname($file)) !== dirname($file)) throw new RuntimeException('release_api_path');
        $content = file_get_contents($stage . '/api/' . $relative);
        if ($content === false || hash('sha256', $content) !== $row['sha256'] || empty($row['beforeSha256'])) {
            throw new RuntimeException('release_api_hash');
        }
        $items[$relative] = $row + ['content'=>base64_encode($content)];
    }
    $entry = $root . '/index.html';
    $html = file_get_contents($stage . '/index.html');
    $lock = grade_release_lock($private . '/grade-cutover.lock');
    if (stream_get_contents($lock, 2) !== '1') throw new RuntimeException('existing_atomic_floor_required');

    $restore = static function () use ($items,$root,$entry,$marker,$backup,$base,$profile): void {
        if (!is_file($backup . '/index.html') || !is_file($backup . '/deploy-sha.txt') ||
            trim(file_get_contents($backup . '/deploy-sha.txt')) !== $base) throw new RuntimeException('release_rollback_missing');
        foreach ($items as $relative=>$row) {
            $old = file_get_contents($backup . '/api/' . $relative);
            if ($old === false || hash('sha256',$old) !== $row['beforeSha256']) throw new RuntimeException('release_rollback_hash');
        }
        foreach (array_reverse($items, true) as $relative=>$row) {
            grade_release_atomic($root . '/api/' . $relative, file_get_contents($backup . '/api/' . $relative));
        }
        if (is_file($backup . '/retired-plan-profile.php') && !is_file($root . '/api/' . $profile)) {
            grade_release_atomic($root . '/api/' . $profile, file_get_contents($backup . '/retired-plan-profile.php'));
        }
        grade_release_atomic($entry, file_get_contents($backup . '/index.html'));
        grade_release_atomic($marker, $base . "\n");
    };

    $live = trim(file_get_contents($marker));
    if ($mode === 'revert') {
        if ($live !== $target) throw new RuntimeException('release_revert_marker');
        $restore();
    } elseif ($mode === 'finish') {
        if ($live !== $target) throw new RuntimeException('release_finish_marker');
        $obsolete = $root . '/api/' . $profile;
        $expected = trim(file_get_contents($stage . '/retired-sha.txt'));
        if (realpath($obsolete) !== $obsolete || hash_file('sha256',$obsolete) !== $expected ||
            is_link($backup . '/retired-plan-profile.php') || !rename($obsolete, $backup . '/retired-plan-profile.php')) {
            throw new RuntimeException('release_retire_legacy_dependency');
        }
    } else {
        if ($live !== $base || !str_contains(file_get_contents($entry), GRADE_RELEASE_TAG) ||
            !is_string($html) || str_contains($html, GRADE_RELEASE_TAG)) throw new RuntimeException('release_baseline');
        foreach ($items as $relative=>$row) {
            $file = $root . '/api/' . $relative;
            if (realpath($file) !== $file || hash_file('sha256',$file) !== $row['beforeSha256']) {
                throw new RuntimeException('release_baseline_api_hash');
            }
        }
        $obsolete = $root . '/api/' . $profile;
        if (realpath($obsolete) !== $obsolete || hash_file('sha256',$obsolete) !== trim(file_get_contents($stage . '/retired-sha.txt'))) {
            throw new RuntimeException('release_baseline_retired_hash');
        }
        if (realpath($root . '/assets') !== $root . '/assets') throw new RuntimeException('release_assets_path');
        $assets = [];
        foreach (new DirectoryIterator($stage . '/assets') as $asset) {
            if ($asset->isDot()) continue;
            if (!$asset->isFile() || $asset->isLink() || !preg_match('/^[A-Za-z0-9_.-]+$/D', $asset->getFilename())) {
                throw new RuntimeException('release_asset_name');
            }
            $destination = $root . '/assets/' . $asset->getFilename();
            if (is_link($destination) || (file_exists($destination) &&
                (!is_file($destination) || hash_file('sha256',$destination) !== hash_file('sha256',$asset->getPathname())))) {
                throw new RuntimeException('release_asset_collision');
            }
            if (!is_file($destination)) $assets[$destination] = $asset->getPathname();
        }
        grade_release_check_assets($stage, $html);
        if ($mode === 'publish') {
            if (file_exists($backup) || !mkdir($backup, 0700)) throw new RuntimeException('release_backup_exists');
            if (!copy($entry, $backup . '/index.html') || !copy($marker, $backup . '/deploy-sha.txt')) {
                throw new RuntimeException('release_backup_entry');
            }
            foreach ($items as $relative=>$row) {
                $destination = $backup . '/api/' . $relative;
                if (!is_dir(dirname($destination)) && !mkdir(dirname($destination), 0700, true)) throw new RuntimeException('release_backup_path');
                if (!copy($root . '/api/' . $relative,$destination) || hash_file('sha256',$destination) !== $row['beforeSha256']) {
                    throw new RuntimeException('release_backup_api');
                }
            }
            foreach ($assets as $destination=>$source) grade_release_atomic($destination, file_get_contents($source));
            grade_release_check_assets($root, $html);
            try {
                grade_release_publish_api($root, array_values($items));
                $tag = GRADE_RELEASE_TAG . '<!-- qhp-grade-release:' . $target . ' -->';
                grade_release_atomic($entry, str_replace('</head>', $tag . '</head>', $html));
                grade_release_atomic($marker, $target . "\n");
            } catch (Throwable $error) {
                $restore();
                throw $error;
            }
        }
    }
    echo json_encode(['status'=>'protected_rollback_'.$mode,'scope'=>'msht.io']).PHP_EOL;
} catch (Throwable $error) {
    echo json_encode(['status'=>'protected_rollback_failed',
        'reason'=>preg_match('/^[a-z_]+$/D',$error->getMessage()) ? $error->getMessage() : get_class($error)]).PHP_EOL;
    exit(1);
} finally {
    if (is_resource($lock)) fclose($lock);
}
