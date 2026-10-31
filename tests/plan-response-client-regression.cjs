const assert=require('node:assert/strict');
const {load,storage,deferred}=require('./independent-test-support.cjs');
global.localStorage=storage();
let token='fixture-A',complex=1,pending=false,phaseCalls=0,posts=0;
const cloud={getToken:()=>token},key='qshatawi_sard_queue_v2',response=value=>({ok:true,status:200,text:async()=>JSON.stringify(value)});
const guard=load('src/lib/plan-response-cache.ts',{'@/lib/cloud-sync':cloud,'@/lib/tenant':{getActiveComplexId:()=>complex},'@/lib/mock-data':{hasPendingSardWrites:()=>pending}});
const deps={'@/lib/api-base':{buildRphpUrl:p=>p},'@/lib/cloud-sync':cloud,'@/lib/plans-store':{localGetStudentSheet:()=>({assignment:null})},'@/lib/student-phase-promote':{syncStudentPhaseFromPlan:async()=>{phaseCalls++;}},'@/lib/plan-translator':{},'@/lib/plan-response-cache':guard};
Object.assign(deps,{'@/lib/auth-session':{decodeAuthTokenPayload:()=>({role:'supervisor',accountId:'fixture'})},'@/lib/tenant':{getActiveComplexId:()=>complex},'@/lib/plan-assignment-requests':require('./independent-test-support.cjs').load('src/lib/plan-assignment-requests.ts',{})});
const service=load('src/lib/plans-service.ts',deps),sheet={assignment:{id:'B'},plan:{id:'P',track:'gold',level_number:1001}},old=[{id:'old',status:'pending',unknown:null}],newer=[{id:'local-new',status:'scheduled',unknown:{keep:0}}];
const assign=()=>service.assignStudentPlan('S','P',1,'fixture',{expected_assignment_id:'A'});
async function race(run,result,edit){const entered=deferred(),release=deferred();global.fetch=async(path,options)=>{if(options?.method==='POST'){posts++;entered.resolve();await release.promise;const request=JSON.parse(options.body);return response(request.operation_id?{...result,ok:true,operation_id:request.operation_id,operation_applied:true}:result);}return response(path.startsWith('/plans/student-sheet')?sheet:[]);};const task=run();await entered.promise;edit();release.resolve();return task;}
(async()=>{
 localStorage.setItem(key,JSON.stringify(old));
 await race(assign,{assignment_id:'B',sard_queue:[{id:'server-old'}]},()=>localStorage.setItem(key,JSON.stringify(newer)));
 assert.deepEqual(JSON.parse(localStorage.getItem(key)),newer,'delayed assignment response cannot erase a newer local queue');
 localStorage.setItem(key,JSON.stringify(old));
 await race(()=>service.updateSupervisorPlanHifz('S','B',1,'complete','2026-10-31',1),{ok:true,sard_queue:[{id:'server-old'}]},()=>localStorage.setItem(key,JSON.stringify(newer)));
 assert.deepEqual(JSON.parse(localStorage.getItem(key)),newer,'delayed supervisor response cannot erase another ongoing queue edit');
 localStorage.setItem(key,JSON.stringify(old));
 await race(assign,{assignment_id:'B',sard_queue:[{id:'server-old'}]},()=>{pending=true;});assert.deepEqual(JSON.parse(localStorage.getItem(key)),old,'unchanged bytes with a pending writer still need protection');pending=false;
 await race(assign,{assignment_id:'B',sard_queue:[{id:'confirmed'}]},()=>{});assert.equal(JSON.parse(localStorage.getItem(key))[0].id,'confirmed','unchanged settled cache accepts the confirmed queue');
 localStorage.setItem(key,JSON.stringify(old));const beforePhase=phaseCalls;
 await assert.rejects(race(assign,{assignment_id:'B',sard_queue:[{id:'wrong-account'}]},()=>{token='fixture-B';}),/تغيّرت الجلسة/);assert.deepEqual(JSON.parse(localStorage.getItem(key)),old);assert.equal(phaseCalls,beforePhase,'a stale account response cannot continue phase synchronization');token='fixture-A';
 await assert.rejects(race(assign,{assignment_id:'B',sard_queue:[{id:'wrong-complex'}]},()=>{complex=2;}),/تغيّرت الجلسة/);assert.deepEqual(JSON.parse(localStorage.getItem(key)),old);complex=1;
 const entered=deferred(),release=deferred();const beforePosts=posts;global.fetch=async(_path,options)=>{if(options?.method==='POST')posts++;entered.resolve();await release.promise;return response({assignment:{id:'A'}});};const beforePost=service.assignStudentPlan('S','P',1,'fixture');await entered.promise;token='fixture-B';release.resolve();await assert.rejects(beforePost,/تغيّرت الجلسة/);assert.equal(posts,beforePosts,'session switch during initial read prevents any POST');token='fixture-A';
 const snapshot=guard.capturePlanResponse();assert.throws(()=>guard.applyPlanSardResponse(snapshot,{}),/لم يؤكد الخادم/);assert.deepEqual(JSON.parse(localStorage.getItem(key)),old);
 console.log('PASS: actual assignment/supervisor services retain newer and pending local work; confirmed updates accepted; stale session/complex responses and pre-POST context switches fenced; invalid snapshots retained');
})().catch(error=>{console.error(error);process.exitCode=1;});
