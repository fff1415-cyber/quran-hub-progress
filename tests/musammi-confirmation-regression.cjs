const assert=require('node:assert/strict'),fs=require('node:fs');
const {load,hooks,jsx,find,text,deferred,flush}=require('./independent-test-support.cjs');
const types=load('src/lib/evaluation-types.ts',{}),calculator=load('src/lib/evaluation-calculator.ts',{'@/lib/evaluation-types':types});
const rules=load('src/lib/evaluation-rules-snapshot.ts',{'@/lib/evaluation-types':types});
const flow=load('src/lib/sard-phased-flow.ts',{'@/lib/evaluation-calculator':calculator});
const source=fs.readFileSync('src/routes/musammi.tsx','utf8')+'\nexport { SardEvaluatorFull, SardEvaluatorReviewOnly };';
async function scenario({review=false,itemPatch={},settingsPatch={},verified=true,expectStatus,fail=true}){
 const runtime=hooks();let gate=deferred(),flushCalls=0,notifications=0,done=0,patches=[],toasts=[],history=new Map(),usedSettings=[];
 const item={id:'fixture-Q',studentId:'fixture-S',halaqaId:1,week:1,attempt:1,status:review?'awaiting_review':'pending',phase:review?'review_only':'full',lockedHifzScore:review?45:undefined,...itemPatch};let queue=[{...item}];
 const settings={...types.DEFAULT_EVALUATION_SETTINGS,...settingsPatch};
 const context={settings,verified};
 const mock={loadSardQueue:()=>queue,flushSardQueue:()=>++flushCalls===1?Promise.resolve():gate.promise,updateSardItem:(_id,patch)=>{patches.push(patch);queue=[{...queue[0],...patch}];},pushSardHistory:entry=>history.set(entry.id,entry),pushNotification:()=>notifications++};
 const calc={...calculator,computeReviewScore:(segments,s)=>{usedSettings.push(s);return calculator.computeReviewScore(segments,s);}};
 const deps=Object.fromEntries([...source.matchAll(/from "([^"]+)"/g)].map(m=>[m[1],{}]));
 Object.assign(deps,{'react':runtime.react,'react/jsx-runtime':jsx,'@tanstack/react-router':{createFileRoute:()=>()=>({})},'@/lib/mock-data':mock,'@/contexts/EvaluationSettingsContext':{useEvaluationSettings:()=>context},'@/lib/evaluation-rules-snapshot':rules,'@/lib/evaluation-calculator':calc,'@/lib/sard-phased-flow':flow,'@/lib/teacher-notifications':{notifyTeacherHalaqa:()=>notifications++},'sonner':{toast:{success:m=>toasts.push(['success',m]),error:m=>toasts.push(['error',m]),warning:m=>toasts.push(['warning',m])}}});
 const route=load('src/routes/musammi.tsx',deps,source),render=()=>runtime.render(()=>route[review?'SardEvaluatorReviewOnly':'SardEvaluatorFull']({item,studentName:'fixture',halaqaName:'fixture',level:'1',levelType:'gold',onDone:()=>done++}));
 let tree=render();const button=()=>find(render(),n=>n.type==='button'&&text(n).includes('إرسال'))[0];
 if(!verified&&!item.evaluationRules){assert.equal(button().props.disabled,true);button().props.onClick();await flush();assert.equal(patches.length,0);runtime.cleanup();return;}
 const click=button().props.onClick;click();click();await flush();assert.equal(patches.length,1);assert.equal(patches[0].status,expectStatus);assert.equal(done,0);assert.equal(notifications,0);assert.equal(toasts.length,0);assert.ok(find(render(),n=>n.type==='button'&&n.props.disabled).some(n=>text(n).includes('تأكيد الحفظ')));
 if(fail){gate.reject(Error('fixture queue conflict'));await flush();assert.equal(done,0);assert.equal(notifications,0);assert.ok(toasts.some(x=>x[1]==='fixture queue conflict'));
  queue=[{...item}];gate=deferred();flushCalls=0;button().props.onClick();await flush();assert.equal(patches.length,2);gate.resolve();await flush();assert.equal(done,1);assert.ok(notifications>0);
 }else{gate.resolve();await flush();assert.equal(done,1);assert.ok(notifications>0);}
 if(expectStatus==='awaiting_review'&&!review){const snapshot=patches.at(-1).evaluationRules;assert.ok(rules.validEvaluationRules(snapshot));assert.deepEqual(snapshot.settings,settings);settings.error_deduction=999;assert.notEqual(snapshot.settings.error_deduction,999);}
 if(review&&item.evaluationRules){assert.deepEqual(usedSettings.at(-1),item.evaluationRules.settings,'deferred review uses the recorded rules after global settings change');}
 if(!review&&item.hifzErrors>3){assert.equal(history.size,1,'retry updates the same attempt record rather than generating a duplicate history ID');assert.ok(rules.validEvaluationRules([...history.values()][0].evaluationRules));}
 runtime.cleanup();
}
(async()=>{
 for(const attempt of [1,2,3])await scenario({itemPatch:{attempt,hifzErrors:4},expectStatus:attempt===1?'scheduled':attempt===2?'awaiting_supervisor':'final_failed'});
 await scenario({itemPatch:{reviewErrors:[4,0,0]},expectStatus:'awaiting_review'});
 await scenario({settingsPatch:{pass_percent:99},itemPatch:{hifzErrors:1},expectStatus:'final_failed'});
 const snapshot=rules.snapshotEvaluationRules(types.DEFAULT_EVALUATION_SETTINGS);
 await scenario({review:true,itemPatch:{reviewErrors:[4,0,0],evaluationRules:snapshot},settingsPatch:{review_error_deduction:40},expectStatus:'awaiting_review'});
 await scenario({review:true,itemPatch:{reviewErrors:[1,0,0]},settingsPatch:{pass_percent:99},expectStatus:'final_failed'});
 await scenario({verified:false});
 assert.equal(rules.validEvaluationRules({...snapshot,settings:{...snapshot.settings,error_deduction:NaN}}),false);
 console.log('PASS: actual full/review-only failure and deferral callbacks await the server, preserve retry/attempt policy, pin new deferred rules, and never signal success before acknowledgement');
})().catch(error=>{console.error(error);process.exitCode=1;});
