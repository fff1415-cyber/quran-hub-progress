import { useEffect, useState } from "react";
import { currentPlanTransitionJournal, PLAN_TRANSITION_EVENT } from "@/lib/plan-transition-journal";
import { loadStudents } from "@/lib/mock-data";

export function PlanTransitionStatus() {
  const [, redraw] = useState(0), [error, setError] = useState("");
  useEffect(() => {
    const update = () => redraw(n => n + 1);
    const tick = () => {
      const journal = currentPlanTransitionJournal(); if (document.hidden || !journal) return;
      for (const student of new Set(journal.entries().filter(e => ["pending", "committed"].includes(e.status)).map(e => e.student))) void import("@/lib/plans-service").then(m => m.resumePendingPlanTransition(student)).catch(() => undefined);
      for (const intent of journal.intents().filter(i => i.status === "preparing")) if (!journal.entries().some(e => e.student === intent.payload.studentId && ["pending", "committed", "conflict", "historical"].includes(e.status))) void import("@/lib/post-pass-automation").then(m => m.runPostPassAutomation(intent.payload)).catch(() => undefined);
    };
    window.addEventListener(PLAN_TRANSITION_EVENT, update); window.addEventListener("storage", update); window.addEventListener("online", tick); window.addEventListener("focus", tick); document.addEventListener("visibilitychange", tick);
    const timer = setInterval(tick, 15000); tick();
    return () => { clearInterval(timer); window.removeEventListener(PLAN_TRANSITION_EVENT, update); window.removeEventListener("storage", update); window.removeEventListener("online", tick); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); };
  }, []);
  const journal = currentPlanTransitionJournal(), rows = journal?.entries().filter(e => !["verified", "archived"].includes(e.status)) ?? [];
  const intents = journal?.intents().filter(i => ["preparing", "blocked"].includes(i.status)) ?? [];
  if (!rows.length && !intents.length) return null;
  const students = loadStudents();
  return <section className="border-b p-3 text-sm bg-secondary/40" aria-live="polite" dir="rtl"><p>طلبات اجتياز محفوظة على هذا الجهاز تحتاج استكمال التحقق. سيُستعاد الطلب الأصلي، ولن تُنشأ خطة أخرى بالتخمين.</p>{error && <p role="alert">{error}</p>}
    {intents.map(intent => <details key={intent.id}><summary>{students.find(s => s.id === intent.payload.studentId)?.name ?? "طالب"} — تفاصيل اختبار محفوظة قبل الاتصال بالخادم</summary><p>الأسبوع {intent.payload.week} · النسبة {intent.payload.percent}% · أخطاء الحفظ {intent.payload.historyRecord?.hifzErrors}</p><p>{intent.message}</p>
      {intent.status === "preparing" && <button className="underline ml-3" onClick={() => { setError(""); void import("@/lib/post-pass-automation").then(m => m.runPostPassAutomation(intent.payload)).catch(e => setError(e instanceof Error ? e.message : "تعذّر استكمال الاجتياز")); }}>استكمل الاجتياز الأصلي</button>}
      <button className="underline" onClick={() => { try { journal?.archiveIntent(intent); } catch (e) { setError(e instanceof Error ? e.message : "تعذّرت الأرشفة"); } }}>أرشفة هذه التفاصيل محليًا بعد المراجعة</button>
    </details>)}
    {rows.map(entry => {
      const body = JSON.parse(entry.body), history = body.sard_result?.history_record;
      return <details key={entry.id}><summary>{students.find(s => s.id === entry.student)?.name ?? "طالب"} — {entry.receipt ? "أكد الخادم الحفظ؛ يلزم التحقق من العرض الحالي" : "لم يتأكد اكتمال الحفظ"}</summary>
        <p>الأسبوع {history?.week} · النتيجة المرسلة {body.sard_result?.percent}% · أخطاء الحفظ {history?.hifzErrors} · تنبيهات الحفظ {history?.hifzWarnings}</p><p>{entry.message}</p>
        {["pending", "committed"].includes(entry.status) && <button className="underline ml-3" onClick={() => { setError(""); void import("@/lib/plans-service").then(m => m.resumePlanTransitionById(entry.id)).catch(e => setError(e instanceof Error ? e.message : "تعذّر استكمال التحقق")); }}>تحقق واستكمل الطلب الأصلي</button>}
        {["conflict", "historical"].includes(entry.status) && <button className="underline" onClick={() => journal?.update(entry, "archived", entry.message)}>أرشفة هذه المسودة محليًا بعد مراجعة ورقة الطالب</button>}
      </details>;
    })}
  </section>;
}
