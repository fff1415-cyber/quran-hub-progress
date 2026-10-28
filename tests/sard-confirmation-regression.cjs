const assert=require('node:assert/strict');
const {load,deferred,hooks}=require('./independent-test-support.cjs');
(async()=>{
 const runtime=hooks();let gate=deferred(),changed=0,confirmed=0,settled=0;
 const mod=load('src/hooks/use-confirmed-sard-action.ts',{'react':runtime.react,'@/lib/mock-data':{flushSardQueue:()=>gate.promise}});
 const render=()=>runtime.render(()=>mod.useConfirmedSardAction(()=>settled++));
 let action=render();const write=action.run(()=>{changed++;},()=>confirmed++);
 assert.equal(render().saving,true);await action.run(()=>{changed++;},()=>confirmed++);assert.equal(changed,1);assert.equal(confirmed,0);
 gate.reject(Error('fixture conflict'));await write;assert.equal(confirmed,0);assert.equal(render().error,'fixture conflict');assert.equal(render().saving,false);
 gate=deferred();action=render();const retry=action.run(()=>{changed++;},()=>confirmed++);assert.equal(confirmed,0);gate.resolve();await retry;assert.equal(confirmed,1);assert.equal(render().error,undefined);assert.equal(settled,2);
 console.log('PASS: repeated click suppressed; server failure never confirms/notifies; retry confirms only after response');
})().catch(error=>{console.error(error);process.exitCode=1;});
