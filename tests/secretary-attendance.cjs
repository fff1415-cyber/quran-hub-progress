const assert = require('node:assert/strict');
const {load,hooks,flush,deferred} = require('./independent-test-support.cjs');
const events = new EventTarget(), doc = new EventTarget();
global.window = events; global.document = doc; doc.visibilityState = 'visible';
let timer;
global.setInterval = fn => (timer = fn, 1); global.clearInterval = () => {timer = null;};
const h = hooks();
const students = [{id:'A'}, {id:'B'}, {id:'C'}];
let grades = {}, week = 10, day = 'wed', calls = 0, failure = false, gate;
const moduleUnderTest = load('src/hooks/use-secretary-attendance.ts', {
  react: h.react,
  '@/lib/academic-context': {fetchActiveCalendar:async()=>({semester:{id:'S'},currentWeekNumber:week})},
  '@/lib/grade-sync': {refreshConfirmedGrades:async()=>{calls++;if(gate)await gate.promise;if(failure)throw Error('offline');return grades;}},
  '@/lib/mock-data': {GRADES_CHANGED_EVENT:'changed',loadGrades:()=>grades,loadStudents:()=>students},
  '@/lib/operational-date': {getCalendarDayKey:()=>day},
});
const render = () => h.render(moduleUnderTest.useSecretaryAttendance);
const set = (id,status,w=week,d=day) => {grades[id]??={};grades[id][w]??={days:{}};grades[id][w].days[d]={attendance:status};};
(async()=>{
  assert.equal(render().loading,true); h.effects();
  set('A','absent');set('B','late');set('C','present');set('A','present',1);
  await flush();
  assert.deepEqual(render().rows.map(r=>[r.s.id,r.status]),[['A','absent'],['B','late']]);
  assert.equal(render().error,false);
  // Another teacher/assistant session changes the same count but different students.
  set('A','present');set('C','absent');await timer();await flush();
  assert.deepEqual(render().rows.map(r=>r.s.id),['B','C']);
  // Local grade notifications update the display without starting another request.
  const reads=calls;set('B','present');events.dispatchEvent(new Event('changed'));
  assert.deepEqual(render().rows.map(r=>r.s.id),['C']);assert.equal(calls,reads);
  failure=true;events.dispatchEvent(new Event('focus'));await flush();
  assert.equal(render().error,true);assert.deepEqual(render().rows.map(r=>r.s.id),['C']);
  failure=false;week=11;day='sun';set('A','late');
  events.dispatchEvent(new Event('online'));await flush();
  assert.equal(render().error,false);assert.deepEqual(render().rows.map(r=>r.s.id),['A']);
  const before=calls;doc.visibilityState='hidden';await timer();assert.equal(calls,before);
  doc.visibilityState='visible';gate=deferred();events.dispatchEvent(new Event('focus'));
  events.dispatchEvent(new Event('online'));await flush();assert.equal(calls,before+1);
  h.cleanup();const previous=render();gate.resolve();await flush();assert.equal(render(),previous);
  assert.equal(timer,null);
  console.log('PASS secretary: fresh cloud grades, current week/day, cross-session changes, undo, offline retention, reconnect, deduplicated reads, cleanup; no write transport');
})().catch(e=>{console.error(e);process.exitCode=1;});
