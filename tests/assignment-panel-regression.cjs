const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {load,hooks,jsx,find,text,deferred,flush}=require('./independent-test-support.cjs');
const runtime=hooks(),deps={'react':runtime.react,'react/jsx-runtime':jsx};
const source=fs.readFileSync('src/components/plans/SupervisorPlansPanel.tsx','utf8');
const sf=ts.createSourceFile('panel.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
for(const statement of sf.statements.filter(ts.isImportDeclaration)){const path=statement.moduleSpecifier.text;if(deps[path])continue;deps[path]={};for(const item of statement.importClause?.namedBindings?.elements??[])deps[path][item.propertyName?.text??item.name.text]=()=>null;}
let sheetGate=deferred(),patchGate=deferred(),patches=[],toasts=[];
Object.assign(deps['@/lib/mock-data'],{loadStudents:()=>[{id:'S',name:'fixture student',levelType:'gold'}]});
Object.assign(deps['@/lib/cloud-sync'],{syncFromCloud:async()=>{}});
Object.assign(deps['@/lib/plans-service'],{fetchPlans:async()=>[],fetchStudentPlanSheet:()=>sheetGate.promise,patchStudentAssignment:async(...args)=>{patches.push(args);await patchGate.promise;}});
Object.assign(deps['@/lib/operational-date'],{getCalendarIsoDate:()=> '2026-10-29'});
Object.assign(deps['@/lib/session-role'],{getSessionName:()=> 'fixture'});
deps['@/components/ui/button'].Button='button';deps['@/components/ui/input'].Input='input';
deps['sonner'].toast={error:m=>toasts.push(['error',m]),success:m=>toasts.push(['success',m])};
const panel=load('src/components/plans/SupervisorPlansPanel.tsx',deps),render=()=>runtime.render(panel.SupervisorPlansPanel);
(async()=>{
let tree=render();runtime.effects();await flush();tree=render();
find(tree,n=>n.type==='input'&&n.props.placeholder==='ابحث باسم الطالب...')[0].props.onChange({target:{value:'fixture'}});
tree=render();find(tree,n=>n.type==='button'&&text(n).includes('fixture student'))[0].props.onClick();
tree=render();runtime.effects();assert.equal(find(tree,n=>n.props?.title==='تجميد الخطة')[0].props.disabled,true);
sheetGate.resolve({assignment:{id:'A',status:'active'},plan:{title:'old fixture'},segments:[],completions:[]});await flush();tree=render();
const button=find(tree,n=>n.props?.title==='تجميد الخطة')[0];assert.equal(button.props.disabled,false);
button.props.onClick();button.props.onClick();assert.deepEqual(patches,[['S','frozen','A']]);assert.equal(toasts.length,0);assert.equal(find(render(),n=>n.props?.title==='تجميد الخطة')[0].props.disabled,true);
patchGate.reject(Error('fixture stale assignment'));await flush();assert.deepEqual(toasts,[['error','fixture stale assignment']]);
sheetGate=deferred();tree=render();runtime.effects();sheetGate.resolve({assignment:{id:'B',status:'active'},plan:{title:'new fixture'},segments:[],completions:[]});await flush();
patchGate=deferred();tree=render();find(tree,n=>n.props?.title==='تجميد الخطة')[0].props.onClick();assert.deepEqual(patches[1],['S','frozen','B']);patchGate.resolve();await flush();assert.ok(toasts.some(x=>x[0]==='success'));runtime.cleanup();
console.log('PASS: actual supervisor buttons wait for the displayed assignment, suppress repeat clicks, show real failure and retry the refreshed identity');
})().catch(error=>{console.error(error);process.exitCode=1;});
