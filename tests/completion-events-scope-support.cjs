const assert=require('node:assert/strict');
function withoutCompletionProtocolPhp(code){
 const include="require_once __DIR__ . '/../lib/plan-completion-events.php';\n\n";
 if(!code.includes(include))return code;
 assert.equal(code.split(include).length-1,1);
 const hook='        plan_events_register_assignment($pdo, $studentId, $id, $planId);\n';
 assert.equal(code.split(hook).length-1,1,'only an actually newly inserted assignment may receive the protocol marker');
 return code.replace(include,'').replace(hook,'');
}
module.exports={withoutCompletionProtocolPhp};
