const assert=require('node:assert/strict'),fs=require('node:fs');
const {load,deferred,hooks,jsx,find,text}=require('./independent-test-support.cjs');
(async()=>{
 const source=fs.readFileSync('src/components/role-workspace/RoleSections.tsx','utf8');
 for(const [name,status] of [['SupervisorPlanCompletedPanel','plan_completed'],['SupervisorApprovalsPanel','awaiting_supervisor'],['SupervisorForceRetryPanel','scheduled']]){
  const runtime=hooks();let gate=deferred(),changes=0,notifications=0,successes=0;
  const original={id:'fixture-Q',studentId:'fixture-S',halaqaId:1,status,attempt:2,phase:'full',scheduledAt:new Date(Date.now()+86400000).toISOString(),createdAt:'2026-10-01'};let queue=[{...original}];
  const mock={loadStudents:()=>[{id:'fixture-S',name:'fixture student',halaqaId:1}],loadHalaqat:()=>[{id:1,name:'fixture halaqa'}],loadSardQueue:()=>queue,updateSardItem:(_id,patch)=>{changes++;queue=[{...queue[0],...patch}];},forwardPlanToSard:()=>{changes++;queue=[{...queue[0],status:'pending'}];return queue[0];},pushNotification:()=>notifications++,flushSardQueue:()=>gate.promise};
  const confirmed=load('src/hooks/use-confirmed-sard-action.ts',{'react':runtime.react,'@/lib/mock-data':mock});
  const flow=load('src/lib/sard-phased-flow.ts',{'@/lib/evaluation-calculator':{}});
  const deps=Object.fromEntries([...source.matchAll(/from "([^"]+)"/g)].map(match=>[match[1],{}]));
  Object.assign(deps,{'react':runtime.react,'react/jsx-runtime':jsx,'@/lib/mock-data':mock,'@/hooks/use-confirmed-sard-action':confirmed,'@/hooks/use-inbox-refresh':{useInboxRefresh:()=>{}},'@/lib/sard-phased-flow':flow,'@/lib/arabic-numbers':{weekLabel:String},'@/lib/teacher-notifications':{notifyTeacherHalaqa:()=>notifications++,daysSinceLabel:()=> 'fixture'},'@/lib/plan-dates':{formatPlanDate:String,formatPlanDateTime:String},'sonner':{toast:{success:()=>successes++,error:()=>{}}}});
  const panels=load('src/components/role-workspace/RoleSections.tsx',deps);
  const render=()=>runtime.render(panels[name]);
  const button=()=>find(render(),node=>node.type==='button')[0];
  const click=button().props.onClick;const first=click();const repeated=click();await repeated;
  assert.equal(changes,1,name+' suppresses a repeated click');assert.equal(button().props.disabled,true);assert.equal(notifications,0);assert.equal(successes,0);
  queue=[{...original}];gate.reject(Error('fixture server conflict'));await first;
  assert.equal(notifications,0);assert.equal(successes,0);assert.ok(text(render()).includes('fixture server conflict'));assert.equal(button().props.disabled,false);
  gate=deferred();const retry=button().props.onClick();assert.equal(notifications,0);gate.resolve();await retry;
  assert.equal(successes,1);assert.ok(notifications>0,name+' notifies only after server confirmation');
  if(name==='SupervisorApprovalsPanel')assert.equal(queue[0].attempt,3,'the existing third-attempt rule is unchanged');
 }
 console.log('PASS: actual forward, third-approval and immediate-retry panel callbacks wait for confirmation and retain retry after failure');
})().catch(error=>{console.error(error);process.exitCode=1;});
