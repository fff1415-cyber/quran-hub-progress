const assert=require('node:assert/strict');
const {load,storage,deferred}=require('./independent-test-support.cjs');
global.localStorage=storage();
let context={session:'token-one',owner:'[1,"supervisor","fixture-account"]'};
let committed=0,prepares=0,posts=0,probes=0,verified=0,lose=false,verifyFail=false;
const receipts=new Map();const intent={student_id:'S',plan_id:'P',start_segment_index:1,expected_assignment_id:'old'};
let transport=load('src/lib/plan-assignment-requests.ts',{});
const options=()=>({
 context:()=>context,intent,
 prepare:async()=>{prepares++;return {...intent};},
 send:async body=>{
  posts++;if(body.operation_probe)probes++;
  const receipt=receipts.get(body.operation_id);
  if(receipt)return {...receipt,replayed:true,sard_queue:null};
  if(body.operation_probe)return {ok:true,operation_applied:false,operation_id:body.operation_id};
  const result={ok:true,operation_applied:true,operation_id:body.operation_id,assignment_id:'A'+(++committed)};receipts.set(body.operation_id,result);
  if(lose){lose=false;throw Error('fixture response lost after commit');}return result;
 },
 verify:async(receipt,current)=>{current();if(verifyFail)throw Error('fixture read-back unavailable');assert.ok(receipt.assignment_id);verified++;},
});
(async()=>{
 lose=true;await assert.rejects(transport.runPlanAssignmentRequest(options()),/response lost/);
 assert.equal(committed,1);assert.equal(localStorage.length,1);assert.equal(verified,0);
 const stored=Array.from(localStorage.data.values())[0];assert.ok(!stored.includes('token-one'),'raw token is never persisted');
 // Reload and the same verified account logging in again retain the original request/body.
 context={...context,session:'replacement-token'};transport=load('src/lib/plan-assignment-requests.ts',{});
 await transport.runPlanAssignmentRequest(options());assert.equal(committed,1);assert.equal(prepares,1);assert.equal(probes,1);assert.equal(localStorage.length,0);
 const gate=deferred();const concurrent=options();concurrent.prepare=async()=>{await gate.promise;return {...intent};};
 const first=transport.runPlanAssignmentRequest(concurrent),second=transport.runPlanAssignmentRequest(concurrent);assert.equal(first,second);gate.resolve();await first;assert.equal(committed,2,'double click commits once');
 verifyFail=true;await assert.rejects(transport.runPlanAssignmentRequest(options()),/read-back unavailable/);assert.equal(committed,3);assert.equal(localStorage.length,1);
 const beforePosts=posts;verifyFail=false;await transport.runPlanAssignmentRequest(options());assert.equal(committed,3);assert.equal(posts,beforePosts+1,'read-back failure retries by receipt probe, never by another assignment');
 const write=localStorage.setItem;localStorage.setItem=()=>{throw Error('fixture storage full');};const beforeCommit=committed;await assert.rejects(transport.runPlanAssignmentRequest(options()),/storage full/);assert.equal(committed,beforeCommit);localStorage.setItem=write;
 // A malformed/mismatched response must not announce success or be automatically replayed.
 const bad=options();bad.send=async()=>({ok:true,assignment_id:'unproven'});await assert.rejects(transport.runPlanAssignmentRequest(bad),/تعذّر تأكيد إيصال/);const beforeBlocked=posts;
 await assert.rejects(transport.runPlanAssignmentRequest(options()),/لم يؤكد الخادم بروتوكول/);assert.equal(posts,beforeBlocked);localStorage=storage();
 // An account switch during the request leaves its draft under its original owner; no UI write follows.
 const waiting=deferred(),entered=deferred(),changed=options();changed.send=async()=>{entered.resolve();await waiting.promise;return {ok:true,operation_id:'wrong',operation_applied:true,assignment_id:'X'};};
 const pending=transport.runPlanAssignmentRequest(changed);await entered.promise;context={session:'other-account-token',owner:'[2,"supervisor","other"]'};waiting.resolve();await assert.rejects(pending,/تغيّرت الجلسة/);assert.equal(localStorage.length,1);
 context={session:'replacement-token',owner:'[1,"supervisor","fixture-account"]'};
 // Ambiguous transport drafts remain intact instead of choosing by local clock.
 const [key,value]=Array.from(localStorage.data.entries())[0];const original=JSON.parse(value);const another={...original,id:crypto.randomUUID(),body:JSON.stringify({...intent,expected_assignment_id:'different'})};localStorage.setItem(key.slice(0,-original.id.length)+another.id,JSON.stringify(another));
 await assert.rejects(transport.runPlanAssignmentRequest(options()),/بيانات بداية مختلفة/);assert.equal(localStorage.length,2);
 const other=options();other.intent={...intent,student_id:'T'};other.prepare=async()=>({...intent,student_id:'T'});await transport.runPlanAssignmentRequest(other);assert.equal(localStorage.length,2,'an ambiguous intent must not block another student');
 localStorage=storage();lose=true;await assert.rejects(transport.runPlanAssignmentRequest(options()),/response lost/);
 const [winnerKey,winnerValue]=Array.from(localStorage.data.entries())[0],winner=JSON.parse(winnerValue);const duplicate={...winner,id:crypto.randomUUID()};const duplicateKey=winnerKey.slice(0,-winner.id.length)+duplicate.id;localStorage.setItem(duplicateKey,JSON.stringify(duplicate));
 const remove=localStorage.removeItem;localStorage.removeItem=key=>{if(key===duplicateKey)throw Error('fixture cleanup failure');remove(key);};const known=committed;
 await assert.rejects(transport.runPlanAssignmentRequest(options()),/cleanup failure/);assert.ok(localStorage.getItem(winnerKey),'partial cleanup retains the winning receipt identity');localStorage.removeItem=remove;
 await transport.runPlanAssignmentRequest(options());assert.equal(committed,known);assert.equal(localStorage.length,0,'cleanup recovery probes the original receipt and never reassigns');
 console.log('PASS: lost-response/reload/relogin recovery, one double-click request, read-back retry, storage failure, account-switch isolation and retained ambiguous drafts');
})().catch(error=>{console.error(error);process.exitCode=1;});
