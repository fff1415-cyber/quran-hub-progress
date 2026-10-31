const assert=require('node:assert/strict'),cp=require('node:child_process'),ts=require('typescript');
const base='26c16bfe3cea9df88e52ff76c1b2dc827ade2b0e';
function withoutAssignmentReceipts(code){
 const start=code.indexOf('\nfunction plans_operation_payload('),end=code.indexOf('\nfunction handle_assign_plan()',start);
 if(start<0)return code;
 assert.ok(end>start);code=code.slice(0,start)+code.slice(end);
 code=code.replace(`        $operation = plans_assignment_operation($pdo, $cid, $studentId, $input);
        if ($operation !== null && ($operation['response'] !== null || ($input['operation_probe'] ?? false))) {
            $response = $operation['response'] ?? ['ok' => true, 'operation_id' => $operation['id'], 'operation_applied' => false];
            $pdo->commit();
            json_response($response);
            return;
        }
`,'');
 code=code.replace(`        $response = ['ok' => true, 'assignment_id' => $id, 'sard_queue' => $sardQueue];
        if ($operation !== null) {
            $response['operation_id'] = $operation['id'];
            $response['operation_applied'] = true;
        }
        plans_save_assignment_operation($pdo, $cid, $studentId, $operation, $response);
        $pdo->commit();
        json_response($response);`,`        $pdo->commit();
        json_response(['ok' => true, 'assignment_id' => $id, 'sard_queue' => $sardQueue]);`);
 return code;
}
function withoutAssignmentClient(code){
 if(!code.includes('import { runPlanAssignmentRequest,'))return code;
 code=code.replace('import { decodeAuthTokenPayload } from "@/lib/auth-session";\n','').replace('import { getActiveComplexId } from "@/lib/tenant";\n','').replace('import { runPlanAssignmentRequest, type AssignmentReceipt } from "@/lib/plan-assignment-requests";\n','');
 const original=cp.execFileSync('git',['show',base+':src/lib/plans-service.ts'],{encoding:'utf8'});
 const node=source=>{const sf=ts.createSourceFile('service.ts',source,ts.ScriptTarget.Latest,true);return sf.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='assignStudentPlan');};
 const before=node(original),now=node(code);assert.ok(before&&now);
 return code.slice(0,now.getStart())+original.slice(before.getStart(),before.end)+code.slice(now.end);
}
module.exports={withoutAssignmentReceipts,withoutAssignmentClient};
