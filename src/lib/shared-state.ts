import { getToken,getAuthItem } from "@/lib/auth-session";
import { getActiveComplexId } from "@/lib/tenant";
import { secureListAppState, secureSetAppState, securePatchWeeklyTest, secureRecordPlanDay } from "@/lib/secure-data.functions";

export type SharedKey = "grades" | "weekly_tests" | "scientific_grades" | "academic_records" | "sard_history" | "sard_queue" | "grade_input_settings" | "grade_point_settings";
type Cell = { present: boolean; value?: unknown };
export type StateChange = { path: string[]; base: Cell; next: Cell };
export type PlanDayPayload = {student_id:string;expected_assignment_id:string;task_type:"hifz"|"rabt"|"muraja";tap:"half"|"one"|"two";operation_id:string;diary:{semester_id:string;week_number:number;day_key:string;date:string;field:"hifz"|"rabt"|"muraja"|"compensationFaces";base:unknown;value:unknown}};
type Pending = { queuedAt?:number; sard?:unknown; plan?: PlanDayPayload; key: SharedKey; context: string; protocol: 1; operation_id: string; semester_id: string | null; changes: StateChange[]; weekly?: {studentId:string;week:number;kind:"muraja"|"rabt";index:number;result:""|"pass"|"fail";base:""|"pass"|"fail"} };
let semester: string | null = null;
let semesterContext: string | null = null;
const EVENT = "qs-shared-save-state";
const semesterKeys = new Set<SharedKey>(["grades", "weekly_tests", "scientific_grades"]);
const listKeys = new Set<SharedKey>(["academic_records", "sard_history"]);
export const SHARED_SAVE_EVENT = EVENT;
let status: { state: "saved" | "saving" | "failed"; error?: string; conflict?:boolean; operationId?:string } = { state: "saved" };
export function sharedSaveStatus() { return status; }
function report(next: typeof status) { status = next; if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT)); }
export function setDataSemester(id: string | null) { const nextContext=context();if(semesterContext!==nextContext){semester=null;semesterContext=nextContext;} if (semester && semester !== id) { report({state:"failed",error:"تغيّر الفصل الدراسي — أعد تحميل الصفحة؛ التعديلات القديمة محفوظة للمراجعة"}); throw new Error("تغيّر الفصل الدراسي — أعد تحميل الصفحة"); } semester = id; }
export function getDataSemester() { return semester; }
function context() { return String(getActiveComplexId() ?? "current"); }
export function semesterStorageKey(key: string) { return `${key}:scope:${context()}:semester:${semester ?? "unverified"}`; }
function queueContext(){
  const get=(key:string)=>typeof getAuthItem==="function"?getAuthItem(key):null;
  const identity=[get("qs_role"),get("qs_account")??[get("qs_halaqa"),get("qs_name")].join(":")].join(":");
  let hash=2166136261;for(const char of identity)hash=Math.imul(hash^char.charCodeAt(0),16777619);
  return `${context()}:${hash>>>0}`;
}
const queueKey = () => `qs_shared_pending_v2:${queueContext()}`;
const opPrefix=()=>`${queueKey()}:op:`;
function pending(): Pending[] {
  const ops:Pending[]=[];const prefix=opPrefix();
  for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(prefix)){const raw=localStorage.getItem(key);if(raw)ops.push(JSON.parse(raw));}}
  return ops.sort((a,b)=>(a.queuedAt??0)-(b.queuedAt??0)||a.operation_id.localeCompare(b.operation_id));
}
let lastQueuedAt=0;
function appendPending(op:Pending){
  lastQueuedAt=Math.max(Date.now(),lastQueuedAt+1);op.queuedAt=lastQueuedAt;
  // One atomic key per operation: another tab cannot overwrite a read/modify/write queue blob.
  localStorage.setItem(`${opPrefix()}${op.operation_id}`,JSON.stringify(op));
}
function removePending(id:string){localStorage.removeItem(`${opPrefix()}${id}`);}
export function refreshPendingStatus(){if(pending().length){if(status.state==="saved")report({state:"saving"});}else if(status.state==="saving")report({state:"saved"});}
function normalized(key: SharedKey, value: unknown): Record<string, unknown> {
  if (listKeys.has(key)) return Object.fromEntries(((value ?? []) as { id: string }[]).map(item => [item.id, item]));
  return (value ?? {}) as Record<string, unknown>;
}
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** Capture the user's changed leaves at edit time, never diff a stale whole store after a pull. */
export function stateChanges(before: Record<string, unknown>, after: Record<string, unknown>, path: string[] = []): StateChange[] {
  const out: StateChange[] = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const b = Object.prototype.hasOwnProperty.call(before, key) && before[key] !== undefined;
    const n = Object.prototype.hasOwnProperty.call(after, key) && after[key] !== undefined;
    if (b && n && same(before[key], after[key])) continue;
    if ((!b || plain(before[key])) && n && plain(after[key])) out.push(...stateChanges(b ? before[key] as Record<string, unknown> : {}, after[key], [...path, key]));
    else if (b && plain(before[key]) && !n) out.push(...stateChanges(before[key], {}, [...path, key]));
    else out.push({ path: [...path, key], base: b ? { present: true, value: before[key] } : { present: false }, next: n ? { present: true, value: after[key] } : { present: false } });
  }
  return out;
}
export function captureSharedEdit(key: SharedKey, before: unknown, after: unknown): void {
  if (typeof window === "undefined" || !getToken() || sessionStorage.getItem("qs_syncing") === "1") return;
  const changes = stateChanges(normalized(key, before), normalized(key, after)).filter(change=>{
    if(key!=="grades")return true;
    if(change.path.at(-1)==="touchedAt")return false; // Day-wide UI metadata must not conflict with another field.
    const v=change.next.value;
    return change.base.present || !(v===""||v===false||v===0||v===null||(Array.isArray(v)&&v.length===0));
  });
  if (!changes.length) return;
  if (semesterKeys.has(key) && !semester) { report({ state: "failed", error: "لم يُحمّل الفصل الدراسي؛ التعديل مسودة محلية لم يؤكّد حفظها" }); return; }
  appendPending({ key, context:queueContext(), protocol: 1, operation_id: crypto.randomUUID(), semester_id: semesterKeys.has(key) ? semester : null, changes });
  report({ state: "saving" });
  void flushSharedEdits().catch(() => undefined);
}
let chain: Promise<void> = Promise.resolve();
export function queueWeeklyResult(weekly: NonNullable<Pending["weekly"]>): Promise<void> {
  if (!semester) return Promise.reject(new Error("لم يُحمّل الفصل الدراسي بعد"));
  appendPending({key:"weekly_tests",context:queueContext(),protocol:1,operation_id:crypto.randomUUID(),semester_id:semester,weekly,changes:[{path:[weekly.studentId,String(weekly.week),weekly.kind,String(weekly.index)],base:{present:true,value:weekly.base},next:{present:true,value:weekly.result}}]});
  return flushSharedEdits();
}
export function queuePlanDay(plan: Omit<PlanDayPayload,"operation_id">): Promise<void> {
  const existing=pending().find(op=>op.plan && op.plan.student_id===plan.student_id && op.plan.diary.week_number===plan.diary.week_number && op.plan.diary.day_key===plan.diary.day_key && op.plan.diary.field===plan.diary.field);
  if(existing) return Promise.reject(new Error("لهذه الخلية عملية معلقة؛ أعد محاولة الحفظ أولًا من حالة الحفظ"));
  const operation_id=crypto.randomUUID();
  appendPending({key:"grades",context:queueContext(),protocol:1,operation_id,semester_id:plan.diary.semester_id,changes:[],plan:{...plan,operation_id}});
  return flushSharedEdits();
}
export function queueSardPatch(sard:unknown):Promise<void>{
  const operation_id=crypto.randomUUID();appendPending({key:"sard_queue",context:queueContext(),protocol:1,operation_id,semester_id:null,changes:[],sard});return flushSharedEdits();
}
/** Only an explicit server rejection can be cancelled; unknown-response operations must be retried. */
export function cancelRejectedEdit():void{
  if(!status.conflict)throw new Error("يلزم تأكيد نتيجة الطلب قبل إلغائه");
  const rejected=pending().find(op=>op.operation_id===status.operationId);if(!rejected)return;
  localStorage.setItem(`${queueKey()}:rejected:${rejected.operation_id}`,JSON.stringify({...rejected,cancelledAt:new Date().toISOString(),reason:status.error}));
  removePending(rejected.operation_id);report({state:pending().length?"saving":"saved"});
}
export function flushSharedEdits(): Promise<void> {
  const run = async () => {
    const token = getToken(); if (!token) throw new Error("الجلسة غير متاحة؛ التعديلات المعلقة محفوظة محليًا");
    const scope = queueContext();
    while (scope === queueContext() && token === getToken()) {
      const op = pending()[0]; if (!op) { report({ state: "saved" }); return; }
      report({ state: "saving" });
      try {
        if(op.sard) await secureSetAppState({data:{token,key:"sard_queue",value:op.sard}});
        else if(op.plan) {
          const confirmed=await secureRecordPlanDay({token,payload:op.plan});
          if(scope===queueContext()&&semester===confirmed.semester_id) {
            const {saveGrades}=await import("./mock-data");saveGrades(reconcileShared("grades",confirmed.grades),{sync:false});
          }
        }
        else if(op.weekly) await securePatchWeeklyTest({data:{token,...op.weekly,semester_id:op.semester_id!,operation_id:op.operation_id}});
        else await secureSetAppState({ data: { token, key: op.key, value: op } });
        if (scope !== queueContext()) return;
        removePending(op.operation_id);
      } catch (e) { report({ state: "failed", error: e instanceof Error ? e.message : String(e), conflict:(e as {status?:number})?.status===409,operationId:op.operation_id }); throw e; }
    }
  };
  const next = chain.then(run, run); chain = next.catch(() => undefined); return next;
}
/** Incoming confirmed values plus still-pending local intent; no timestamp-based resurrection. */
export function reconcileShared<T>(key: SharedKey, cloud: T): T {
  const value = structuredClone(normalized(key, cloud));
  for (const op of pending().filter(x => x.key === key && (!semesterKeys.has(key) || x.semester_id === semester))) {
    for (const change of op.changes) {
      let ref = value; const path = change.path;
      for (const [i,p] of path.slice(0, -1).entries()) { if (!ref[p] || typeof ref[p] !== "object") ref[p] = /^\d+$/.test(path[i+1]!) && key === "weekly_tests" && i === 2 ? [] : {}; ref = ref[p] as Record<string, unknown>; }
      if (change.next.present) ref[path.at(-1)!] = structuredClone(change.next.value); else delete ref[path.at(-1)!];
    }
  }
  return (listKeys.has(key) ? Object.values(value) : value) as T;
}
export async function fetchSharedValue<T>(key: SharedKey): Promise<T> {
  const token = getToken(); if (!token) throw new Error("غير مسجل الدخول");
  const rows = await secureListAppState({ data: { token, key } }); const row = rows.find(r => r.key === key);
  if (semesterKeys.has(key) && row && row.integrity?.semester_id !== semester) throw new Error("تغيّر الفصل الدراسي — أعد تحميل الصفحة قبل المتابعة");
  return reconcileShared(key, (row?.value ?? (listKeys.has(key) ? [] : {})) as T);
}

let resumedToken:string|null=null,resumedContext:string|null=null;
export async function resumePendingEdits():Promise<void>{
  const token=getToken(),scope=queueContext();if(!token||(resumedToken===token&&resumedContext===scope))return;
  resumedToken=token;resumedContext=scope;
  if(pending().length){report({state:"saving"});await flushSharedEdits();}
}

/** Read-only historical source for reports/review; never changes the tab's write semester. */
export async function fetchStoredHistory<T>(key:"grades"|"weekly_tests"|"scientific_grades",source:{semesterId:string}|{legacy:true}):Promise<T>{
  const token=getToken();if(!token)throw new Error("غير مسجل الدخول");
  const rows=await secureListAppState({data:{token,key,...("semesterId" in source?{semester_id:source.semesterId}:{legacy:true})}});
  return (rows.find(row=>row.key===key)?.value??{}) as T;
}
