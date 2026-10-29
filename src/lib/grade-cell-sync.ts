import { getToken } from "@/lib/auth-session";
import { getActiveComplexId } from "@/lib/tenant";
import { secureListAppState, securePatchGradeCells } from "@/lib/secure-data.functions";
import type { GradesStore } from "@/lib/mock-data";

type Cell = {present: boolean; value?: unknown};
type Meta = {version: number; semester_id: string | null; versions: Record<string,string>};
type Change = {path: string[]; base: Cell; next: Cell; tokens: Record<string,string|null>};
type Operation = {protocol: "grade_cells_v1"; operation_id: string; semester_id: string | null; verified_context: boolean; changes: Change[]; queued_at: number};
type Status = {state: "idle"|"saving"|"saved"|"failed"; error?: string; rejected?: string};
export const GRADE_CELL_SAVE_EVENT="qs-grade-cell-save-state";
const CACHE="qshatawi_grades_v2";
const contexts=new Map<string,Meta>();
let status:Status={state:"idle"};let statusOwner="";
function owner(){
  const token=getToken()??"";let one=2166136261,two=2246822519;
  for(const char of token){one=Math.imul(one^char.charCodeAt(0),16777619);two=Math.imul(two^char.charCodeAt(0),3266489917);}
  return `${getActiveComplexId()??"unverified"}:${one>>>0}:${two>>>0}`;
}
const prefix=()=>`qs_grade_cells_v1:${owner()}:op:`;
function pending():Operation[]{const result:Operation[]=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(prefix())){const value=localStorage.getItem(key);if(value)result.push(JSON.parse(value));}}return result.sort((a,b)=>a.queued_at-b.queued_at||a.operation_id.localeCompare(b.operation_id));}
function report(next:Status){statusOwner=owner();status=next;if(typeof window!=="undefined")window.dispatchEvent(new Event(GRADE_CELL_SAVE_EVENT));}
export function gradeCellSaveStatus():Status{return statusOwner===owner()?status:{state:"idle"};}
const plain=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==="object"&&!Array.isArray(value);
const same=(left:unknown,right:unknown)=>JSON.stringify(left)===JSON.stringify(right);
function cell(value:unknown,path:string[]):Cell{let current=value;for(const part of path){if(!current||typeof current!=="object"||!Object.prototype.hasOwnProperty.call(current,part))return {present:false};current=(current as Record<string,unknown>)[part];}return {present:true,value:current};}
function changes(before:Record<string,unknown>,after:Record<string,unknown>,path:string[]=[]):Omit<Change,"tokens">[]{
  const result:Omit<Change,"tokens">[]=[];
  for(const key of new Set([...Object.keys(before),...Object.keys(after)])){
    if(key==="touchedAt"||key==="fieldTouchedAt")continue;
    const base=Object.prototype.hasOwnProperty.call(before,key)&&before[key]!==undefined,next=Object.prototype.hasOwnProperty.call(after,key)&&after[key]!==undefined;
    if(base&&next&&same(before[key],after[key]))continue;
    if((!base||plain(before[key]))&&next&&plain(after[key]))result.push(...changes(base?before[key] as Record<string,unknown>:{},after[key],[...path,key]));
    else if(base&&plain(before[key])&&!next)result.push(...changes(before[key],{},[...path,key]));
    else {
      const value=after[key];
      if(!base&&(value===""||value===false||value===0||value===null||(Array.isArray(value)&&!value.length)))continue;
      result.push({path:[...path,key],base:base?{present:true,value:before[key]}:{present:false},next:next?{present:true,value}:{present:false}});
    }
  }return result;
}
function tokens(versions:Record<string,string>,path:string[]){const result:Record<string,string|null>={};for(let i=1;i<=path.length;i++){const key="d:"+JSON.stringify(path.slice(0,i));result[key]=versions[key]??null;}const key="a:"+JSON.stringify(path);result[key]=versions[key]??null;return result;}
function mark(versions:Record<string,string>,path:string[],id:string){versions["d:"+JSON.stringify(path)]=id;for(let i=1;i<=path.length;i++)versions["a:"+JSON.stringify(path.slice(0,i))]=id;}
function put(value:Record<string,unknown>,change:Change){let ref=value;for(const key of change.path.slice(0,-1)){if(!plain(ref[key]))ref[key]={};ref=ref[key] as Record<string,unknown>;}const key=change.path.at(-1)!;if(change.next.present)ref[key]=structuredClone(change.next.value);else delete ref[key];}
function overlay(value:GradesStore){const result=structuredClone(value) as unknown as Record<string,unknown>;for(const op of pending())for(const change of op.changes)put(result,change);return result as unknown as GradesStore;}
let lastQueuedAt=0;
export function captureGradeCellEdit(before:GradesStore,after:GradesStore):void{
  if(typeof window==="undefined"||!getToken()||sessionStorage.getItem("qs_syncing")==="1")return;
  const delta=changes(before as unknown as Record<string,unknown>,after as unknown as Record<string,unknown>);if(!delta.length)return;
  const context=contexts.get(owner()),operation_id=crypto.randomUUID();
  const op:Operation={protocol:"grade_cells_v1",operation_id,semester_id:context?.semester_id??null,verified_context:!!context,queued_at:Math.max(Date.now(),lastQueuedAt+1),changes:delta.map(change=>({...structuredClone(change),tokens:tokens(context?.versions??{},change.path)}))};
  lastQueuedAt=op.queued_at;localStorage.setItem(prefix()+operation_id,JSON.stringify(op));
  if(context)for(const change of op.changes)mark(context.versions,change.path,operation_id);
  report({state:"saving"});void flushGradeCellEdits().catch(()=>undefined);
}
export function acceptGradeCellSnapshot(value:GradesStore,meta:unknown,cid:unknown):GradesStore{
  if(Array.isArray(value)){if(value.length)throw new Error("مخزن الدرجات يحتاج مراجعة؛ لم تُغيّر البيانات");value={};}
  if(cid!==getActiveComplexId()||!plain(meta)||meta.version!==1||!(meta.semester_id===null||typeof meta.semester_id==="string")||!plain(meta.versions))throw new Error("لم يؤكد الخادم سياق حفظ الدرجات؛ حدّث الصفحة");
  const previous=contexts.get(owner());if(previous&&previous.semester_id!==meta.semester_id){report({state:"failed",error:"تغيّر الفصل الدراسي؛ أعد فتح الصفحة قبل تعديل الدرجات"});throw new Error("تغيّر الفصل الدراسي؛ أعد فتح الصفحة قبل تعديل الدرجات");}
  const context:Meta={version:1,semester_id:meta.semester_id as string|null,versions:structuredClone(meta.versions) as Record<string,string>};contexts.set(owner(),context);
  for(const op of pending())for(const change of op.changes)mark(context.versions,change.path,op.operation_id);
  const backup=CACHE+":before-cell-sync";if(localStorage.getItem(backup)===null){const original=localStorage.getItem(CACHE);if(original!==null)localStorage.setItem(backup,original);}
  return overlay(value);
}
async function apply(value:GradesStore,meta:unknown,cid:unknown,scope:string,token:string){
  if(owner()!==scope||getToken()!==token)return;
  const {saveGrades}=await import("./mock-data");if(owner()!==scope||getToken()!==token)return;
  saveGrades(acceptGradeCellSnapshot(value,meta,cid),{sync:false});
}
export async function readGradeCellSnapshot():Promise<GradesStore>{
  const token=getToken();if(!token)throw new Error("غير مسجل الدخول");const scope=owner();
  const rows=await secureListAppState({data:{token,key:"grades"}});if(scope!==owner()||token!==getToken())throw new Error("تغيّرت جلسة البيانات؛ أعد فتح الصفحة");
  const row=rows.find(value=>value.key==="grades");if(!row||!row.value||typeof row.value!=="object"||(Array.isArray(row.value)&&row.value.length))throw new Error("تعذّر تأكيد مخزن الدرجات من الخادم");
  const value=acceptGradeCellSnapshot((Array.isArray(row.value)?{}:row.value) as GradesStore,row.cell_sync,row.context_complex_id);
  if(pending().length)void flushGradeCellEdits().catch(()=>undefined);
  return value;
}
let chain:Promise<unknown>=Promise.resolve();
export function flushGradeCellEdits():Promise<GradesStore>{
  const run=async()=>{
    const token=getToken();if(!token)throw new Error("الجلسة غير متاحة؛ المسودة محفوظة على الجهاز");const scope=owner();
    while(scope===owner()&&token===getToken()){
      const op=pending()[0];if(!op){if(gradeCellSaveStatus().state!=="idle")report({state:"saved"});return JSON.parse(localStorage.getItem(CACHE)??"{}");}
      report({state:"saving"});
      try{
        if(!op.verified_context)throw Object.assign(new Error("لم تُؤكد بيانات الفصل عند التعديل؛ احفظ نسخة المسودة وحدّث القيم ثم أعد التعديل"),{status:409});
        const result=await securePatchGradeCells({token,value:op});
        if(scope!==owner()||token!==getToken())return JSON.parse(localStorage.getItem(CACHE)??"{}");
        if(!result.ok||!result.value||result.context_complex_id!==getActiveComplexId()||!result.cell_sync)throw new Error("لم يؤكد الخادم حفظ الدرجة؛ أعد المحاولة بنفس المسودة");
        const confirmed=result.cell_sync as Meta;
        if(!plain(confirmed.versions)||op.changes.some(change=>confirmed.versions["d:"+JSON.stringify(change.path)]!==op.operation_id||!same(cell(result.value,change.path),change.next)))throw new Error("لم يطابق تأكيد الخادم تعديل الدرجة؛ المسودة محفوظة لإعادة المحاولة");
        acceptGradeCellSnapshot(result.value as GradesStore,result.cell_sync,result.context_complex_id);
        localStorage.removeItem(prefix()+op.operation_id);
        await apply(result.value as GradesStore,result.cell_sync,result.context_complex_id,scope,token);
      }catch(error){report({state:"failed",error:error instanceof Error?error.message:String(error),rejected:(error as {status?:number})?.status===409?op.operation_id:undefined});throw error;}
    }return JSON.parse(localStorage.getItem(CACHE)??"{}");
  };
  const result=chain.then(run,run);chain=result.catch(()=>undefined);return result;
}
/** Keep a rejected draft in an archive; never discard an unknown-response operation. */
export async function archiveRejectedGradeDraft():Promise<void>{
  const scope=owner(),token=getToken();
  const id=gradeCellSaveStatus().rejected;if(!id)throw new Error("أعد محاولة تأكيد الحفظ أولًا");
  const key=prefix()+id,raw=localStorage.getItem(key);if(raw)localStorage.setItem(key.replace(":op:",":rejected:")+":"+Date.now(),raw);
  localStorage.removeItem(key);const value=await readGradeCellSnapshot();const {saveGrades}=await import("./mock-data");if(scope!==owner()||token!==getToken())return;saveGrades(value,{sync:false});
  report({state:pending().length?"saving":"saved"});if(pending().length)await flushGradeCellEdits();
}
