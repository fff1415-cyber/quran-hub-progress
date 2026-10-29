const assert=require('node:assert/strict');
const {load,storage,deferred,flush}=require('./independent-test-support.cjs');
global.localStorage=storage();
const deps={'@/lib/api-base':{buildRphpUrl:p=>p},'@/lib/cloud-sync':{getToken:()=> 'fixture'},'@/lib/plans-store':{localGetStudentSheet:()=>({assignment:null})},'@/lib/student-phase-promote':{syncStudentPhaseFromPlan:async()=>{}},'@/lib/plan-translator':{compensationHifzSegmentTarget:()=>0,compensationHifzTap:()=> 'one'}};
const service=load('src/lib/plans-service.ts',deps),response=(body,ok=true)=>({ok,status:ok?200:409,text:async()=>JSON.stringify(body)});
(async()=>{
let calls=[],current='A';
global.fetch=async(path,options)=>{calls.push({path,body:options?.body&&JSON.parse(options.body)});if(options?.method==='POST')return response({assignment_id:'B'});if(path.startsWith('/plans/student-sheet'))return response({assignment:{id:current},plan:{id:'P',track:'gold',level_number:1}});return response([]);};
for(const start of [0,-1,1.5,NaN])await assert.rejects(service.assignStudentPlan('S','P',start,'fixture'),/عددًا صحيحًا/);
assert.equal(calls.length,0);
await assert.rejects(service.assignStudentPlan('S','P',1,'fixture'),/تعذّر تأكيد/);assert.equal(calls.find(x=>x.body)?.body.expected_assignment_id,'A');
calls=[];current='B';await service.assignStudentPlan('S','P',3,'fixture',{expected_assignment_id:'A'});assert.equal(calls[0].body.expected_assignment_id,'A','explicit displayed snapshot must never be silently replaced by a fresh identity');
calls=[];await assert.rejects(service.patchStudentAssignment('S','frozen',''),/تحديد التعيين/);assert.equal(calls.length,0);
let gate=deferred(),done=false;global.fetch=async(path,options)=>{const body=JSON.parse(options.body);assert.deepEqual(body,{student_id:'S',assignment_id:'A',status:'frozen'});await gate.promise;return response({ok:true,assignment_id:'A',status:'frozen'});};
const pending=service.patchStudentAssignment('S','frozen','A').then(()=>done=true);await flush();assert.equal(done,false);gate.resolve();await pending;assert.equal(done,true);
global.fetch=async()=>response({ok:true,assignment_id:'B',status:'frozen'});await assert.rejects(service.patchStudentAssignment('S','frozen','A'),/تعذّر تأكيد/);
global.fetch=async()=>response({error:'fixture stale assignment'},false);await assert.rejects(service.patchStudentAssignment('S','active','A'),/stale assignment/);
console.log('PASS: exact assignment targeting, explicit stale snapshots, invalid starts and server-confirmed freeze/resume');
})().catch(error=>{console.error(error);process.exitCode=1;});
