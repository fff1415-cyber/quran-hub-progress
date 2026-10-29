const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(path, dependencies) {
  const e={}; const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','exports',js)(n=>{if(!(n in dependencies))throw Error(n);return dependencies[n]},e);return e;
}
const mock=load('src/lib/mock-data.ts',{'@/lib/shared-state':{captureSharedEdit:()=>{},sharedSaveStatus:()=>({state:"failed"}),getDataSemester:()=>null,semesterStorageKey:k=>k},'@/lib/grade-cell-sync':{captureGradeCellEdit:()=>{}},'@/lib/auth-session':{hasAuthToken:()=>false}});
const semester=load('src/lib/semester-grading.ts',{'@/lib/mock-data':mock,'@/lib/calendar-generator':{},'@/lib/semester-holidays':{},'@/lib/operational-date':{}});
for(const hifz of [undefined,null,'','bogus',0,false]) {
  assert.equal(mock.isHifzChecked(hifz),false);
  assert.equal(mock.dayScore({hifz},false,'gold'),0);
  assert.equal(semester.dayScoreBreakdown({hifz},'gold',false).earned,0);
  assert.equal(semester.isDayFullyComplete({attendance:'present',hifz,rabt:'pass',muraja:'pass'},false),false);
}
for(const hifz of ['half','one','two']) {
  assert.equal(mock.isHifzChecked(hifz),true);
  assert.equal(mock.dayScore({hifz},false,'gold'),20);
  assert.equal(semester.dayScoreBreakdown({hifz},'gold',false).earned,20);
}
const progress=load('src/lib/plan-progress.ts',{});
const sheet={assignment:{start_segment_index:11},plan:{},segments:Array.from({length:20},(_,i)=>({segment_index:i+1})),completions:Array.from({length:20},(_,i)=>({task_type:'hifz',segment_index:i+1}))};
assert.deepEqual(progress.planHifzProgress(sheet),{done:10,total:10,percent:100,complete:true});
sheet.completions.pop();assert.equal(progress.planHifzProgress(sheet).percent,90);assert.equal(progress.planHifzProgress(sheet).complete,false);
sheet.assignment.start_segment_index=21;assert.equal(progress.planHifzProgress(sheet).complete,false);
sheet.assignment.start_segment_index=11;sheet.segments=sheet.segments.filter(s=>s.segment_index!==11);assert.equal(progress.planHifzProgress(sheet).total,0);assert.equal(progress.planHifzProgress(sheet).complete,false);
const sci=load('src/lib/scientific-grades.ts',{'@/lib/shared-state':{captureSharedEdit:()=>{},sharedSaveStatus:()=>({state:"failed"}),getDataSemester:()=>null,semesterStorageKey:k=>k},'@/lib/grade-cell-sync':{captureGradeCellEdit:()=>{}},'@/lib/auth-session':{hasAuthToken:()=>false},'@/lib/grade-input-settings':{},'@/lib/mock-data':mock,'@/lib/scientific-grades-program':{}});
assert.equal(sci.scientificPeriodAssessmentCount({S:{1:{sun:{hifz:'0'},mon:{hifz:''},tue:{hifz:'invalid'}}}},'S',[1],['hifz']),1);
const combined=load('src/lib/halaqa-program-combined-totals.ts',{'@/lib/halaqa-programs':{studentAllProgramsWeekTotals:()=>({earned:0,maxPossible:0,filledSlots:0})},'@/lib/scientific-grades':sci});
const config={visible:true,fields:{hifz:true},defaultScores:{hifz:'10'}};
assert.equal(combined.buildCombinedProgramTotals([],{},'S',[1],{S:{1:{sun:{hifz:'0'}}}},['hifz'],['sun'],config).hasData,true);
assert.equal(combined.buildCombinedProgramTotals([],{},'S',[1],{},['hifz'],['sun'],config).hasData,false);
assert.equal(combined.buildCombinedProgramTotals([],{},'S',[1],{S:{1:{mon:{hifz:'0'}}}},['hifz'],['sun'],config).hasData,false);
const days=[{weekNumber:1,dayKey:'sun',iso:'2026-10-11'},{weekNumber:1,dayKey:'mon',iso:'2026-10-12'}];
const faces=load('src/lib/plan-daily-faces.ts',{'@/lib/mock-data':mock,'@/lib/semester-grading':{getElapsedSemesterDays:()=>days,getTotalSemesterWorkingDays:()=>10}});
const grades={S:{1:{days:{sun:{hifz:'one',compensationFaces:0.5},mon:{hifz:'two',compensationFaces:1}},compensationMurajaFaces:20}}};
const r=faces.aggregateFaceProgress('S',grades,{operationalDate:'2026-10-12'},faces.resolveFaceQuotas('gold'),'2026-10-11','2026-10-11');
assert.equal(r.hifzActual,1.5);assert.equal(r.workingDays,1);assert.equal(r.murajaActual,0);assert.equal(r.undatedMurajaCompensation,20);
delete grades.S[1].days.sun.compensationFaces;delete grades.S[1].days.mon.compensationFaces;grades.S[1].compensationFaces=3;
const legacy=faces.aggregateFaceProgress('S',grades,{operationalDate:'2026-10-12'},faces.resolveFaceQuotas('gold'),'2026-10-11','2026-10-11');
assert.equal(legacy.hifzActual,1);assert.equal(legacy.undatedHifzCompensation,3);
const empty=faces.aggregateFaceProgress('S',grades,{operationalDate:'2026-10-12'},faces.resolveFaceQuotas('gold'),'2026-11-01','2026-11-02');assert.equal(empty.hifzActual,0);
console.log('PASS: F13 date-exact faces, F20 assignment range, F21 valid hifz, F22 assessed zero');
