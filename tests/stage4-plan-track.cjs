const assert=require('node:assert/strict'),fs=require('node:fs');const {load}=require('./independent-test-support.cjs');
const importer=load('src/lib/plan-excel-import.ts',{xlsx:require('xlsx')}),ranges=load('src/lib/plan-level-ranges.ts',{'@/lib/plan-excel-import':importer});
async function run(source,actualTrack,profileTrack){
 const current={id:'current',track:actualTrack,title:'fixture-current',level_number:1001},next={id:'next',track:actualTrack,title:'fixture-next',level_number:1002};let advanced=false,writes=0,requested;
 const deps={'@/lib/plan-level-ranges':ranges,'@/lib/plan-daily-faces':{normalizeTaskQuotas:()=>({})},'@/lib/plans-service':{fetchStudentPlanSheet:async()=>({plan:advanced?next:current,assignment:{id:advanced?'confirmed-next':'observed',plan_start_date:'2026-10-05',assigned_at:'fixture'}}),fetchPlans:async track=>{requested=track;return track===actualTrack?[current,next]:[];},assignStudentPlan:async(student,plan,start,by,options)=>{assert.equal(plan,'next');assert.equal(options.expected_assignment_id,'observed');writes++;advanced=true;}}};
 const progression=load('src/lib/plan-progression.ts',deps,source);const result=await progression.completePlanAndAdvance('fixture-student','fixture',profileTrack,{expectedAssignmentId:'observed',studentPhase:1,planStartDate:'2026-10-05',sardResult:{id:'fixture-queue',percent:90,phase:'full'}});
 assert.equal(requested,actualTrack);assert.equal(result.newPlanId,'next');assert.equal(result.newGlobalPhase,2);assert.equal(writes,1);
}
(async()=>{
 const current=fs.readFileSync('src/lib/plan-progression.ts','utf8');
 // Exact source snapshot from PR55 commit 5874f7230864787840b6c863155af589c9613189.
 const prior=fs.readFileSync('tests/fixtures/pre-stage4-plan-progression.ts.txt','utf8');
 await assert.rejects(run(prior,'gold','silver'),/الخطة التالية غير موجودة/);
 await run(current,'gold','silver');await run(current,'silver','gold');await run(current,'gold','gold');
 console.log('PASS: prior real implementation reproduces missing-next-plan for a stale profile track; actual assignment track fixes both directions and ordinary gold 1->2 with one assignment request and unchanged profile data');
})().catch(e=>{console.error(e);process.exitCode=1;});
