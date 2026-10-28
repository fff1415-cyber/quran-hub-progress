const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(path,deps){const e={};const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',js)(n=>{if(!deps[n])throw Error(n);return deps[n]},e);return e;}
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
global.localStorage=storage();global.sessionStorage=storage();global.window=new EventTarget();let sharedWrites=0;
const mock=load('src/lib/mock-data.ts',{'@/lib/shared-state':{captureSharedEdit:()=>sharedWrites++,getDataSemester:()=> 'A'},'@/lib/auth-session':{hasAuthToken:()=>true}});
const transfers=load('src/lib/transfer-actions.ts',{'@/lib/mock-data':mock});
mock.pushNotification({type:'transfer',message:'synthetic',transferStatus:'pending',transferData:{studentId:'S',halaqaId:1,week:1,reason:'synthetic',fromName:'test'}});
const root=mock.loadNotifications()[0];const recipient={type:'transfer',message:'synthetic',targetRole:'supervisor',transferStatus:'pending',transferData:{...root.transferData,rootTransferId:root.id}};
transfers.forwardTransferRecord(root,'to_supervisor',recipient);transfers.forwardTransferRecord(root,'to_supervisor',recipient);assert.equal(mock.loadNotifications().length,2,'repeated local routing does not duplicate recipient');
const child=mock.loadNotifications().find(n=>n.id!==root.id);transfers.appendTransferAction(child.id,{role:'supervisor',byName:'test',text:'reviewed',at:'2026-10-11T00:00:00Z'},{read:true,transferStatus:'closed'});
assert.ok(mock.loadNotifications().every(n=>n.transferData.actions.length===1),'action mirrors original link');assert.equal(sharedWrites,0,'held F03 never widens recipient access by publishing to app-state');
let cleanup;const hook=load('src/hooks/use-inbox-refresh.ts',{'react':{useEffect:fn=>cleanup=fn()},'@/lib/mock-data':{NOTIFICATIONS_CHANGED_EVENT:'notes'},'@/lib/shared-refresh':{SHARED_REFRESH_EVENT:'shared',CLOCK_TICK_EVENT:'clock'}});
const flow=load('src/lib/sard-phased-flow.ts',{'@/lib/evaluation-calculator':{}});let now=1000,visible=false,updates=0;const item={status:'scheduled',scheduledAt:new Date(2000).toISOString(),phase:'full'};
hook.useInboxRefresh(()=>{updates++;visible=flow.isMusammiVisible(item,now)});
window.dispatchEvent(new Event('shared'));assert.equal(visible,false);now=2000;window.dispatchEvent(new Event('clock'));assert.equal(visible,true,'due item appears on clock event while page stays mounted');cleanup();window.dispatchEvent(new Event('clock'));assert.equal(updates,2);
console.log('PASS: held local transfer safety, retry identity and clock-driven shared-list refresh');
