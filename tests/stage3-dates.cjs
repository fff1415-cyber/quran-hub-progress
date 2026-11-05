const assert=require('node:assert/strict'),fs=require('node:fs');const {load}=require('./independent-test-support.cjs');
const generator=load('src/lib/calendar-generator.ts',{}),holidays=load('src/lib/semester-holidays.ts',{});
const academic=load('src/lib/academic-context.ts',{'@/lib/calendar-generator':generator,'@/lib/semester-holidays':holidays,'@/lib/operational-date':{},'@/lib/cloud-sync':{},'@/lib/secure-data.functions':{},'@/lib/arabic-numbers':{}});
const dates=load('src/lib/plan-completion-date.ts',{'@/lib/academic-context':academic});
const calendar={semester:{start_date:'2026-10-04',weeks_count:4,working_days:[0,1,2,3,4],excluded_dates:[]}};
assert.equal(dates.planCompletionDate(calendar,1,'mon'),'2026-10-05');assert.equal(dates.planCompletionDate(calendar,2,'mon'),'2026-10-12');assert.equal(dates.planCompletionDate({semester:null},1,'mon'),null);
const teacher=fs.readFileSync('src/routes/teacher.tsx','utf8');assert.match(teacher,/applyPlanInput\(s.id, "hifz", tap, senderName, completedAt\)/);assert.match(teacher,/applyPlanInput\(s.id, task, tap, senderName, completedAt \?\? undefined\)/);
console.log('PASS: actual calendar resolves selected historical week/day; both teacher plan calls pass the captured cell date, with no current-date guess when calendar is absent');
