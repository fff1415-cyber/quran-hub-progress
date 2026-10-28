import { getActiveComplexId } from "@/lib/tenant";
import { captureSharedEdit,flushSharedEdits } from "@/lib/shared-state";
export const GRADE_POLICY_EVENT="qs-grade-point-draft-changed";
const key=()=>`qs_grade_point_draft:complex:${getActiveComplexId()??"none"}`;
export function loadGradePointDraft():{values?:Record<string,number>;version?:string;status?:string}{
  if(typeof window==="undefined")return {};return JSON.parse(localStorage.getItem(key())??"{}");
}
export function replaceGradePointDraft(value:unknown){localStorage.setItem(key(),JSON.stringify(value??{}));window.dispatchEvent(new Event(GRADE_POLICY_EVENT));}
export async function saveGradePointDraft(values:Record<string,number>){
  for(const n of Object.values(values))if(!Number.isFinite(n)||n<0)throw new Error("قيم الدرجات يجب أن تكون أرقامًا غير سالبة");
  const before=loadGradePointDraft();const next={values,version:crypto.randomUUID(),status:"awaiting_effective_date_and_scoring_policy"};
  replaceGradePointDraft(next);captureSharedEdit("grade_point_settings",before,next);await flushSharedEdits();return next;
}
/** Prepared denominator policies. Deliberately not activated until the workday/holiday decision. */
export function previewWeekDenominator(days:{iso:string;isWorking:boolean}[],today:string,policy:"scheduled_working_days"|"elapsed_working_days",dailyMax:number):number{
  if(!Number.isFinite(dailyMax)||dailyMax<0)throw new Error("درجة اليوم القصوى غير صالحة");
  return days.filter(d=>d.isWorking&&(policy==="scheduled_working_days"||d.iso<=today)).length*dailyMax;
}
