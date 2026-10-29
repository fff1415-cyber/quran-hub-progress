const assert=require('node:assert/strict'),fs=require('node:fs');
const {load,hooks,jsx,find,text,deferred,flush}=require('./independent-test-support.cjs');
const source=fs.readFileSync('src/components/role-workspace/AdminOverviewPanel.tsx','utf8'),runtime=hooks();let gate=deferred(),changes=0,notifications=0,success=0;
const original={id:'fixture-Q',studentId:'S',halaqaId:1,week:1,status:'scheduled',phase:'full',attempt:2};let queue=[{...original}];
const mock={loadGrades:()=>({}),loadHalaqat:()=>[{id:1,name:'fixture'}],loadStudents:()=>[{id:'S',halaqaId:1,name:'fixture student'}],loadSardQueue:()=>queue,loadNotifications:()=>[],updateSardItem:(_id,patch)=>{changes++;queue=[{...original,...patch}];},pushNotification:()=>notifications++,flushSardQueue:()=>gate.promise};
const action=load('src/hooks/use-confirmed-sard-action.ts',{'react':runtime.react,'@/lib/mock-data':mock});
const deps=Object.fromEntries([...source.matchAll(/from "([^"]+)"/g)].map(m=>[m[1],{}]));
Object.assign(deps,{'react':runtime.react,'react/jsx-runtime':jsx,'@/lib/mock-data':mock,'@/hooks/use-confirmed-sard-action':action,'@/hooks/use-readonly-grades':{useReadOnlyGrades:()=>({loading:false,refresh:async()=>{}})},'@/hooks/use-inbox-refresh':{useInboxRefresh:()=>{}},'@/lib/operational-date':{getCalendarDayKey:()=> 'sun'},'@/lib/arabic-numbers':{weekLabel:String},'@/lib/academic-context':{fetchActiveCalendar:async()=>({currentWeekNumber:1})},'sonner':{toast:{success:()=>success++}}});
const panel=load('src/components/role-workspace/AdminOverviewPanel.tsx',deps),render=()=>runtime.render(panel.AdminOverviewPanel),button=()=>find(render(),n=>n.type==='button'&&text(n).includes('إعادة'))[0];
(async()=>{
 const click=button().props.onClick;click();click();assert.equal(changes,1);assert.equal(button().props.disabled,true);assert.equal(notifications,0);assert.equal(success,0);
 queue=[{...original}];gate.reject(Error('fixture administrator save failure'));await flush();assert.equal(notifications,0);assert.equal(success,0);assert.ok(text(render()).includes('fixture administrator save failure'));
 gate=deferred();button().props.onClick();assert.equal(changes,2);gate.resolve();await flush();assert.equal(success,1);assert.equal(notifications,1);assert.equal(queue[0].status,'pending');assert.equal(queue[0].attempt,2,'existing attempt criteria are unchanged');
 console.log('PASS: actual administrator immediate-retry button confirms the queue before notification, suppresses duplicate clicks and retains failure/retry');
})().catch(error=>{console.error(error);process.exitCode=1;});
