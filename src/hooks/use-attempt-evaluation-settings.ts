import { useEffect, useState } from "react";
import { useEvaluationSettings } from "@/contexts/EvaluationSettingsContext";
import { loadSardQueue, updateSardItem, flushSardQueue, type SardQueueItem } from "@/lib/mock-data";
import type { EvaluationRulesSnapshot } from "@/lib/evaluation-types";

export function useAttemptEvaluationSettings(item: SardQueueItem) {
  const current=useEvaluationSettings();
  const [rules,setRules]=useState<EvaluationRulesSnapshot | undefined>();
  const [error,setError]=useState<string>();
  useEffect(()=>{
    let cancelled=false;
    const existing=loadSardQueue().find(q=>q.id===item.id)?.evaluationRules ?? item.evaluationRules;
    if(existing){void flushSardQueue().then(()=>{if(!cancelled)setRules(existing);}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:String(e));});return ()=>{cancelled=true;};}
    if(item.phase==="review_only"||item.lockedHifzScore!==undefined){setError("هذه مراجعة قديمة بلا مرجع لقواعد الحفظ المثبت؛ يلزم اعتماد القواعد الأصلية من مصدر موثوق قبل الحساب");return;}
    if(!current.verified)return;
    const snapshot={reference:crypto.randomUUID(),adoptedAt:new Date().toISOString(),settings:structuredClone(current.settings)};
    updateSardItem(item.id,{evaluationRules:snapshot});
    void flushSardQueue().then(()=>{if(!cancelled){setRules(snapshot);setError(undefined);}}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:String(e));});
    return ()=>{cancelled=true;};
  },[item.id,item.attempt,item.evaluationRules,current.verified,current.settings]);
  return {settings:rules?.settings ?? current.settings,rules,ready:!!rules,error:error??current.error};
}
