const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {load,storage,deferred,flush}=require('./independent-test-support.cjs');
global.window=new EventTarget();global.localStorage=storage();global.sessionStorage=storage();
const sci=load('src/lib/scientific-grades.ts',{'@/lib/auth-session':{hasAuthToken:()=>false},'@/lib/grade-input-settings':{},'@/lib/scientific-grades-program':{}});
const path='src/lib/cloud-sync.ts',key='qshatawi_scientific_grades_v1';
const initial={configs:{1:{visible:true,fields:{hifz:true},defaultScores:{hifz:'10'}}},data:{1:{S:{1:{sun:{hifz:'7',unknown:null}},9:{sun:{hifz:'8'}}},T:{1:{sun:{hifz:'6'}}}}},overrides:{1:{S:{1:{sun:{hifz:true}}}}}};
const clone=x=>JSON.parse(JSON.stringify(x)),raw=()=>localStorage.getItem(key),read=()=>JSON.parse(raw());
function changed(value){const v=clone(initial);v.data[1].S[1].sun.hifz=value;return v;}
function client(source){
 const transport={get:async()=>[],set:async()=>({ok:true})};
 const deps=new Proxy({'./scientific-grades':sci,'./secure-data.functions':{secureListAppState:x=>transport.get(x),secureSetAppState:x=>transport.set(x)},'@/lib/auth-session':{getToken:()=> 'fixture-token',hasAuthToken:()=>true},'@/lib/tenant':{getActiveComplexId:()=>1}}, {has:()=>true,get:(target,k)=>target[k]??{}});
 return {service:load(path,deps,source),transport};
}
const source=fs.readFileSync(process.argv[2]||path,'utf8');
const base=cp.execFileSync('git',['show','1bb0b54c4084877ab58d246fac57ed539f6fb607:'+path],{encoding:'utf8'});
async function delayed(c,value,expectProtected){
 localStorage.setItem(key,JSON.stringify(initial));const entered=deferred(),release=deferred();let sent;
 c.transport.get=async()=>[{key:'scientific_grades',value:{configs:{},data:{},overrides:{}}}];
 c.transport.set=async({data})=>{sent=clone(data);entered.resolve();await release.promise;return {ok:true};};
 const task=c.service.pushMergedScientificGrades(clone(initial));await entered.promise;
 const newer=changed(value);newer.data[1].S[1].sun.localNote='still being edited';
 sci.saveScientificGradesStore(newer);const before=raw();let events=0;const listener=()=>events++;window.addEventListener(sci.SCIENTIFIC_GRADES_CHANGED_EVENT,listener);
 release.resolve();await task;window.removeEventListener(sci.SCIENTIFIC_GRADES_CHANGED_EVENT,listener);
 assert.equal(sent.key,'scientific_grades');assert.equal(sent.value.data[1].S[1].sun.hifz,'7','ACK cannot pretend the later draft was part of the old request');
 if(expectProtected){assert.equal(raw(),before,'late ACK must preserve every byte of newer local work');assert.equal(events,0,'no misleading local change event or echo push from stale ACK');}
 else assert.equal(read().data[1].S[1].sun.hifz,'7','negative control: old confirmation overwrites the later local score/clear');
 return newer;
}
(async()=>{
 await delayed(client(base),'0',false);
 const c=client(source);
 for(const value of ['0','','9'])await delayed(c,value,true);
 // Two queued saves: the older ACK cannot replace the newer queued draft, and the newer request still runs.
 localStorage.setItem(key,JSON.stringify(initial));const first=deferred(),firstRelease=deferred(),second=deferred(),secondRelease=deferred();let posts=0,remote={configs:{},data:{},overrides:{}};
 c.transport.get=async()=>[{key:'scientific_grades',value:clone(remote)}];
 c.transport.set=async({data})=>{posts++;const payload=clone(data.value);if(posts===1){first.resolve();await firstRelease.promise;}else{second.resolve();await secondRelease.promise;}remote=payload;return {ok:true};};
 const one=c.service.pushMergedScientificGrades(clone(initial));await first.promise;const newer=changed('0');sci.saveScientificGradesStore(newer);const two=c.service.pushMergedScientificGrades(clone(newer));firstRelease.resolve();await one;assert.deepEqual(read(),newer);await second.promise;assert.deepEqual(read(),newer);secondRelease.resolve();await two;
 assert.equal(posts,2);assert.equal(remote.data[1].S[1].sun.hifz,'0');assert.equal(read().data[1].S[1].sun.hifz,'0');assert.equal(read().overrides[1].S[1].sun.hifz,true);assert.equal(read().data[1].S[9].sun.hifz,'8');assert.equal(read().data[1].T[1].sun.hifz,'6');
 // A failed older upload preserves newer local edits, then permits the existing queued retry path.
 const entered=deferred(),release=deferred();c.transport.get=async()=>[];c.transport.set=async()=>{entered.resolve();await release.promise;throw Error('fixture lost response');};
 localStorage.setItem(key,JSON.stringify(initial));const failure=c.service.pushMergedScientificGrades(clone(initial));await entered.promise;sci.saveScientificGradesStore(changed(''));const cleared=raw();release.resolve();await assert.rejects(failure,/fixture lost response/);assert.equal(raw(),cleared);
 c.transport.set=async()=>({ok:true});await c.service.pushMergedScientificGrades(read());assert.equal(read().data[1].S[1].sun.hifz,'');assert.equal(read().overrides[1].S[1].sun.hifz,true);
 // Capture the submitted object before caller mutation/queue scheduling.
 const payload=clone(initial);localStorage.setItem(key,JSON.stringify(payload));let captured;c.transport.set=async({data})=>{captured=clone(data.value);return {ok:true};};const immutable=c.service.pushMergedScientificGrades(payload);payload.data[1].S[1].sun.hifz='9';await immutable;assert.equal(captured.data[1].S[1].sun.hifz,'7');
 // A newer draft that already exists before this queued callback starts is also retained.
 localStorage.setItem(key,JSON.stringify(changed('0')));const existing=raw();await c.service.pushMergedScientificGrades(clone(initial));assert.equal(raw(),existing);
 // A settled unchanged draft still accepts remote fields and uses the original merge policy.
 localStorage.setItem(key,JSON.stringify(initial));const cloud={configs:{},data:{2:{U:{4:{mon:{hifz:'0'}}}}},overrides:{}};c.transport.get=async()=>[{key:'scientific_grades',value:cloud}];let confirmed;c.transport.set=async({data})=>{confirmed=clone(data.value);return {ok:true};};sessionStorage.setItem('qs_syncing','prior-marker');await c.service.pushMergedScientificGrades(clone(initial));assert.deepEqual(read(),confirmed);assert.equal(read().data[2].U[4].mon.hifz,'0');assert.equal(sessionStorage.getItem('qs_syncing'),'prior-marker');
 // Local storage failure after a successful server ACK remains explicit and restores the sync flag.
 localStorage.setItem(key,JSON.stringify(initial));const preserved=raw(),set=localStorage.setItem;localStorage.setItem=()=>{throw Error('fixture quota');};try{await assert.rejects(c.service.pushMergedScientificGrades(clone(initial)),/fixture quota/);}finally{localStorage.setItem=set;}assert.equal(raw(),preserved);assert.equal(sessionStorage.getItem('qs_syncing'),'prior-marker');
 console.log('PASS: actual scientific upload preserves later zeros, clears/manual masks and unrelated work; queued retry/immutable snapshot/current ACK/quota behavior verified; old source clobber reproduced only in fixture');
})().catch(error=>{console.error(error);process.exitCode=1;});
