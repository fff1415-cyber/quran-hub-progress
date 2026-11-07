<?php
declare(strict_types=1);

const QHP_GRADE_INDEX_TAG = '<!-- qhp-grade-protocol:1 -->';

/** Keep the mode stable until the request finishes, including legacy writes in flight. */
function grade_cutover_protocol(string $entry, string $lockPath): bool {
    static $requests = [];
    if (isset($requests[$lockPath])) return $requests[$lockPath]['active'];
    $handle = !is_link($lockPath) ? @fopen($lockPath, 'rb') : false;
    if (!$handle || !flock($handle, LOCK_SH)) throw new RuntimeException('تعذّر التحقق من وضع الحفظ؛ لم يُرسل تسجيلك', 503);
    $html = @file_get_contents($entry, false, null, 0, 131072);
    if ($html === false || $html === '' || !str_contains($html, '</html>')) {
        fclose($handle);
        throw new RuntimeException('تعذّر التحقق من إصدار الحفظ؛ لم يُرسل تسجيلك', 503);
    }
    $floor = stream_get_contents($handle, 2);
    if ($floor !== '' && $floor !== '1') throw new RuntimeException('تعذّر التحقق من وضع الحفظ؛ لم يُرسل تسجيلك', 503);
    $active = $floor === '1' || str_contains($html, QHP_GRADE_INDEX_TAG);
    $requests[$lockPath] = ['active' => $active, 'lock' => $handle];
    return $active;
}
