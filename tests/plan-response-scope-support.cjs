const assert=require('node:assert/strict');
const line='import { capturePlanResponse, assertPlanResponseCurrent, applyPlanSardResponse } from "@/lib/plan-response-cache";\n';
function withoutPlanResponseClient(code){
 if(code.includes('import { runPlanAssignmentRequest,'))code=require('./assignment-operation-scope-support.cjs').withoutAssignmentClient(code);
 if(!code.includes(line))return code;
 code=code.replace(line,'').replace(/^  const responseSnapshot = capturePlanResponse\(\);\n/gm,'').replace(/^ +assertPlanResponseCurrent\(responseSnapshot\);\n/gm,'');
 const call='  applyPlanSardResponse(responseSnapshot, result.sard_queue);';
 assert.equal(code.split(call).length-1,2,'only the two reviewed plan response caches may change');
 code=code.replace(call,'  if (result.sard_queue) localStorage.setItem("qshatawi_sard_queue_v2", JSON.stringify(result.sard_queue));');
 code=code.replace(call,'  localStorage.setItem("qshatawi_sard_queue_v2", JSON.stringify(result.sard_queue));');
 return code;
}
module.exports={withoutPlanResponseClient};
