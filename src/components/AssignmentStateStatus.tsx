import { useEffect, useState } from "react";
import { assignmentStateEntries, resumeAssignmentState, archiveAssignmentState, ASSIGNMENT_STATE_EVENT } from "@/lib/assignment-state";
import { loadStudents } from "@/lib/mock-data";

export function AssignmentStateStatus() {
  const [, redraw] = useState(0), [error, setError] = useState("");
  useEffect(() => {
    const update = () => redraw(n => n + 1);
    const tick = () => { if (!document.hidden) for (const entry of assignmentStateEntries().filter(e => ["pending", "committed"].includes(e.status))) void resumeAssignmentState(entry.id).catch(() => undefined); };
    window.addEventListener(ASSIGNMENT_STATE_EVENT, update); window.addEventListener("storage", update); window.addEventListener("online", tick); window.addEventListener("focus", tick); document.addEventListener("visibilitychange", tick);
    const timer = setInterval(tick, 15000); tick();
    return () => { clearInterval(timer); window.removeEventListener(ASSIGNMENT_STATE_EVENT, update); window.removeEventListener("storage", update); window.removeEventListener("online", tick); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); };
  }, []);
  const rows = assignmentStateEntries().filter(e => !["verified", "archived"].includes(e.status)), students = loadStudents();
  if (!rows.length) return null;
  return <section className="border-b p-3 text-sm bg-secondary/40" dir="rtl" aria-live="polite"><p>طلبات تغيير حالة خطة محفوظة تحتاج تأكيدًا.</p>{error && <p role="alert">{error}</p>}{rows.map(entry => {
    const input = JSON.parse(entry.body);
    return <details key={entry.id}><summary>{students.find(s => s.id === input.student_id)?.name ?? "طالب"} — {input.status === "frozen" ? "تجميد" : input.status === "active" ? "استئناف" : "إغلاق التعيين"}</summary><p>{entry.receipt ? "أكد الخادم الطلب؛ يلزم التحقق من الحالة الحالية" : "لم يتأكد الحفظ"}</p><p>{entry.message}</p>
      {entry.status === "conflict" ? <button className="underline" onClick={() => archiveAssignmentState(entry.id)}>أرشفة الطلب محليًا بعد مراجعة التعارض</button> : <button className="underline" onClick={() => { setError(""); void resumeAssignmentState(entry.id).catch(e => setError(e instanceof Error ? e.message : "تعذّر التحقق")); }}>استعد الطلب الأصلي وتحقق</button>}
    </details>;
  })}</section>;
}
