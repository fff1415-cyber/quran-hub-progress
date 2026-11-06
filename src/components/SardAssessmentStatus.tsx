import { useEffect, useState } from "react";
import { assessmentEntries, resumeSardAssessment, archiveSardAssessment, SARD_ASSESSMENT_EVENT } from "@/lib/sard-assessments";
import { loadStudents } from "@/lib/mock-data";

export function SardAssessmentStatus() {
  const [, redraw] = useState(0), [error, setError] = useState("");
  useEffect(() => {
    const update = () => redraw(n => n + 1);
    const tick = () => { if (!document.hidden) for (const entry of assessmentEntries().filter(e => ["pending", "committed"].includes(e.status))) void resumeSardAssessment(entry.id).catch(() => undefined); };
    window.addEventListener(SARD_ASSESSMENT_EVENT, update); window.addEventListener("storage", update); window.addEventListener("online", tick); window.addEventListener("focus", tick); document.addEventListener("visibilitychange", tick);
    const timer = setInterval(tick, 15000); tick();
    return () => { clearInterval(timer); window.removeEventListener(SARD_ASSESSMENT_EVENT, update); window.removeEventListener("storage", update); window.removeEventListener("online", tick); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); };
  }, []);
  const rows = assessmentEntries().filter(e => !["verified", "archived"].includes(e.status)), students = loadStudents();
  if (!rows.length) return null;
  return <section dir="rtl" aria-live="polite" className="border-b p-3 text-sm bg-secondary/40"><p>نتائج اختبار محفوظة على هذا الجهاز تحتاج تأكيدًا.</p>{error && <p role="alert">{error}</p>}{rows.map(entry => {
    const history = JSON.parse(entry.body).value.history_record;
    return <details key={entry.id}><summary>{students.find(s => s.id === history.studentId)?.name ?? "طالب"} — {entry.receipt ? "أكد الخادم الحفظ؛ جارٍ تحديث القائمة" : "لم يتأكد الحفظ"}</summary><p>الأسبوع {history.week} · المحاولة {history.attempt} · النسبة {history.percent}%</p><p>{entry.message}</p>
      {entry.status === "conflict" ? <button className="underline" onClick={() => archiveSardAssessment(entry.id)}>أرشفة الطلب محليًا بعد مراجعة التعارض</button> : <button className="underline" onClick={() => { setError(""); void resumeSardAssessment(entry.id).catch(e => setError(e instanceof Error ? e.message : "تعذّر التأكيد")); }}>استعد النتيجة الأصلية وتحقق</button>}
    </details>;
  })}</section>;
}
