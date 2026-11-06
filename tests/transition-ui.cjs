const assert=require('node:assert/strict'),fs=require('node:fs');
const {load,hooks,jsx,find,text,deferred,flush}=require('./independent-test-support.cjs');
const types=load('src/lib/evaluation-types.ts',{}),calculator=load('src/lib/evaluation-calculator.ts',{'@/lib/evaluation-types':types});
const rules=load('src/lib/evaluation-rules-snapshot.ts',{'@/lib/evaluation-types':types});
const flow=load('src/lib/sard-phased-flow.ts',{'@/lib/evaluation-calculator':calculator});
const source=fs.readFileSync('src/routes/musammi.tsx','utf8')+'\nexport { SardEvaluatorFull, SardEvaluatorReviewOnly };';
async function scenario(review,reject){
 const runtime=hooks(),gate=deferred(),sent=[],writes=[],toasts=[];let done=0;
 const snapshot=rules.snapshotEvaluationRules(types.DEFAULT_EVALUATION_SETTINGS);
 const item={id:'queue',studentId:'student',assignmentId:'assignment',halaqaId:1,week:2,attempt:2,status:review?'awaiting_review':'pending',phase:review?'review_only':'full',hifzErrors:0,hifzWarnings:0,reviewErrors:[0,0,0],reviewWarnings:[0,0,0],...(review?{lockedHifzScore:50,lockedHifzErrors:0,lockedHifzWarnings:0,evaluationRules:snapshot}:{})};
 const settings={...types.DEFAULT_EVALUATION_SETTINGS};
 const deps=Object.fromEntries([...source.matchAll(/from "([^"]+)"/g)].map(m=>[m[1],{}]));
 Object.assign(deps,{'react':runtime.react,'react/jsx-runtime':jsx,'@tanstack/react-router':{createFileRoute:()=>()=>({})},'@/lib/mock-data':{loadSardQueue:()=>[item],flushSardQueue:async()=>{throw Error('Passing UI must durably prepare before any queue network call');},updateSardItem:()=>writes.push('queue'),pushSardHistory:()=>writes.push('history'),pushNotification:()=>writes.push('notification')},'@/contexts/EvaluationSettingsContext':{useEvaluationSettings:()=>({settings,verified:true})},'@/lib/evaluation-rules-snapshot':rules,'@/lib/evaluation-calculator':calculator,'@/lib/sard-phased-flow':flow,'@/lib/post-pass-automation':{runPostPassAutomation:payload=>{sent.push(payload);return gate.promise;}},'@/lib/teacher-notifications':{notifyTeacherHalaqa:()=>writes.push('notification')},'sonner':{toast:{success:m=>toasts.push(['success',m]),error:m=>toasts.push(['error',m]),warning:m=>toasts.push(['warning',m])}}});
 const route=load('src/routes/musammi.tsx',deps,source),render=()=>runtime.render(()=>route[review?'SardEvaluatorReviewOnly':'SardEvaluatorFull']({item,studentName:'fixture',halaqaName:'fixture',level:'1',levelType:'gold',onDone:()=>done++}));
 const button=find(render(),n=>n.type==='button'&&text(n).includes('إرسال'))[0];button.props.onClick();button.props.onClick();await flush();
 assert.equal(sent.length,1);assert.equal(done,0);assert.deepEqual(writes,[]);assert.deepEqual(toasts,[]);
 const payload=sent[0];assert.equal(payload.assignmentId,item.assignmentId);assert.equal(payload.queueItemId,item.id);assert.equal(payload.historyRecord.at,'');assert.equal(payload.historyRecord.hifzErrors,0);assert.equal(payload.historyRecord.hifzWarnings,0);assert.ok(payload.historyRecord.reviewErrors.every(x=>x===0));assert.ok(payload.historyRecord.reviewWarnings.every(x=>x===0));assert.ok(rules.validEvaluationRules(payload.historyRecord.evaluationRules));
 settings.error_deduction=999;assert.notEqual(payload.historyRecord.evaluationRules.settings.error_deduction,999,'the original settings are frozen before waiting');
 if(reject){gate.reject(Error('uncertain response; original request retained'));await flush();assert.equal(done,0);assert.ok(toasts.some(x=>x[0]==='error'));assert.ok(!toasts.some(x=>x[0]==='success'));}
 else{gate.resolve({historyRecord:{...payload.historyRecord,transitionConfirmed:true},newGlobalPhase:2,newPlanTitle:'confirmed next'});await flush();assert.equal(done,1);assert.equal(toasts.filter(x=>x[0]==='success').length,1);}
 assert.deepEqual(writes,[],'the confirmed atomic path never echoes legacy queue/history/notifications');runtime.cleanup();
}
(async()=>{for(const review of [false,true])for(const reject of [false,true])await scenario(review,reject);console.log('PASS: actual full/review passing UI freezes raw assessment/rules, coalesces clicks, waits for confirmation, reports uncertain saves and never echoes legacy writes');})().catch(e=>{console.error(e);process.exitCode=1;});
