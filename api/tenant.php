<?php

declare(strict_types=1);

/**
 * Multi-tenant helpers — every authenticated request must scope data to one complex.
 *
 * Usage in route handlers:
 *   $auth = require_auth();
 *   $cid  = require_complex_id($auth);
 *   $stmt = $pdo->prepare('SELECT * FROM students WHERE complex_id = ? AND ...');
 *   $stmt->execute([$cid, ...]);
 */

/** Default complex for legacy tokens / single-tenant installs. */
const LEGACY_DEFAULT_COMPLEX_ID = 1;

function table_column_exists(PDO $pdo, string $table, string $column): bool
{
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?'
    );
    $stmt->execute([$table, $column]);
    return (int) $stmt->fetchColumn() > 0;
}

function complex_id_from_auth(array $auth): ?int
{
    if (isset($auth['complexId']) && (int) $auth['complexId'] > 0) {
        return (int) $auth['complexId'];
    }
    if (isset($auth['complex_id']) && (int) $auth['complex_id'] > 0) {
        return (int) $auth['complex_id'];
    }
    return null;
}

function require_complex_id(array $auth): int
{
    $id = complex_id_from_auth($auth);
    if ($id !== null) {
        return $id;
    }
    return LEGACY_DEFAULT_COMPLEX_ID;
}

/** complexId from login request body (optional until UI sends it). */
function login_complex_id_from_input(array $input): int
{
    if (isset($input['complexId']) && (int) $input['complexId'] > 0) {
        return (int) $input['complexId'];
    }
    if (isset($input['complex_id']) && (int) $input['complex_id'] > 0) {
        return (int) $input['complex_id'];
    }
    return LEGACY_DEFAULT_COMPLEX_ID;
}

/** complexId for unauthenticated public list endpoints (?complexId=). */
function public_complex_id_from_request(): int
{
    if (isset($_GET['complexId']) && (int) $_GET['complexId'] > 0) {
        return (int) $_GET['complexId'];
    }
    if (isset($_GET['complex_id']) && (int) $_GET['complex_id'] > 0) {
        return (int) $_GET['complex_id'];
    }
    return LEGACY_DEFAULT_COMPLEX_ID;
}

/**
 * @param array<string, mixed> $payload
 * @return array<string, mixed>
 */
function login_token_payload(array $payload, int $complexId, bool $tenantsEnabled): array
{
    if ($tenantsEnabled) {
        $payload['complexId'] = $complexId;
    }
    return $payload;
}

/** Auth payload + resolved complex id (convenience). */
function require_auth_with_complex(): array
{
    $auth = require_auth();
    return [
        'auth' => $auth,
        'complex_id' => require_complex_id($auth),
    ];
}

/**
 * Append tenant filter to a WHERE clause fragment.
 * Example: tenant_where('complex_id', $cid) => 'complex_id = :complex_id'
 */
function tenant_where(string $column = 'complex_id'): string
{
    return "$column = :complex_id";
}

/**
 * Merge complex_id into execute params.
 *
 * @param array<string, mixed> $params
 * @return array<string, mixed>
 */
function with_complex_id(int $complexId, array $params = []): array
{
    return array_merge([':complex_id' => $complexId], $params);
}

/** Ensure a row belongs to the current complex (403 if not). */
function assert_row_belongs_to_complex(?int $rowComplexId, int $currentComplexId): void
{
    if ($rowComplexId === null || $rowComplexId !== $currentComplexId) {
        error_response('Forbidden', 403);
    }
}
