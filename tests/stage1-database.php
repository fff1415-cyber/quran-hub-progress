<?php
declare(strict_types=1);
require __DIR__ . '/../api/schema.php';
require __DIR__ . '/../api/diagnostics.php';
require __DIR__ . '/../database/runtime-column-migrations.php';

function stage1_check(bool $condition, string $label): void {
    if (!$condition) throw new LogicException($label);
    echo "PASS: $label\n";
}
function stage1_error(int $errno, string $state = 'HY000'): PDOException {
    $error = new PDOException('secret-db secret-host secret-password student-name SQL text');
    $error->errorInfo = [$state, $errno, $error->getMessage()];
    return $error;
}
foreach ([2002=>'connection',2013=>'connection',1045=>'permission',1142=>'permission',1054=>'schema',1146=>'schema',1064=>'sql',1205=>'timeout',1213=>'conflict',1062=>'integrity',3819=>'integrity'] as $errno=>$category) {
    $error = stage1_error($errno, $errno===1062?'23000':'HY000');
    stage1_check(api_database_error_category($error)===$category, 'distinct database category '.$errno);
    $message=api_safe_failure_message($error, 'isolated_test');
    stage1_check(!str_contains($message,'secret-')&&!str_contains($message,'student-name')&&!str_contains($message,'SQL text'), 'safe message '.$errno);
}

function table_column_exists(PDO $pdo, string $table, string $column): bool {
    if($pdo->getAttribute(PDO::ATTR_DRIVER_NAME)==='sqlite'){
        foreach($pdo->query('PRAGMA table_info('.$table.')')->fetchAll(PDO::FETCH_ASSOC) as $row)if($row['name']===$column)return true;
        return false;
    }
    $query=$pdo->prepare('SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?');
    $query->execute([$table,$column]);return (bool)$query->fetchColumn();
}
require __DIR__ . '/../api/routes/students.php';
require __DIR__ . '/../api/routes/halaqat.php';
require __DIR__ . '/../api/routes/plans.php';
require __DIR__ . '/../api/routes/student_entries.php';
require __DIR__ . '/../api/routes/academic_reports.php';
require __DIR__ . '/../api/routes/parent_recommendations.php';
require __DIR__ . '/../api/routes/platform_admin.php';

$dsn=getenv('AUDIT_MYSQL_DSN');
if(!$dsn){
    $pdo=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
    $pdo->exec("CREATE TABLE students(id TEXT, student_phone TEXT, institute_level TEXT,phase_number INT,assigned_assistant_code TEXT);INSERT INTO students VALUES('fixture','0','existing',1,'fixture-assistant')");
    $pdo->exec('PRAGMA query_only=ON');
    students_ensure_extended_columns($pdo);
    stage1_check($pdo->query('SELECT COUNT(*) FROM students')->fetchColumn()==1,'student schema guard works on read-only data');
    try{halaqat_ensure_extra_assistants_column($pdo);throw new LogicException('missing column accepted');}
    catch(ApiSchemaException $error){stage1_check($error->missing===['halaqat.extra_assistants'],'missing schema rejected without DDL');}
    stage1_check($pdo->query('SELECT institute_level FROM students')->fetchColumn()==='existing','existing data retained after rejected guard');
    exit;
}
if($dsn!=='mysql:host=127.0.0.1;port=3307;dbname=audit_test;charset=utf8mb4')throw new RuntimeException('Only isolated fixture DSN allowed');
$pdo=new PDO($dsn,'audit','audit_only',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
$pdo->exec(file_get_contents(__DIR__.'/../database/schema.sql'));
$pdo->exec(file_get_contents(__DIR__.'/../database/migrate-education-plans.sql'));
$pdo->exec('ALTER TABLE education_plans ADD COLUMN complex_id INT UNSIGNED NOT NULL DEFAULT 1, DROP INDEX uk_track_level, ADD UNIQUE KEY uk_fixture_plans(complex_id,track,level_number)');
$pdo->exec(file_get_contents(__DIR__.'/../database/migrate-evaluation-settings.sql'));
$pdo->exec('ALTER TABLE evaluation_settings ADD COLUMN complex_id INT UNSIGNED NOT NULL DEFAULT 1, ADD UNIQUE KEY uk_fixture_evaluation(complex_id)');
$pdo->exec('CREATE TABLE parent_recommendations(id CHAR(36) PRIMARY KEY,complex_id INT,student_id VARCHAR(50),teacher_name VARCHAR(255),recommendation TEXT,created_at DATETIME)');
$pdo->exec("INSERT INTO complexes(id,name,subdomain) VALUES(1,'fixture','fixture'); INSERT INTO halaqat(complex_id,id,name) VALUES(1,1,'fixture');INSERT INTO students(id,complex_id,name,halaqa_id,national_id) VALUES('fixture',1,'preserved',1,'fixture-id');INSERT INTO education_plans(id,track,level_number,title) VALUES('fixture-plan','gold',1001,'preserved')");
$before=$pdo->query('SELECT * FROM students')->fetchAll();
stage1_check(!schema_inspect($pdo)['ready'],'missing runtime columns fail full readiness');
$count=runtime_apply_column_migrations($pdo);
stage1_check($count===12,'exact daily-face additions applied to isolated fixture');
stage1_check(runtime_apply_column_migrations($pdo)===0,'migration is repeatable with no duplicate-column failure');
stage1_check($pdo->query('SELECT * FROM students')->fetchAll()===$before,'migration preserves pre-existing student values');
$inspection=schema_inspect($pdo);
stage1_check($inspection['ready'],'complete column/index/capacity contract ready');
stage1_check(!$inspection['retry_delay_configurable'],'optional missing retry-delay retains prior compatibility');
$pdo->exec('SET TRANSACTION READ ONLY');$pdo->beginTransaction();
students_ensure_extended_columns($pdo);halaqat_ensure_extra_assistants_column($pdo);
plans_ensure_assignment_v2_columns($pdo);plans_ensure_daily_faces_columns($pdo);plans_ensure_completion_assignment_column($pdo);
student_entries_ensure_table($pdo);academic_reports_ensure($pdo);parent_recommendations_ensure_table($pdo);ensure_complexes_is_active_column($pdo);
stage1_check($pdo->inTransaction(),'runtime guards do not implicitly commit a read-only transaction');
$pdo->rollBack();
$pdo->exec('ALTER TABLE students DROP COLUMN student_phone');
$pdo->exec('SET TRANSACTION READ ONLY');$pdo->beginTransaction();
try{students_ensure_extended_columns($pdo);throw new LogicException('schema guard should fail');}
catch(ApiSchemaException $error){stage1_check($error->missing===['students.student_phone'],'incomplete runtime schema fails before changing database');}
$pdo->rollBack();
stage1_check(!schema_inspect($pdo)['ready'],'health contract catches a missing student column');
stage1_check(runtime_apply_column_migrations($pdo)===1,'interrupted/partial schema resumes only remaining addition');
stage1_check(runtime_apply_column_migrations($pdo)===0,'second retry remains no-op');
$pdo->exec('ALTER TABLE app_state MODIFY value TEXT NOT NULL');
stage1_check(!schema_inspect($pdo)['app_state_capacity_ready'],'undersized app-state column fails readiness');
