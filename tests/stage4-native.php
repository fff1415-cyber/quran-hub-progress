<?php
declare(strict_types=1);
if(getenv('AUDIT_MYSQL_DSN')!=='mysql:host=127.0.0.1;port=3307;dbname=audit_test;charset=utf8mb4')throw new RuntimeException('Only disposable CI database allowed');
$pdo=new PDO(getenv('AUDIT_MYSQL_DSN'),'audit','audit_only',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
function db():PDO{return $GLOBALS['pdo'];}function require_auth():array{return $GLOBALS['auth'];}function require_complex_id(array $auth):int{return 1;}function json_input():array{return $GLOBALS['input'];}
function error_response(string $message,int $status=400):never{throw new RuntimeException($message,$status);}function json_response(mixed $value):void{$GLOBALS['response']=$value;}
function assert_row_belongs_to_complex(?int $actual,int $expected):void{if($actual!==$expected)error_response('Forbidden tenant',403);}function new_uuid():string{return 'transition-'.bin2hex(random_bytes(12));}
function table_column_exists(PDO $pdo,string $table,string $column):bool{$q=$pdo->prepare('SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?');$q->execute([$table,$column]);return (int)$q->fetchColumn()>0;}
function check(bool $ok,string $label):void{if(!$ok)throw new LogicException($label);echo "PASS: $label\n";}
require __DIR__.'/../api/routes/app_state.php';require __DIR__.'/../api/routes/plans.php';
$faces='daily_hifz_faces INT DEFAULT 1,daily_rabt_faces INT DEFAULT 1,daily_muraja_faces INT DEFAULT 1,faces_per_half INT DEFAULT 1,faces_per_one INT DEFAULT 1,faces_per_two INT DEFAULT 2';
$pdo->exec("CREATE TABLE students(id VARCHAR(50) PRIMARY KEY,complex_id INT,phase_number INT,level VARCHAR(20),institute_level VARCHAR(50)) ENGINE=InnoDB;
CREATE TABLE education_plans(id VARCHAR(36) PRIMARY KEY,complex_id INT,title VARCHAR(255),track VARCHAR(10),level_number INT,$faces) ENGINE=InnoDB;
CREATE TABLE student_plan_assignments(id VARCHAR(36) PRIMARY KEY,student_id VARCHAR(50),plan_id VARCHAR(36),status VARCHAR(20),start_segment_index INT,plan_start_date DATE,start_muraja_segment INT,assigned_by VARCHAR(100),assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,transferred_at DATETIME,frozen_at DATETIME,$faces) ENGINE=InnoDB;
CREATE TABLE plan_segments(plan_id VARCHAR(36),segment_index INT) ENGINE=InnoDB;
CREATE TABLE segment_completions(student_id VARCHAR(50),plan_id VARCHAR(36),segment_index INT,task_type VARCHAR(10),assignment_id VARCHAR(36),created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;
CREATE TABLE app_state(complex_id INT,`key` VARCHAR(100),value LONGTEXT,UNIQUE(complex_id,`key`)) ENGINE=InnoDB;
INSERT INTO education_plans(id,complex_id,title,track,level_number)VALUES('current',1,'fixture-current','gold',1001),('next',1,'fixture-next','gold',1002);
INSERT INTO plan_segments VALUES('current',1),('current',2),('next',1),('next',2)");
function seedNativeProfile(string $student):void{
 $pdo=db();$pdo->prepare("INSERT INTO students VALUES(?,1,1,'1','التأهيل')")->execute([$student]);
 $pdo->prepare("INSERT INTO student_plan_assignments(id,student_id,plan_id,status,start_segment_index)VALUES(?,?,'current','active',1)")->execute(['old-'.$student,$student]);
 foreach([1,2]as$segment)$pdo->prepare("INSERT INTO segment_completions(student_id,plan_id,segment_index,task_type,assignment_id)VALUES(?,'current',?,'hifz',?)")->execute([$student,$segment,'old-'.$student]);
 $q=$pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='sard_queue'");$queue=json_decode((string)$q->fetchColumn(),true)??[];$queue[]=['id'=>'queue-'.$student,'studentId'=>$student,'assignmentId'=>'old-'.$student,'status'=>'scheduled','attempt'=>1];app_state_upsert($pdo,'sard_queue',$queue,1);
 $GLOBALS['auth']=['role'=>'musammi','complexId'=>1,'accountId'=>'fixture','name'=>'fixture'];$GLOBALS['input']=['student_id'=>$student,'plan_id'=>'next','expected_assignment_id'=>'old-'.$student,'start_segment_index'=>1,'sard_result'=>['id'=>'queue-'.$student,'percent'=>90,'phase'=>'full']];
}
seedNativeProfile('PV');$before=$pdo->query('SELECT * FROM segment_completions ORDER BY student_id,segment_index')->fetchAll();handle_assign_plan();
check((int)$pdo->query("SELECT phase_number FROM students WHERE id='PV'")->fetchColumn()===2&&$pdo->query("SELECT plan_id FROM student_plan_assignments WHERE student_id='PV' AND status='active'")->fetchColumn()==='next','native profile and next assignment commit together');
check($pdo->query('SELECT * FROM segment_completions ORDER BY student_id,segment_index')->fetchAll()===$before,'native advancement keeps every historical completion unchanged');
try{handle_assign_plan();throw new LogicException('Duplicate advanced');}catch(RuntimeException $error){check(str_contains($error->getMessage(),'تغيّرت خطة الطالب'),'native stale retry creates no duplicate advancement');}
seedNativeProfile('PVFAIL');$queueBefore=$pdo->query("SELECT value FROM app_state WHERE `key`='sard_queue'")->fetchColumn();
$pdo->exec("ALTER TABLE students ADD CONSTRAINT fixture_profile_failure CHECK(id<>'PVFAIL' OR phase_number<>2)");
try{handle_assign_plan();throw new LogicException('Profile failure absent');}catch(RuntimeException $error){check($error->getCode()===409&&str_contains($error->getMessage(),'مرجع:'),'native final profile CHECK failure is privately referenced');}
check((int)$pdo->query("SELECT phase_number FROM students WHERE id='PVFAIL'")->fetchColumn()===1&&$pdo->query("SELECT plan_id FROM student_plan_assignments WHERE student_id='PVFAIL' AND status='active'")->fetchColumn()==='current'&&$pdo->query("SELECT value FROM app_state WHERE `key`='sard_queue'")->fetchColumn()===$queueBefore,'native profile failure rolls back assignment replacement and passing queue');
