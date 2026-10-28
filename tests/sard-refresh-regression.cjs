const assert=require('node:assert/strict');
const {load,storage,deferred,flush,hooks}=require('./independent-test-support.cjs');
global.window=new EventTarget();global.document={hidden:false};global.sessionStorage=storage();
let token='fixture-A',complex=1,queue=[],pending=false,calls=0,gate=deferred(),cacheWrites=0;
const refresh=load('src/lib/sard-queue-refresh.ts',{'@/lib/auth-session':{getToken:()=>token},'@/lib/tenant':{getActiveComplexId:()=>complex},'@/lib/secure-data.functions':{secureListAppState:async({data})=>{assert.equal(data.key,'sard_queue');calls++;return gate.promise;}},'@/lib/mock-data':{hasPendingSardWrites:()=>pending,loadSardQueue:()=>queue,saveSardQueue:value=>{assert.equal(sessionStorage.getItem('qs_syncing'),'1');queue=value;cacheWrites++;}}});
const rows=value=>[{key:'sard_queue',value}];
(async()=>{
 const first=refresh.refreshSardQueueFromShared(),same=refresh.refreshSardQueueFromShared();assert.equal(calls,1);assert.equal(first,same);
 gate.resolve(rows([{id:'remote',status:'pending'}]));await first;assert.equal(queue[0].id,'remote');assert.equal(cacheWrites,1);assert.equal(sessionStorage.getItem('qs_syncing'),null);
 gate=deferred();const oldRead=refresh.refreshSardQueueFromShared();queue=[{id:'remote',status:'scheduled'}];gate.resolve(rows([{id:'remote',status:'pending'}]));await oldRead;assert.equal(queue[0].status,'scheduled','read started before a local committed edit cannot undo it');
 pending=true;await refresh.refreshSardQueueFromShared();assert.equal(calls,2);pending=false;
 gate=deferred();const oldSession=refresh.refreshSardQueueFromShared();complex=2;token='fixture-B';gate.resolve(rows([{id:'previous-context'}]));await oldSession;assert.equal(queue[0].id,'remote');assert.equal(cacheWrites,1);
 gate=deferred();const fail=refresh.refreshSardQueueFromShared();gate.reject(Error('fixture refresh failure'));await assert.rejects(fail,/refresh failure/);assert.equal(refresh.getSardRefreshStatus().error,'fixture refresh failure');assert.equal(queue[0].status,'scheduled');
 gate=deferred();const retry=refresh.refreshSardQueueFromShared();gate.resolve(rows([{id:'retry',status:'pending'}]));await retry;assert.equal(refresh.getSardRefreshStatus().error,undefined);assert.equal(queue[0].id,'retry');
 // A mounted hook must recompute a deadline and release its timers/listeners.
 const runtime=hooks();let tick,cleared=false,updates=0,pulls=0;
 global.setInterval=fn=>{tick=fn;return 1;};global.clearInterval=()=>cleared=true;
 const hook=load('src/hooks/use-inbox-refresh.ts',{'react':runtime.react,'@/lib/mock-data':{NOTIFICATIONS_CHANGED_EVENT:'notes',SARD_QUEUE_CHANGED_EVENT:'queue'},'@/lib/sard-queue-refresh':{refreshSardQueueFromShared:async()=>{pulls++;}}});
 const flow=load('src/lib/sard-phased-flow.ts',{'@/lib/evaluation-calculator':{}});let now=1000,visible=false;
 const item={status:'scheduled',scheduledAt:new Date(2000).toISOString(),phase:'full'};
 runtime.render(()=>hook.useInboxRefresh(()=>{updates++;visible=flow.isMusammiVisible(item,now);}));runtime.effects();assert.equal(visible,false);
 now=2000;tick();assert.equal(visible,true);document.hidden=true;tick();assert.equal(pulls,2,'hidden tabs do not add network pulls');
 const before=updates;runtime.cleanup();window.dispatchEvent(new Event('queue'));assert.equal(updates,before);assert.equal(cleared,true);
 console.log('PASS: shared queue read-only refresh, coalescing, stale-write/session guards, failure/retry and deadline clock cleanup');
})().catch(error=>{console.error(error);process.exitCode=1;});
