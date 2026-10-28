const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),ts=require('typescript');
const {load,storage,deferred,flush,hooks,jsx,find,text}=require('./independent-test-support.cjs');
let assigned=0,current={assignment:{id:'A',status:'active'},plan:{id:'historical-directory-id',track:'gold',level_number:1001}},options;
const planDeps={'@/lib/academic-context':{fetchActiveCalendar:async()=>({semester:{start_date:'2026-10-01'}})},'@/lib/plan-level-ranges':{validateLevelAndPhase:()=>({ok:true}),findPlanByGlobalPhase:plans=>plans[0],murajaStartSegment:()=>16},'@/lib/plan-daily-faces':{resolveFaceQuotas:()=>({})},'@/lib/plans-service':{assignStudentPlan:async(_student,_plan,_segment,_by,opts)=>{assigned++;options=opts;},fetchPlans:async()=>[{id:'P',track:'gold',level_number:1001}],fetchStudentPlanSheet:async()=>current}};
const link=load('src/lib/student-plan-link.ts',planDeps);
(async()=>{
 const opts={studentId:'fixture-S',track:'gold',instituteLevel:'fixture',globalPhase:1,assignedBy:'fixture'};
 for(const status of ['active','frozen']){current.assignment.status=status;assert.equal((await link.linkStudentToPlan(opts)).ok,true);assert.equal(assigned,0);}
 current.plan.track='silver';assert.equal((await link.linkStudentToPlan(opts)).ok,false);assert.equal(assigned,0);
 current={assignment:null,plan:null};await link.linkStudentToPlan(opts);assert.equal(assigned,1);assert.equal(options.only_if_unassigned,true);assert.equal(options.expected_assignment_id,'');
 // Confirm a plan after a simulated lost response by reading it, never by reassigning it.
 planDeps['@/lib/plans-service'].assignStudentPlan=async()=>{assigned++;current={assignment:{id:'confirmed'},plan:{id:'P',track:'gold',level_number:1001}};throw Error('fixture response lost');};
 current={assignment:null,plan:null};await assert.rejects(link.linkStudentToPlan(opts),/response lost/);assert.equal((await link.linkStudentToPlan(opts)).ok,true);assert.equal(assigned,2);
 planDeps['@/lib/plans-service'].fetchStudentPlanSheet=async()=>{throw Error('fixture sheet unavailable');};await assert.rejects(link.linkStudentToPlan(opts),/unavailable/);assert.equal(assigned,2);

 // Compare the actual row mapper with main: ownership/contact behavior stays unchanged.
 function mapper(source){const sf=ts.createSourceFile('import.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const fn=sf.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text==='sheetRowToStudent');const code='export '+fn.getText(sf);return load('mapper.ts',{},code+'\n').sheetRowToStudent;}
 const source=fs.readFileSync('src/components/admin/StudentsAdminPanel.tsx','utf8');
 // Supply instituteLevel explicitly so neither version needs the catalog helper.
 const row={name:'fixture',nationalId:'synthetic',parentPhone:'synthetic',studentPhone:'synthetic',phaseNumber:1,instituteLevel:'fixture-new',levelType:'silver',halaqaName:'fixture-halaqa'};
 const old={id:'S',nationalId:'synthetic',name:'old',level:'5',phaseNumber:5,instituteLevel:'fixture-existing',levelType:'gold',assignedTo:'assistant',assignedAssistantCode:'fixture-code'};
 const before=mapper(cp.execFileSync('git',['show','3511c25308393218a6a9d5db69efaa8011f8cebc:src/components/admin/StudentsAdminPanel.tsx'],{encoding:'utf8'}))(row,1,old),after=mapper(source)(row,1,old);
 for(const field of ['level','phaseNumber','instituteLevel','levelType'])assert.equal(after[field],old[field]);
 for(const field of Object.keys(before).filter(key=>!['level','phaseNumber','instituteLevel','levelType'].includes(key)))assert.deepEqual(after[field],before[field],`unrelated mapper field ${field}`);

 // Exercise the actual import button: server failure must keep the draft and stop plan requests.
 global.window=new EventTarget();global.localStorage=storage();global.sessionStorage=storage();
 const runtime=hooks(),toasts=[];let gate=deferred(),halaqaCalls=0,studentCalls=0,planCalls=0,localWrites=0;
 const cloud={pushHalaqat:async()=>{halaqaCalls++;await gate.promise;},pushStudents:async()=>{studentCalls++;throw Error('fixture roster refusal');}};
 const linkTransport={linkStudentToPlan:async()=>{planCalls++;return {ok:true};}},planCatalog={fetchPlans:async()=>[]};
 const panel=load('src/components/admin/StudentsAdminPanel.tsx',{'react':runtime.react,'react/jsx-runtime':jsx,'@/lib/mock-data':{loadHalaqat:()=>[{id:1,name:'fixture-halaqa'}],loadStudents:()=>[old],saveHalaqat:()=>localWrites++,saveStudents:()=>localWrites++},'@/lib/google-sheets':{normalizeArabic:s=>s,STUDENT_IMPORT_COLUMNS:[]},'@/lib/cloud-sync':cloud,'@/lib/student-plan-link':linkTransport,'@/lib/plans-service':planCatalog,'@/lib/plan-level-ranges':{INSTITUTE_LEVELS:[],validateLevelAndPhase:()=>({ok:true}),instituteLevelFromGlobalPhase:()=>''},'@/lib/session-role':{getSessionName:()=> 'fixture'},'lucide-react':{},'sonner':{toast:{error:m=>toasts.push(['error',m]),warning:m=>toasts.push(['warning',m]),success:m=>toasts.push(['success',m])}},'@/lib/plan-daily-faces':{TRACK_FACE_QUOTAS:{}},'@/lib/student-qr-cards':{},'@/contexts/TenantContext':{useTenant:()=>({})}});
 const render=()=>runtime.render(panel.StudentImportPanel);render();runtime.state[2]=[row];
 const click=()=>find(render(),n=>n.type==='button'&&text(n).includes('تأكيد الاستيراد'))[0].props.onClick();
 const firstClick=find(render(),n=>n.type==='button'&&text(n).includes('تأكيد الاستيراد'))[0].props.onClick;
 firstClick();firstClick();assert.equal(halaqaCalls,1);assert.equal(localWrites,0);gate.resolve();await flush();assert.equal(studentCalls,1);assert.equal(planCalls,0);assert.equal(runtime.state[4],false);assert.equal(runtime.state[2].length,1);assert.equal(toasts.some(x=>x[0]==='success'),false);
 // The same preview can be retried; a link-role failure must remain its actual reason.
 cloud.pushStudents=async students=>{studentCalls++;assert.equal(students[0].phaseNumber,5);};
 linkTransport.linkStudentToPlan=async()=>{planCalls++;throw Error('Forbidden fixture plan role');};
 click();await flush();assert.equal(runtime.state[4],false);assert.equal(planCalls,1);assert.ok(toasts.some(x=>x[0]==='warning'&&x[1].includes('Forbidden fixture plan role')));assert.ok(!toasts.some(x=>x[1].includes('استورد Excel')));
 runtime.state[2]=[row];planCatalog.fetchPlans=async()=>{throw Error('fixture catalog unavailable');};click();await flush();
 assert.equal(runtime.state[4],false);assert.equal(runtime.state[2].length,1);assert.ok(toasts.some(x=>x[0]==='error'&&x[1].includes('حُفظت بيانات الطلاب')&&x[1].includes('catalog unavailable')));
 console.log('PASS: unchanged/frozen/lost-response imports preserve assignments, initial links carry atomic guard, mapper scope and real-button failure remain accurate');
})().catch(error=>{console.error(error);process.exitCode=1;});
