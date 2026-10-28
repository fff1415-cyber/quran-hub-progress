const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const js=ts.transpileModule(fs.readFileSync('src/components/plans/PlanAwareTaskCell.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const exports_={};new Function('require','exports',js)(n=>({
 'react/jsx-runtime':{jsx:(type,props)=>({type,props})},
 '@/lib/mock-data':{isHifzChecked:v=>['half','one','two'].includes(v)},
 '@/components/plans/TeacherGradeInputs':{HifzTaskInput:'H',PassFail:'P'}
})[n],exports_);
let hifz,pass,ordinary=0;
const props={student:{levelType:'gold'},hasPlan:true,hifzValue:'one',passFailValue:'pass',onHifzChange:()=>ordinary++,onPassFailChange:()=>ordinary++,onPlanHifzChange:(checked,value)=>hifz={checked,value},onPlanPassFailChange:v=>pass=v};
exports_.PlanAwareTaskCell({...props,task:'hifz'}).props.onChange('two');assert.deepEqual(hifz,{checked:true,value:'two'});
exports_.PlanAwareTaskCell({...props,task:'hifz'}).props.onChange('');assert.deepEqual(hifz,{checked:false,value:''});
exports_.PlanAwareTaskCell({...props,task:'rabt'}).props.onChange('fail');assert.equal(pass,'fail');
exports_.PlanAwareTaskCell({...props,task:'muraja'}).props.onChange('');assert.equal(pass,'');assert.equal(ordinary,0);
exports_.PlanAwareTaskCell({...props,task:'rabt',hasPlan:false}).props.onChange('pass');assert.equal(ordinary,1);
console.log('PASS: UI forwards actual hifz quantity and every pass/fail/clear through paired recording; unlinked input still works');
