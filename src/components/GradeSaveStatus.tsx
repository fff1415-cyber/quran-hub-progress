import { useEffect, useRef, useState } from "react";
import { currentGradeOutbox, flushConfirmedGrades, refreshConfirmedGrades, GRADE_SAVE_EVENT, gradeLocalSaveError } from "@/lib/grade-sync";
import { loadStudents } from "@/lib/mock-data";

const dayLabels: Record<string, string> = {
  sun: "الأحد", mon: "الاثنين", tue: "الثلاثاء", wed: "الأربعاء", thu: "الخميس", fri: "الجمعة", sat: "السبت",
};
const fieldLabels: Record<string, string> = {
  attendance: "الحضور", hifz: "الحفظ", rabt: "الربط", muraja: "المراجعة", wajib: "الواجب",
  compensationFaces: "تعويض الحفظ", compensationMurajaFaces: "تعويض المراجعة",
};
const valueLabels: Record<string, string> = {
  "": "فارغ", pass: "مجتاز", fail: "غير مجتاز", present: "حاضر", absent: "غائب",
  late: "متأخر", excused: "مستأذن", half: "نصف وجه", one: "وجه", two: "وجهان",
};
function gradeLocation(path: string[]): string {
  const [, week, scope, day, field] = path;
  if (scope === "days" && dayLabels[day] && fieldLabels[field]) return `الأسبوع ${week} · ${dayLabels[day]} · ${fieldLabels[field]}`;
  if (path.length === 3 && fieldLabels[scope]) return `الأسبوع ${week} · ${fieldLabels[scope]}`;
  return path.slice(1).join(" / ");
}
function gradeValue(value: unknown): string {
  if (typeof value === "string" && Object.hasOwn(valueLabels, value)) return valueLabels[value];
  return JSON.stringify(value) ?? "غير موجود";
}

export function GradeSaveStatus() {
  const [, redraw] = useState(0), [error, setError] = useState("");
  const actionInProgress = useRef(false);
  const [busy, setBusy] = useState<"refresh" | "save" | "review" | null>(null);
  const [notice, setNotice] = useState("");
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
  const run = async (kind: NonNullable<typeof busy>, action: () => Promise<unknown>) => {
    if (actionInProgress.current) return;
    actionInProgress.current = true;
    setBusy(kind);
    setNotice("");
    setError("");
    try {
      await action();
      if (kind === "refresh") setNotice("تم التحقق من القيم المحفوظة. ما زالت المسودات متاحة للمراجعة.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      setError(kind === "refresh" ? `تعذّر تحديث القيم للمقارنة؛ بقيت المسودات كما هي. ${message}` : message || "لم يتأكد الحفظ");
    } finally {
      actionInProgress.current = false;
      setBusy(null);
    }
  };
  return <section aria-live="polite" className="border-b bg-secondary/40 p-3 text-sm" dir="rtl">
    {localError && <p role="alert">{localError}</p>}
    <p>{unresolved.length ? `لديك ${unresolved.length} عملية محفوظة على هذا الجهاز لم يؤكدها الخادم؛ أبقِ هذا المتصفح وبياناته حتى التأكيد.` : drafts.every(d => d.status === "confirmed") ? "أكد الخادم جميع عمليات تسجيل الدرجات المرسلة." : "لا توجد مسودات بانتظار التأكيد. بقيت القيم المحفوظة للعمليات التي اخترت عدم اعتمادها."}</p>
    {unresolved.length > 0 && <div className="flex flex-wrap gap-2 py-1">
      <button type="button" disabled={busy !== null} className="min-h-11 rounded border px-3 disabled:opacity-60" onClick={() => void run("refresh", refreshConfirmedGrades)}>
        {busy === "refresh" ? "جارٍ تحديث القيم للمقارنة…" : "تحديث القيم للمقارنة"}
      </button>
      {unresolved.some(d => d.status === "pending") && <button type="button" disabled={busy !== null} className="min-h-11 rounded border px-3 disabled:opacity-60" onClick={() => void run("save", flushConfirmedGrades)}>
        {busy === "save" ? "جارٍ التحقق من الحفظ…" : "إعادة محاولة الحفظ"}
      </button>}
    </div>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
    {[...new Set(unresolved.filter(d => d.status === "pending").map(d => d.message).filter(Boolean))].map(message => <p key={message}>{message}</p>)}
    {conflicts.map(draft => {
      const id = draft.packet.operation_id;
      const changes = box?.reviewChanges(id) ?? draft.packet.changes;
      const needsPlan = box?.reviewRequiresPlan(id);
      return <details key={id} className="mt-2">
      <summary>مسودة تحتاج مراجعة — لم يؤكد الخادم حفظها</summary>
      {changes.length === 0 && <p>تحتوي هذه المسودة على خانات فارغة أُنشئت تلقائيًا؛ لا يوجد تعديل درجات لإرساله.</p>}
      <ul>{changes.map((change, i) => {
        let saved: unknown = box?.snapshot()?.value;
        for (const part of change.path) saved = saved && typeof saved === "object" ? (saved as Record<string, unknown>)[part] : undefined;
        return <li key={i}>{students.find(s => s.id === change.path[0])?.name ?? "الطالب"} · {gradeLocation(change.path)} — مسودتك: {change.next.present ? gradeValue(change.next.value) : "إزالة"}، المحفوظ: {gradeValue(saved)}</li>;
      })}</ul>
      {needsPlan && <p>أبقِ القيمة المحفوظة إذا أردت إعادة التسجيل من جدول التحضير؛ سيُراجَع ارتباط الدرجة بالإنجاز قبل حفظهما معًا.</p>}
      {!needsPlan && changes.length > 0 && <button type="button" disabled={busy !== null} className="underline ml-3" onClick={() => void run("review", async () => { box?.resolve(id, true); await flushConfirmedGrades(); })}>اعتماد مسودتي بعد المقارنة</button>}
      <button type="button" disabled={busy !== null} className="underline" onClick={() => void run("review", async () => { box?.resolve(id, false); })}>استخدام القيمة المحفوظة</button>
      {draft.message && <p>{draft.message}</p>}
    </details>; })}
  </section>;
}
