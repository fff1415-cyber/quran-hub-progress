const assert=require('node:assert/strict');
const {load}=require('./candidate/tests/independent-test-support.cjs');
const {secretaryAttendanceRows}=load('candidate/src/hooks/use-secretary-attendance.ts',{'react':{},'@/lib/academic-context':{},'@/lib/grade-sync':{},'@/lib/mock-data':{},'@/lib/operational-date':{}});
let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',part=>raw+=part);
process.stdin.on('end',()=>{
 const cases=JSON.parse(raw);let checks=0,matched=0;
 for(const c of cases){
  const weeks=new Set(c.students.flatMap(s=>Object.keys(c.grades[s.id]??{})));
  for(const week of weeks)for(const day of ['sun','mon','tue','wed','thu','fri','sat']){
   const actual=secretaryAttendanceRows(c.students,c.grades,Number(week),day);
   assert.equal(actual.length,c.counts[week+':'+day]??0);checks++;matched+=actual.length;
  }
 }
 assert.ok(checks>0);console.log(JSON.stringify({status:'PASS isolated restored attendance matches independently counted original records',complexes:cases.length,week_day_checks:checks,matched_absent_or_late:matched,production_writes:false}));
});
