<?php

declare(strict_types=1);

/**
 * Minimal Web Push sender (no Composer) — requires openssl + curl.
 * Returns true on success, false when skipped or failed.
 */
function push_vapid_configured(): bool
{
    return defined('VAPID_PUBLIC_KEY')
        && defined('VAPID_PRIVATE_KEY')
        && VAPID_PUBLIC_KEY !== ''
        && VAPID_PRIVATE_KEY !== '';
}

function push_vapid_subject(): string
{
    return defined('VAPID_SUBJECT') && VAPID_SUBJECT !== ''
        ? VAPID_SUBJECT
        : 'mailto:admin@msht.io';
}

/**
 * @param array{endpoint:string,keys:array{p256dh:string,auth:string}} $subscription
 * @param array{title:string,body:string,url?:string,tag?:string} $payload
 */
function push_send_web_notification(array $subscription, array $payload): bool
{
    if (!push_vapid_configured()) {
        return false;
    }
    if (!function_exists('openssl_pkey_new') || !function_exists('curl_init')) {
        return false;
    }

    $endpoint = (string) ($subscription['endpoint'] ?? '');
    $p256dh = (string) ($subscription['keys']['p256dh'] ?? '');
    $auth = (string) ($subscription['keys']['auth'] ?? '');
    if ($endpoint === '' || $p256dh === '' || $auth === '') {
        return false;
    }

    $message = json_encode([
        'title' => $payload['title'] ?? 'إشعار',
        'body' => $payload['body'] ?? '',
        'url' => $payload['url'] ?? '/',
        'tag' => $payload['tag'] ?? 'qshatawi',
    ], JSON_UNESCAPED_UNICODE);
    if ($message === false) {
        return false;
    }

    try {
        $encrypted = push_encrypt_payload($message, $p256dh, $auth);
    } catch (Throwable) {
        return false;
    }

    $jwt = push_create_vapid_jwt($endpoint);
    if ($jwt === null) {
        return false;
    }

    $headers = [
        'Content-Type: application/octet-stream',
        'Content-Encoding: aes128gcm',
        'Content-Length: ' . strlen($encrypted),
        'TTL: 86400',
        'Authorization: vapid t=' . $jwt . ', k=' . VAPID_PUBLIC_KEY,
        'Crypto-Key: p256ecdsa=' . VAPID_PUBLIC_KEY,
    ];

    $ch = curl_init($endpoint);
    if ($ch === false) {
        return false;
    }
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $encrypted,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
    ]);
    $response = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($code >= 200 && $code < 300) {
        return true;
    }
    if ($code === 404 || $code === 410) {
        return false;
    }
    return false;
}

function push_create_vapid_jwt(string $endpoint): ?string
{
    $aud = push_vapid_audience($endpoint);
    if ($aud === null) {
        return null;
    }
    $header = push_base64url(json_encode(['typ' => 'JWT', 'alg' => 'ES256'], JSON_THROW_ON_ERROR));
    $claims = push_base64url(json_encode([
        'aud' => $aud,
        'exp' => time() + 43200,
        'sub' => push_vapid_subject(),
    ], JSON_THROW_ON_ERROR));
    $unsigned = $header . '.' . $claims;

    $privateKeyPem = push_vapid_private_pem(VAPID_PRIVATE_KEY);
    if ($privateKeyPem === null) {
        return null;
    }
    $key = openssl_pkey_get_private($privateKeyPem);
    if ($key === false) {
        return null;
    }
    $signature = '';
    if (!openssl_sign($unsigned, $signature, $key, OPENSSL_ALGO_SHA256)) {
        return null;
    }
    $derSig = push_ecdsa_der_to_jose($signature);
    if ($derSig === null) {
        return null;
    }

    return $unsigned . '.' . push_base64url($derSig);
}

function push_vapid_audience(string $endpoint): ?string
{
    $parts = parse_url($endpoint);
    if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
        return null;
    }
    $port = isset($parts['port']) ? ':' . $parts['port'] : '';
    return $parts['scheme'] . '://' . $parts['host'] . $port;
}

function push_vapid_private_pem(string $privateKeyBase64Url): ?string
{
    $raw = push_base64url_decode($privateKeyBase64Url);
    if ($raw === false || strlen($raw) !== 32) {
        return null;
    }
    $oid = hex2bin('06082a8648ce3d030107');
    $key = "\x04" . $raw;
    $key = "\x03" . chr(strlen($key)) . $key;
    $key = "\x30" . chr(strlen($oid) + strlen($key)) . $oid . $key;
    $key = "\x30" . chr(strlen($key)) . $key;
    $der = "\x30\x77\x02\x01\x00" . $key . "\xa1\x44\x03\x42\x00\x04" . push_public_from_private($raw);
    $pem = "-----BEGIN EC PRIVATE KEY-----\n"
        . chunk_split(base64_encode($der), 64, "\n")
        . "-----END EC PRIVATE KEY-----\n";
    return $pem;
}

function push_public_from_private(string $privateRaw): string
{
    $pem = "-----BEGIN EC PRIVATE KEY-----\n"
        . chunk_split(base64_encode(push_ec_private_der($privateRaw)), 64, "\n")
        . "-----END EC PRIVATE KEY-----\n";
    $key = openssl_pkey_get_private($pem);
    if ($key === false) {
        return str_repeat("\x00", 65);
    }
    $details = openssl_pkey_get_details($key);
    return "\x04" . $details['ec']['x'] . $details['ec']['y'];
}

