<?php

declare(strict_types=1);

function json_input(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function json_response(mixed $data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function error_response(string $message, int $status = 400): void
{
    json_response(['error' => $message], $status);
}

function base64url_encode(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64url_decode(string $data): string|false
{
    $pad = strlen($data) % 4;
    if ($pad > 0) {
        $data .= str_repeat('=', 4 - $pad);
    }
    return base64_decode(strtr($data, '-_', '+/'), true);
}

function generate_token(array $payload): string
{
    $payload['exp'] = ($payload['exp'] ?? ((time() * 1000) + 86400000));
    $body = base64url_encode(json_encode($payload, JSON_UNESCAPED_UNICODE));
    $sig = hash_hmac('sha256', $body, TOKEN_SECRET);
    return $body . '.' . $sig;
}

function verify_token(?string $token): ?array
{
    if (!$token || !str_contains($token, '.')) {
        return null;
    }
    [$body, $sig] = explode('.', $token, 2);
    $expected = hash_hmac('sha256', $body, TOKEN_SECRET);
    if (!hash_equals($expected, $sig)) {
        return null;
    }
    $decoded = base64url_decode($body);
    if ($decoded === false) {
        return null;
    }
    $payload = json_decode($decoded, true);
    if (!is_array($payload)) {
        return null;
    }
    if (isset($payload['exp']) && time() * 1000 > (int) $payload['exp']) {
        return null;
    }
    return $payload;
}

function bearer_token(): ?string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/Bearer\s+(.+)/i', $header, $m)) {
        return trim($m[1]);
    }
    return null;
}

function require_auth(): array
{
    $payload = verify_token(bearer_token());
    if (!$payload) {
        error_response('Unauthorized', 401);
    }
    return $payload;
}

function new_uuid(): string
{
    $data = random_bytes(16);
    $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
    $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}
