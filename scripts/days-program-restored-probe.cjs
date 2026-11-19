const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('./../candidate/node_modules/typescript');
const {load}=require('../candidate/tests/independent-test-support.cjs');
const {secretaryAttendanceRows}=load('candidate/src/hooks/use-secretary-attendance.ts',{'react':{},'@/lib/academic-context':{},'@/lib/grade-sync':{},'@/lib/mock-data':{},'@/lib/operational-date':{}});
const modulePath='candidate/src/lib/halaqa-programs.ts';
const programs=load(modulePath,{'@/lib/auth-session':{hasAuthToken:()=>false}});
let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',part=>raw+=part);
process.stdin.on('end',()=>{
 const cases=JSON.parse(raw);let checks=0,matched=0,programChecks=0,legacyLabels=0;
 for(const c of cases){
  const before=JSON.stringify(c);
  const weeks=new Set(c.students.flatMap(s=>Object.keys(c.grades[s.id]??{})));
  for(const week of weeks)for(const day of ['sun','mon','tue','wed','thu','fri','sat']){
   const actual=secretaryAttendanceRows(c.students,c.grades,Number(week),day);
   assert.equal(actual.length,c.counts[week+':'+day]??0);checks++;matched+=actual.length;
  }
  if(c.programs){
   const registry=c.programs.halaqa_programs??{},grades=c.programs.halaqa_program_grades??{};
   for(const [group,students] of Object.entries(grades)){
    const defs=(registry[group]??[]).map(programs.normalizeProgram).filter(p=>p.active!==false&&p.kind!=='scientific'&&p.id!=='scientific-grades-auto');
    for(const [student,weeks] of Object.entries(students))for(const week of Object.keys(weeks)){
     let earned=0,unknown=0;
     for(const p of defs)for(const slot of programs.programSlots(p)){
      const label=weeks[week]?.[p.id]?.[slot.key];if(!label)continue;
      const level=p.levels.find(l=>l.label===label);if(level)earned+=level.score;else unknown++;
     }
     const actual=programs.studentAllProgramsWeekTotals(defs,students,student,Number(week));
     assert.equal(actual.earned,earned);assert.equal(actual.unresolvedSlots??0,unknown);legacyLabels+=unknown;programChecks++;
    }
   }
  }
  assert.equal(JSON.stringify(c),before,'pure attendance and programme reads must not rewrite restored grades');
 }
 assert.ok(checks>0);assert.ok(programChecks>0);
 console.log(JSON.stringify({status:'PASS restored records',week_day_checks:checks,matched_absent_or_late:matched,program_student_week_checks:programChecks,preserved_unmatched_program_labels:legacyLabels,grade_values_unchanged:true,production_writes:false}));
});
