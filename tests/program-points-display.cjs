const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const cache=new Map(),memory=new Map();let workbook;
global.window=new EventTarget();global.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
function load(name){
 if(name==='xlsx')return{utils:{book_new:()=>({Sheets:{}}),aoa_to_sheet:v=>v,book_append_sheet:(book,sheet,name)=>book.Sheets[name]=sheet},writeFile:book=>workbook=book};
 if(name.endsWith('auth-session'))return{hasAuthToken:()=>false};
 if(name.endsWith('grade-sync'))return{gradeView:v=>v};
 if(name.endsWith('cloud-sync'))return{getToken:()=>null};
 if(name.endsWith('secure-data.functions'))return{};
 const file=path.resolve('src/lib',name.split('/').at(-1)+'.ts');if(cache.has(file))return cache.get(file);
 const out={};cache.set(file,out);new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(load,out);return out;
}
const science=load('scientific-grades'),programs=load('halaqa-programs'),totals=load('halaqa-program-combined-totals');
const config={visible:true,fields:{attendance:false,hifz:true,rabt:false,muraja:false},defaultScores:{hifz:'10'}};
assert.equal(science.scientificConfigMatches(config,{...config,defaultScores:{hifz:10}}),true);
assert.equal(science.scientificConfigMatches(config,{...config,defaultScores:{hifz:'11'}}),false);
assert.equal(science.scientificConfigMatches(config,{...config,fields:{...config.fields,hifz:false}}),false);
assert.equal(science.scientificConfigMatches(config,undefined),false);
const p={id:'P',name:'Fixture',active:true,scheduleMode:'weekdays',weekdays:['sun'],levels:[{label:'known',score:5},{label:'zero',score:0}]};
const grades={S:{1:{P:{sun:'old label'}},2:{P:{sun:'known'}}},Z:{1:{P:{sun:'zero'}}}};
const before=JSON.stringify(grades);
assert.equal(programs.studentAllProgramsWeekTotals([p],grades,'S',1).unresolvedSlots,1);
assert.equal(programs.studentAllProgramsPeriodTotals([p],grades,'S',[1,2]).unresolvedSlots,1);
assert.equal(programs.studentAllProgramsWeekTotals([p],grades,'S',2).earned,5);
assert.equal(programs.studentAllProgramsWeekTotals([p],grades,'Z',1).unresolvedSlots,undefined);
assert.equal(programs.studentAllProgramsWeekTotals([p],grades,'Z',1).earned,0);
const data={S:{1:{sun:{hifz:'10'},mon:{hifz:'99'},tue:{hifz:'10'},wed:{hifz:'88'}}}};
const calendar=load('academic-context').buildAcademicCalendar({id:'term',name:'Fixture',start_date:'2026-11-01',weeks_count:2,working_days:[0,1,2,3,4],excluded_dates:[{date:'2026-11-02'}]},[],new Date('2026-11-03T12:00:00'));
const days=totals.elapsedProgramDays(calendar,[1]);
assert.deepEqual(days,{1:['sun','tue']});
const screen=totals.buildCombinedProgramTotals([],{},'S',[1],data,['hifz'],days,config);
assert.equal(screen.earned,20);assert.equal(screen.maxPossible,20);assert.equal(screen.percent,100);
assert.equal(totals.buildCombinedProgramTotals([p],grades,'S',[1],data,['hifz'],days,config).hasPercent,false);
memory.set('qshatawi_halaqa_programs_v1',JSON.stringify({7:[]}));
memory.set('qshatawi_scientific_grades_v1',JSON.stringify({configs:{7:config},data:{7:data},overrides:{}}));
const exportPrograms=load('halaqa-programs-export');
exportPrograms.downloadHalaqaProgramsWorkbook([{id:'S',name:'Fixture'}],7,'Fixture',calendar,'2026-11-01','2026-11-03',{});
const row=workbook.Sheets['ملخص شامل'].at(-1);
assert.deepEqual(row.slice(-3),[20,20,100]);
assert.equal(workbook.Sheets['البرنامج العلمي'].at(-1).at(-1),100);
memory.set('qshatawi_halaqa_programs_v1',JSON.stringify({7:[p]}));
exportPrograms.downloadHalaqaProgramsWorkbook([{id:'S',name:'Fixture'}],7,'Fixture',calendar,'2026-11-01','2026-11-03',grades);
assert.equal(workbook.Sheets['ملخص شامل'].at(-1).at(-1),'غير مكتمل');
assert.ok(JSON.stringify(workbook.Sheets['تفاصيل أسبوعية']).includes('نقاط غير محددة'));
assert.equal(workbook.Sheets.Fixture.at(-1).at(-1),'غير مكتمل');
assert.equal(JSON.stringify(grades),before);
const support=require('./independent-test-support.cjs');
const {CustomFieldSelect}=support.load('src/components/plans/TeacherGradeInputs.tsx',{
 'react/jsx-runtime':support.jsx,'@/lib/mock-data':{},'@/contexts/GradeInputSettingsContext':{},'@/lib/grade-input-settings':{},'@/lib/utils':{},'lucide-react':{},
});
const select=CustomFieldSelect({value:'old label',options:['known'],onChange:()=>{throw Error('render must not edit');}});
const old=support.find(select,node=>node.type==='option'&&node.props.value==='old label');
assert.equal(old.length,1);assert.equal(old[0].props.disabled,true);
console.log('PASS program points: exact teacher settings, valid zero, preserved legacy labels, incomplete totals, calendar-correct screen/export, no grade writes');
(async()=>{
 let token='fixture-token',saved=config,mismatch=false,writes=0,reads=0;
 const deps=new Proxy({
  '@/lib/auth-session':{getToken:()=>token},
  './secure-data.functions':{
   secureListAppState:async()=>{reads++;return[{key:'scientific_grades',revision:'fixture-revision',value:{configs:{7:saved},data:{},overrides:{}}}];},
   secureSaveScientificConfig:async(_token,_revision,_halaqa,settings)=>{writes++;saved=mismatch?{...settings,defaultScores:{hifz:'99'}}:structuredClone(settings);return{ok:true};},
  },
  './scientific-grades':science,
 },{has:()=>true,get:(target,key)=>target[key]??{}});
 const cloud=support.load('src/lib/cloud-sync.ts',deps);
 await cloud.pushScientificConfig(7,config);assert.equal(writes,1);assert.equal(reads,2);
 mismatch=true;await assert.rejects(cloud.pushScientificConfig(7,config),/لم تتطابق نقاط المعلم/);
 assert.equal(writes,2,'an uncertain save is not replayed automatically');
 console.log('PASS teacher settings: acknowledged save is read back and compared; mismatched confirmation is rejected without blind retry');
})().catch(error=>{console.error(error);process.exitCode=1;});