function push_ec_private_der(string $privateRaw): string
{
    $oid = hex2bin('06082a8648ce3d030107');
    $key = "\x04" . $privateRaw;
    $key = "\x03" . chr(strlen($key)) . $key;
    $key = "\x30" . chr(strlen($oid) + strlen($key)) . $oid . $key;
    $key = "\x30" . chr(strlen($key)) . $key;
    return "\x30\x77\x02\x01\x00" . $key . "\xa1\x44\x03\x42\x00\x04" . push_public_from_private_raw($privateRaw);
}

function push_public_from_private_raw(string $privateRaw): string
{
    $pem = "-----BEGIN EC PRIVATE KEY-----\n"
        . chunk_split(base64_encode("\x30\x77\x02\x01\x00\x30\x10\x06\x07\x2a\x86\x48\xce\x3d\x02\x01\x06\x05\x2b\x81\x04\x00\x22\x04\x20" . $privateRaw . "\xa1\x44\x03\x42\x00"), 64, "\n")
        . "-----END EC PRIVATE KEY-----\n";
    $key = openssl_pkey_get_private($pem);
    if ($key === false) {
        return str_repeat("\x00", 64);
    }
    $details = openssl_pkey_get_details($key);
    return $details['ec']['x'] . $details['ec']['y'];
}

function push_encrypt_payload(string $payload, string $userPublicKey, string $userAuthToken): string
{
    $userPublicKeyBin = push_base64url_decode($userPublicKey);
    $userAuthBin = push_base64url_decode($userAuthToken);
    if ($userPublicKeyBin === false || $userAuthBin === false) {
        throw new InvalidArgumentException('invalid keys');
    }

    $localKey = openssl_pkey_new([
        'curve_name' => 'prime256v1',
        'private_key_type' => OPENSSL_KEYTYPE_EC,
    ]);
    if ($localKey === false) {
        throw new RuntimeException('local key failed');
    }
    $localDetails = openssl_pkey_get_details($localKey);
    $localPublic = "\x04" . $localDetails['ec']['x'] . $localDetails['ec']['y'];

    $userKey = openssl_pkey_get_public(
        "-----BEGIN PUBLIC KEY-----\n"
        . chunk_split(base64_encode(push_uncompressed_to_spki($userPublicKeyBin)), 64, "\n")
        . "-----END PUBLIC KEY-----\n"
    );
    if ($userKey === false) {
        throw new RuntimeException('user key failed');
    }

    $sharedSecret = openssl_pkey_derive($userKey, $localKey, 256);
    if ($sharedSecret === false) {
        throw new RuntimeException('derive failed');
    }

    $salt = random_bytes(16);
    $keyInfo = "WebPush: info\x00" . $userPublicKeyBin . $localPublic;
    $ikm = push_hkdf($userAuthBin, $sharedSecret, $keyInfo, 32);
    $cekInfo = "Content-Encoding: aes128gcm\x00";
    $nonceInfo = "Content-Encoding: nonce\x00";
    $contentEncryptionKey = push_hkdf($salt, $ikm, $cekInfo, 16);
    $nonce = push_hkdf($salt, $ikm, $nonceInfo, 12);

    $padLen = 0;
    $plaintext = $payload . str_repeat("\x00", $padLen);
    $record = "\x00" . pack('N', $padLen) . $plaintext;

    $tag = '';
    $ciphertext = openssl_encrypt(
        $record,
        'aes-128-gcm',
        $contentEncryptionKey,
        OPENSSL_RAW_DATA,
        $nonce,
        $tag,
        '',
        16
    );
    if ($ciphertext === false) {
        throw new RuntimeException('encrypt failed');
    }

    return $salt
        . pack('N', 4096)
        . chr(strlen($localPublic))
        . $localPublic
        . $ciphertext
        . $tag;
}

function push_uncompressed_to_spki(string $uncompressed): string
{
    $oid = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200');
    return $oid . $uncompressed;
}

function push_hkdf(string $salt, string $ikm, string $info, int $length): string
{
    $prk = hash_hmac('sha256', $ikm, $salt, true);
    $t = '';
    $lastBlock = '';
    for ($i = 1; strlen($t) < $length; $i++) {
        $lastBlock = hash_hmac('sha256', $lastBlock . $info . chr($i), $prk, true);
        $t .= $lastBlock;
    }
    return substr($t, 0, $length);
}

function push_base64url(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function push_base64url_decode(string $data): string|false
{
    $pad = strlen($data) % 4;
    if ($pad > 0) {
        $data .= str_repeat('=', 4 - $pad);
    }
    return base64_decode(strtr($data, '-_', '+/'), true);
}

function push_ecdsa_der_to_jose(string $der): ?string
{
    $pos = 0;
    if (ord($der[$pos++]) !== 0x30) {
        return null;
    }
    $len = ord($der[$pos++]);
    if ($len & 0x80) {
        $pos += ($len & 0x7f);
    }
    if (ord($der[$pos++]) !== 0x02) {
        return null;
    }
    $rLen = ord($der[$pos++]);
    $r = substr($der, $pos, $rLen);
    $pos += $rLen;
    if (ord($der[$pos++]) !== 0x02) {
        return null;
    }
    $sLen = ord($der[$pos++]);
    $s = substr($der, $pos, $sLen);
    $r = ltrim($r, "\x00");
    $s = ltrim($s, "\x00");
    return str_pad($r, 32, "\x00", STR_PAD_LEFT) . str_pad($s, 32, "\x00", STR_PAD_LEFT);
}
