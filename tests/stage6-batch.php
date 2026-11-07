<?php
declare(strict_types=1);

class BatchFailure extends RuntimeException {}
class BatchSqlite extends PDO {
    public function prepare(string $query, array $options = []): PDOStatement|false {
        $query = str_replace(['ON DUPLICATE KEY UPDATE', ' FOR UPDATE'], ['ON CONFLICT DO UPDATE SET', ''], $query);
        $query = preg_replace('/VALUES\((\w+)\)/', 'excluded.$1', $query);
        return parent::prepare($query, $options);
    }
}

function db(): PDO { return $GLOBALS['pdo']; }
function require_auth(): array { return ['complexId' => $GLOBALS['cid'], 'role' => 'manager']; }
function require_complex_id(array $auth): int { return $auth['complexId']; }
function json_input(): array { return $GLOBALS['input']; }
function error_response(string $message, int $status = 400): never { throw new BatchFailure('batch rejected', $status); }
function json_response(array $response): void { $GLOBALS['response'] = $response; }
function table_column_exists(PDO $pdo, string $table, string $column): bool {
    if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql') {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?');
        $stmt->execute([$table, $column]);
        return (int) $stmt->fetchColumn() === 1;
    }
    foreach ($pdo->query('PRAGMA table_info(' . $table . ')')->fetchAll(PDO::FETCH_ASSOC) as $row) {
        if ($row['name'] === $column) return true;
    }
    return false;
}
require __DIR__ . '/../api/routes/students.php';
require __DIR__ . '/../api/routes/halaqat.php';

function check(bool $ok, string $label): void {
    if (!$ok) throw new LogicException($label);
    echo "PASS: $label\n";
}
function submit(PDO $pdo, string $table, array $rows, int $cid = 1, ?int $status = null): void {
    $GLOBALS['pdo'] = $pdo;
    $GLOBALS['cid'] = $cid;
    $GLOBALS['input'] = [$table => $rows];
    $GLOBALS['response'] = null;
    try {
        ('handle_upsert_' . $table)();
        check($status === null && $GLOBALS['response'] === ['ok' => true], "$table confirms only successful writes");
    } catch (BatchFailure $failure) {
        if ($status === null || ($status > 0 && $failure->getCode() !== $status)) throw $failure;
    }
}
function rows(PDO $pdo, string $table): array {
    return $pdo->query("SELECT * FROM $table ORDER BY complex_id, id")->fetchAll(PDO::FETCH_ASSOC);
}

$native = in_array('--native', $argv, true);
if ($native) {
    // Fixed loopback-only fixture target. Refuse to write even here unless it is empty.
    $connect = static fn(): PDO => new PDO('mysql:host=127.0.0.1;port=3307;dbname=roster_test;charset=utf8mb4', 'roster', 'roster_fixture',
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false]);
    $pdo = $connect();
    check($pdo->query('SHOW TABLES')->fetchColumn() === false, 'isolated fixture database starts empty');
    $schema = file_get_contents(__DIR__ . '/../database/schema.sql');
    foreach (['complexes', 'halaqat', 'students'] as $table) {
        if (!preg_match('/CREATE TABLE IF NOT EXISTS `' . $table . '` \([\s\S]+?;/', $schema, $match)) {
            throw new LogicException("Missing schema for $table");
        }
        $pdo->exec($match[0]);
    }
    $pdo->exec("INSERT INTO complexes (id,name,subdomain) VALUES (1,'First fixture','fixture-one'),(2,'Second fixture','fixture-two')");
    $peer = $connect();
} else {
    $pdo = new BatchSqlite('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $pdo->exec('CREATE TABLE students(id TEXT PRIMARY KEY,complex_id INTEGER,name TEXT,halaqa_id INTEGER,national_id TEXT,parent_phone TEXT,student_phone TEXT,level TEXT,level_type TEXT,institute_level TEXT,phase_number INTEGER,assigned_to TEXT,assigned_assistant_code TEXT,memorized TEXT,UNIQUE(complex_id,national_id))');
    $pdo->exec('CREATE TABLE halaqat(complex_id INTEGER,id INTEGER,name TEXT,is_talqeen INTEGER,teacher_name TEXT,teacher_code TEXT,assistant_name TEXT,assistant_code TEXT,extra_assistants TEXT,PRIMARY KEY(complex_id,id))');
    $peer = $pdo;
}

foreach (['halaqat', 'students'] as $table) {
    $students = $table === 'students';
    $first = $students ? ['id' => 'fixture-1', 'name' => 'First', 'halaqa_id' => 1, 'national_id' => 'fixture-1'] : ['id' => 1, 'name' => 'First'];
    $second = $students ? ['id' => 'fixture-2', 'name' => 'Second', 'halaqa_id' => 2, 'national_id' => 'fixture-2'] : ['id' => 2, 'name' => 'Second'];
    $other = $students ? array_replace($first, ['id' => 'other-id', 'name' => 'Other complex']) : array_replace($first, ['name' => 'Other complex']);
    submit($peer, $table, [$other], 2);
    submit($pdo, $table, [$first, $second]);
    $before = rows($peer, $table);
    submit($pdo, $table, [$first, $second]);
    check(count($before) === 3 && rows($peer, $table) === $before, "$table retry preserves all rows exactly");

    if ($native) {
        $pdo->exec("CREATE TRIGGER reject_second BEFORE UPDATE ON $table FOR EACH ROW
            BEGIN IF NEW.name = 'reject-this-row' THEN SIGNAL SQLSTATE '23000' SET MESSAGE_TEXT = 'fixture'; END IF; END");
    } else {
        $pdo->exec("CREATE TRIGGER reject_second BEFORE UPDATE ON $table WHEN NEW.name = 'reject-this-row'
            BEGIN SELECT RAISE(ABORT,'fixture'); END");
    }
    $changed = array_replace($first, ['name' => 'must roll back']);
    submit($pdo, $table, [$changed, array_replace($second, ['name' => 'reject-this-row'])], 1, 0);
    check(!$pdo->inTransaction() && rows($peer, $table) === $before, "$table late database error rolls back every write");
    $pdo->exec('DROP TRIGGER reject_second');

    submit($pdo, $table, [$changed, array_replace($second, ['complex_id' => 2])], 1, 403);
    check(rows($peer, $table) === $before, "$table explicit foreign complex rejects the complete batch");
    if ($students) {
        unset($other['complex_id']);
        submit($pdo, $table, [$changed, $other], 1, 409);
        check(rows($peer, $table) === $before, 'foreign student ID cannot move or edit the student or save a partial batch');
        $changed['id'] = 'incoming-alternate-id';
    }
    submit($pdo, $table, [$changed, $second]);
    $after = rows($peer, $table);
    $expected = $before;
    $expected[0]['name'] = 'must roll back';
    check($after === $expected, "$table recovery updates only the intended record and preserves its original ID");
}
