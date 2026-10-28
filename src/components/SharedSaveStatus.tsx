import { useEffect,useState } from "react";
import { SHARED_SAVE_EVENT,sharedSaveStatus,flushSharedEdits,cancelRejectedEdit,resumePendingEdits,refreshPendingStatus } from "@/lib/shared-state";
import { refreshSharedCaches,CLOCK_TICK_EVENT,LEGACY_REVIEW_EVENT } from "@/lib/shared-refresh";
import { getToken } from "@/lib/auth-session";

export function SharedSaveStatus(){
  const [state,setState]=useState(sharedSaveStatus);
  const [pullError,setPullError]=useState<string>();
  const [legacy,setLegacy]=useState(false);
  useEffect(()=>{
    const onLegacy=(event:Event)=>setLegacy(!!(event as CustomEvent<boolean>).detail);window.addEventListener(LEGACY_REVIEW_EVENT,onLegacy);
    const update=()=>setState({...sharedSaveStatus()});window.addEventListener(SHARED_SAVE_EVENT,update);
    const onStorage=(event:StorageEvent)=>{if(event.key?.startsWith("qs_shared_pending_v2:"))refreshPendingStatus();};window.addEventListener("storage",onStorage);
    const pull=()=>{if(!getToken())return;void refreshSharedCaches().then(()=>resumePendingEdits()).then(()=>setPullError(undefined)).catch(e=>setPullError(e instanceof Error?e.message:String(e)));};
    const timer=setInterval(()=>{window.dispatchEvent(new Event(CLOCK_TICK_EVENT));if(!document.hidden)pull();},15000);
    window.addEventListener("focus",pull);pull();
    return ()=>{window.removeEventListener(LEGACY_REVIEW_EVENT,onLegacy);window.removeEventListener("storage",onStorage);clearInterval(timer);window.removeEventListener("focus",pull);window.removeEventListener(SHARED_SAVE_EVENT,update);};
  },[]);
  if(!getToken()||(state.state==="saved"&&!pullError&&!legacy))return null;
  return <aside role="status" className="fixed bottom-3 left-3 z-50 max-w-sm rounded-lg border bg-background p-3 text-xs shadow-lg" dir="rtl">
    {legacy&&<p>توجد سجلات قديمة بلا فصل موثوق؛ بقيت محفوظة للمراجعة ولم تُنسب إلى الفصل الحالي.</p>}
    {state.state==="saving"?"جارٍ تأكيد الحفظ المشترك…":state.error??pullError}
    {state.conflict&&<button className="mr-3 underline" onClick={()=>{cancelRejectedEdit();void refreshSharedCaches().catch(e=>setPullError(String(e)));}}>إلغاء التعديل المرفوض وإظهار المحفوظ</button>}
    {(state.state==="failed"||pullError)&&<button className="mr-3 underline" onClick={()=>void flushSharedEdits().then(()=>refreshSharedCaches()).then(()=>setPullError(undefined)).catch(e=>setPullError(e instanceof Error?e.message:String(e)))}>إعادة المحاولة</button>}
  </aside>;
}
