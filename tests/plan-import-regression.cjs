const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync('src/lib/student-plan-link.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let assigned=0,current={assignment:{id:'A'},plan:{id:'old-catalog',track:'gold',level_number:1001}};
const deps={
 '@/lib/academic-context':{fetchActiveCalendar:async()=>({semester:{start_date:'2026-10-01'}})},
 '@/lib/plan-level-ranges':{validateLevelAndPhase:()=>({ok:true}),findPlanByGlobalPhase:p=>p[0],murajaStartSegment:()=>16},
 '@/lib/plan-daily-faces':{resolveFaceQuotas:()=>({})},
 '@/lib/plans-service':{assignStudentPlan:async()=>{assigned++},fetchPlans:async()=>[{id:'P',track:'gold',level_number:1001}],fetchStudentPlanSheet:async()=>current}
};const e={};new Function('require','exports',code)(n=>{if(!deps[n])throw Error(n);return deps[n]},e);
(async()=>{
 const opts={studentId:'S',track:'gold',instituteLevel:'التأهيل',globalPhase:1,assignedBy:'test'};
 assert.equal((await e.linkStudentToPlan(opts)).ok,true);assert.equal(assigned,0,'unchanged import must not reassign');
 current={assignment:{id:'A'},plan:{id:'old',track:'silver',level_number:1002}};
 const different=await e.linkStudentToPlan(opts);assert.equal(different.ok,false);assert.match(different.message,/اعتمادًا منفصلًا/);assert.equal(assigned,0);
 current={assignment:null,plan:null};await e.linkStudentToPlan(opts);assert.equal(assigned,1);
 console.log('PASS: unchanged imports preserve assignment; changed existing link requires separate approval; initial link remains supported');
})().catch(e=>{console.error(e);process.exitCode=1});
