const assert=require('node:assert/strict');const {load,storage,hooks,jsx,text}=require('./independent-test-support.cjs');
function fullStorage(){const s=storage();return {...s,get length(){return s.data.size},key:i=>[...s.data.keys()][i]??null};}
global.window=new EventTarget();global.localStorage=fullStorage();global.sessionStorage=storage();
const outbox=load('src/lib/grade-outbox.ts',{}),auth={getToken:()=> 'fixture-session',decodeAuthTokenPayload:()=>({role:'teacher',complexId:1,halaqaId:1,name:'fixture'}),hasAuthToken:()=>true};
const sync=load('src/lib/grade-sync.ts',{'./grade-outbox':outbox,'./auth-session':auth,'./secure-data.functions':{}});
const mock=load('src/lib/mock-data.ts',{'@/lib/auth-session':auth,'./grade-sync':sync,'./cloud-sync':{pushMergedGrades:async()=>({})}});
const legacy=JSON.stringify({S:{1:{days:{sun:{hifz:'two'}}}}});
localStorage.setItem('qshatawi_grades_v2',legacy);localStorage.setItem('qshatawi_grades_semester_id','legacy-period');
assert.deepEqual(mock.loadGrades(),{},'an unscoped browser snapshot is never a draft or an upload base');
mock.saveGrades({},{sync:false});mock.setGradesSemesterId('new-period');
assert.equal(localStorage.getItem('qshatawi_grades_v2'),legacy);
assert.equal(localStorage.getItem('qshatawi_grades_semester_id'),'legacy-period');
const box=sync.currentGradeOutbox();box.accept({protocol:1,context_complex_id:1,value:{S:{1:{days:{sun:{hifz:'',rabt:''}}}}},calendar_context:{known:true,active_semester_id:'fixture-semester'},versions:{}});
const plan={student_id:'S',expected_assignment_id:'fixture-assignment',task_type:'hifz',action:'record',tap:'one',completed_at:'2026-10-04',cell_path:['S','1','days','sun','hifz']};
mock.mutateStudentWeek('S',1,w=>({...w,days:{...w.days,sun:{...w.days.sun,hifz:'one',touchedAt:999999999999999,fieldTouchedAt:{hifz:999999999999999}}}}),{plan});
assert.equal(box.drafts().length,1);assert.deepEqual(box.drafts()[0].packet.plan,plan);assert.equal(mock.loadGrades().S[1].days.sun.hifz,'one');assert.equal(box.drafts()[0].packet.changes.length,1,'device clocks must not become conflicting shared writes');
const original=localStorage.setItem;localStorage.setItem=(key,value)=>{if(key.includes('operation:'))throw Error('fixture quota exceeded');return original(key,value);};
assert.throws(()=>mock.mutateStudentWeek('S',1,w=>({...w,days:{...w.days,sun:{...w.days.sun,rabt:'pass'}}})),/quota/);
assert.equal(box.drafts().length,1);assert.equal(mock.loadGrades().S[1].days.sun.rabt,'');assert.match(sync.gradeLocalSaveError(),/لم يُرسل/);
const h=hooks();const Status=load('src/components/GradeSaveStatus.tsx',{'react':h.react,'react/jsx-runtime':jsx,'@/lib/grade-sync':sync,'@/lib/mock-data':{loadStudents:()=>[]}}).GradeSaveStatus;
assert.match(text(h.render(()=>Status())),/تعذّر حفظ المسودة/);localStorage.setItem=original;
(async()=>{
 await assert.rejects(box.flush(async()=>({ok:true,operation_id:'wrong-receipt',input_sha256:'a'.repeat(64)})),/لم يؤكد/);assert.equal(box.drafts()[0].status,'pending');
 const before=box.view({}),after=structuredClone(before);after.S[1].days.sun.rabt='pass';box.edit(before,after);
 const sibling=new outbox.GradeOutbox(localStorage,JSON.stringify([1,'teacher',[1,'fixture'],undefined]));assert.equal(sibling.drafts().length,2,'same-account tabs share independent persisted operation keys');
 auth.decodeAuthTokenPayload=()=>null;assert.throws(()=>sync.recordGradeEdit({},{}),/هوية جلسة الحفظ/);assert.match(sync.gradeLocalSaveError(),/لم يُرسل/);assert.equal(sibling.drafts().length,2,'unidentified session cannot create a shared-cache fallback save');
 console.log('PASS: actual grade save/mutation wrappers preserve plan packet, ignore device clocks, retain prior data on storage failure, display local failure and refuse unmatched receipt; independent tab operations survive');
})().catch(error=>{console.error(error);process.exitCode=1;});
