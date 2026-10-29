import { useEffect, useState } from "react";
import { GRADE_CELL_SAVE_EVENT, archiveRejectedGradeDraft, flushGradeCellEdits, gradeCellSaveStatus } from "@/lib/grade-cell-sync";

export function GradeCellSaveStatus() {
  const [status,setStatus]=useState(gradeCellSaveStatus);
  const [busy,setBusy]=useState(false);
  useEffect(()=>{const update=()=>setStatus(gradeCellSaveStatus());window.addEventListener(GRADE_CELL_SAVE_EVENT,update);return()=>window.removeEventListener(GRADE_CELL_SAVE_EVENT,update);},[]);
  if(status.state==="idle")return null;
  const run=async(action:()=>Promise<unknown>)=>{if(busy)return;setBusy(true);try{await action();}catch{}finally{setBusy(false);setStatus(gradeCellSaveStatus());}};
  return <div role={status.state==="failed"?"alert":"status"} className="rounded-lg border border-border p-2 text-sm flex flex-wrap items-center gap-2">
    <span>{status.state==="saving"?"جارٍ تأكيد حفظ الدرجات...":status.state==="saved"?"تأكد حفظ الدرجات على الخادم":status.error??"لم يتأكد الحفظ؛ المسودة محفوظة على الجهاز"}</span>
    {status.state==="failed"&&<button type="button" disabled={busy} className="underline" onClick={()=>void run(flushGradeCellEdits)}>إعادة المحاولة</button>}
    {status.rejected&&<button type="button" disabled={busy} className="underline" onClick={()=>void run(archiveRejectedGradeDraft)}>حفظ نسخة المسودة وتحديث القيم</button>}
  </div>;
}
