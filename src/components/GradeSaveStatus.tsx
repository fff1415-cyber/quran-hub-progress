import { useEffect, useState } from "react";
import { currentGradeOutbox, flushConfirmedGrades, refreshConfirmedGrades, GRADE_SAVE_EVENT, gradeLocalSaveError } from "@/lib/grade-sync";
import { loadStudents } from "@/lib/mock-data";

export function GradeSaveStatus() {
  const [, redraw] = useState(0), [error, setError] = useState("");
  useEffect(() => {
    const update = () => redraw(n => n + 1);
    window.addEventListener(GRADE_SAVE_EVENT, update); window.addEventListener("storage", update);
    return () => { window.removeEventListener(GRADE_SAVE_EVENT, update); window.removeEventListener("storage", update); };
  }, []);
  const box = currentGradeOutbox(), drafts = box?.drafts() ?? [];
  const localError = gradeLocalSaveError();
  if (!drafts.length && !localError) return null;
  const unresolved = drafts.filter(d => ["pending", "unbased", "conflict"].includes(d.status));
  const conflicts = unresolved.filter(d => d.status !== "pending"), students = loadStudents();
  const run = async (action: () => Promise<unknown>) => { setError(""); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "لم يتأكد الحفظ"); } };
  return <section aria-live="polite" className="border-b bg-secondary/40 p-3 text-sm" dir="rtl">
    {localError && <p role="alert">{localError}</p>}
    <p>{unresolved.length ? `لديك ${unresolved.length} عملية محفوظة على هذا الجهاز لم يؤكدها الخادم؛ أبقِ هذا المتصفح وبياناته حتى التأكيد.` : "أكد الخادم جميع عمليات تسجيل الدرجات المرسلة."}</p>
    {unresolved.length > 0 && <button className="underline ml-3" onClick={() => void run(flushConfirmedGrades)}>إعادة محاولة الحفظ</button>}
    {conflicts.length > 0 && <button className="underline" onClick={() => void run(refreshConfirmedGrades)}>تحديث القيم للمقارنة</button>}
    {error && <p role="alert">{error}</p>}
    {[...new Set(unresolved.filter(d => d.status === "pending").map(d => d.message).filter(Boolean))].map(message => <p key={message}>{message}</p>)}
    {conflicts.map(draft => <details key={draft.packet.operation_id} className="mt-2">
      <summary>تسجيل يحتاج مراجعة — لم تُستبدل كتابة المستخدم الآخر</summary>
      <ul>{(box?.reviewChanges(draft.packet.operation_id) ?? draft.packet.changes).map((change, i) => {
        let saved: unknown = box?.snapshot()?.value;
        for (const part of change.path) saved = saved && typeof saved === "object" ? (saved as Record<string, unknown>)[part] : undefined;
        return <li key={i}>{students.find(s => s.id === change.path[0])?.name ?? "الطالب"} · {change.path.slice(1).join(" / ")} — مسودتك: {JSON.stringify(change.next.present ? change.next.value : "إزالة")}، المحفوظ: {JSON.stringify(saved) ?? "غير موجود"}</li>;
      })}</ul>
      <button className="underline ml-3" onClick={() => void run(async () => { box?.resolve(draft.packet.operation_id, true); await flushConfirmedGrades(); })}>اعتماد مسودتي بعد المقارنة</button>
      <button className="underline" onClick={() => void run(async () => { box?.resolve(draft.packet.operation_id, false); })}>استخدام القيمة المحفوظة</button>
      {draft.message && <p>{draft.message}</p>}
    </details>)}
  </section>;
}
