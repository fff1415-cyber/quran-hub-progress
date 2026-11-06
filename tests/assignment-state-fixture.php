<?php
declare(strict_types=1);
/** Synthetic fixture request, not a client fallback: displayed-state behavior has separate HTTP/UI tests. */
function fixtureAssignmentStateInput(string $student,string $id,string $status):array {
 $GLOBALS['auth']['accountId']??='fixture';$q=db()->prepare('SELECT * FROM student_plan_assignments WHERE id=?');$q->execute([$id]);$row=$q->fetch();if(!$row)throw new LogicException('Fixture assignment absent');
 return ['student_id'=>$student,'assignment_id'=>$id,'status'=>$status,'expected_status'=>in_array($row['status'],['active','frozen'],true)?$row['status']:'active','expected_status_version'=>plans_assignment_state(db(),require_complex_id($GLOBALS['auth']),$row),'operation_id'=>'fixture-state-'.bin2hex(random_bytes(12)),'assignment_state_protocol'=>1];
}
