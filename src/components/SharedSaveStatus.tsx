import { useEffect,useState } from "react";
import { SHARED_SAVE_EVENT,sharedSaveStatus,flushSharedEdits,cancelRejectedEdit } from "@/lib/shared-state";
import { refreshSharedCaches,CLOCK_TICK_EVENT } from "@/lib/shared-refresh";
import { getToken } from "@/lib/auth-session";

export function SharedSaveStatus(){
  const [state,setState]=useState(sharedSaveStatus);
  const [pullError,setPullError]=useState<string>();
  useEffect(()=>{
    const update=()=>setState({...sharedSaveStatus()});window.addEventListener(SHARED_SAVE_EVENT,update);
    const pull=()=>{if(!getToken())return;void refreshSharedCaches().then(()=>setPullError(undefined)).catch(e=>setPullError(e instanceof Error?e.message:String(e)));};
    const timer=setInterval(()=>{window.dispatchEvent(new Event(CLOCK_TICK_EVENT));if(!document.hidden)pull();},15000);
    window.addEventListener("focus",pull);pull();
    return ()=>{clearInterval(timer);window.removeEventListener("focus",pull);window.removeEventListener(SHARED_SAVE_EVENT,update);};
  },[]);
  if(!getToken()||(state.state==="saved"&&!pullError))return null;
  return <aside role="status" className="fixed bottom-3 left-3 z-50 max-w-sm rounded-lg border bg-background p-3 text-xs shadow-lg" dir="rtl">
    {state.state==="saving"?"جارٍ تأكيد الحفظ المشترك…":state.error??pullError}
    {state.conflict&&<button className="mr-3 underline" onClick={()=>{cancelRejectedEdit();void refreshSharedCaches().catch(e=>setPullError(String(e)));}}>إلغاء التعديل المرفوض وإظهار المحفوظ</button>}
    {(state.state==="failed"||pullError)&&<button className="mr-3 underline" onClick={()=>void flushSharedEdits().then(()=>refreshSharedCaches()).then(()=>setPullError(undefined)).catch(e=>setPullError(e instanceof Error?e.message:String(e)))}>إعادة المحاولة</button>}
  </aside>;
}
