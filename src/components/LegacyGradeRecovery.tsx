import { useEffect, useState } from "react";
import { decodeAuthTokenPayload, getToken, isTokenExpired } from "@/lib/auth-session";
import { currentGradeOutbox } from "@/lib/grade-sync";
import { secureListStudents } from "@/lib/secure-data.functions";
import { archiveDisplacedLegacyCopy, compareLegacyStudent, legacyGradeCopies, LEGACY_GRADE_KEY, readLegacyArchive, recoveryStudents } from "@/lib/legacy-grade-recovery";

export function LegacyGradeRecovery() {
  const [copies, setCopies] = useState<ReturnType<typeof legacyGradeCopies>>([]);
  const [review, setReview] = useState<{ token: string; students: ReturnType<typeof recoveryStudents> } | null>(null);
  const [selected, select] = useState(""), [copy, selectCopy] = useState(0), [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const load = () => {
      try {
        setCopies(legacyGradeCopies(localStorage));
        void readLegacyArchive().then(archive => { if (live) setCopies(legacyGradeCopies(localStorage, archive)); }).catch(() => {});
      }
      catch { setError("تعذّر قراءة نسخة التسجيل القديمة من تخزين هذا المتصفح."); }
    };
    const changed = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) return;
      if (event.key === LEGACY_GRADE_KEY) {
        // Another, older tab can still write the legacy key. Its displaced version has no verified semester.
        void archiveDisplacedLegacyCopy(event.oldValue).then(() => { if (live) load(); }).catch(() => {
          if (live) setError("تعذّر حفظ نسخة إضافية في المتصفح. أبقِ التبويب القديم مفتوحًا إلى أن تراجع تسجيلاته.");
        });
      }
      if (event.key === "qs_token") { setReview(null); select(""); }
      if (event.key === LEGACY_GRADE_KEY || event.key === null) load();
    };
    load();
    window.addEventListener("storage", changed);
    window.addEventListener("focus", load);
    return () => { live = false; window.removeEventListener("storage", changed); window.removeEventListener("focus", load); };
  }, []);
  const token = getToken(), session = decodeAuthTokenPayload(token);
  if (!token || isTokenExpired(token) || !session?.complexId || !session.halaqaId || !["teacher", "assistant"].includes(session.role ?? "") || (!copies.length && !error)) return null;
  const scope = { complexId: session.complexId, halaqaId: session.halaqaId };
  const available = review?.token === token ? review.students : null;
  const entry = copies[copy], snapshot = currentGradeOutbox()?.snapshot();
  const differences = entry && selected && available ? compareLegacyStudent(entry, selected, available, snapshot?.value, snapshot?.calendar_context.active_semester_id ?? null) : [];
  async function loadRoster() {
    if (!token) return;
    setError(""); select("");
    try {
      const students = recoveryStudents(await secureListStudents({ data: { token } }), scope);
      if (getToken() === token) setReview({ token, students });
    } catch {
      if (getToken() === token) setError("تعذّر تأكيد قائمة حلقتك. بقيت النسخة على هذا الجهاز؛ أعد المحاولة عند الاتصال.");
    }
  }
  return <details className="border-b bg-warning/10 px-4 py-2 text-sm" dir="rtl" onToggle={() => { if (review?.token !== getToken()) { setReview(null); select(""); } }}>
    <summary className="font-semibold">توجد نسخة تسجيل قديمة على هذا الجهاز لم يؤكَّد حفظ كل قيمها</summary>
    <p>لا تُرفع هذه النسخة تلقائيًا. قارنها بتسجيلات حلقتك ثم أعد إدخال ما تعرف أنه لم يُحفظ من شاشة التسجيل. راجع الفصل والأسبوع أولًا، وسجّل الدرجات المرتبطة بالخطط من مسارها المعتاد حتى يتطابق الإنجاز معها.</p>
    {error && <p role="alert">{error}</p>}
    {!available && copies.length > 0 && <button type="button" className="underline" onClick={() => void loadRoster()}>مراجعة النسخة المحلية</button>}
    {available && <>
      <label> الطالب <select value={selected} onChange={event => select(event.target.value)}>
        <option value="">اختر طالبًا من حلقتك</option>
        {available.map(student => <option key={student.id} value={student.id}>{student.name}</option>)}
      </select></label>
      {copies.length > 1 && <label> النسخة <select value={copy} onChange={event => selectCopy(Number(event.target.value))}>
        {copies.map((_, index) => <option key={index} value={index}>{index === 0 ? "أحدث نسخة متاحة" : `نسخة محفوظة ${index}`}</option>)}
      </select></label>}
      {selected && <p>{entry?.semester && entry.semester === snapshot?.calendar_context.active_semester_id ? "القيم التي تختلف عن آخر نسخة أكدها الخادم:" : "لم يتأكد تطابق الفصل مع النسخة المحفوظة؛ تُعرض القيم المحلية للمراجعة فقط."}</p>}
      {selected && !differences.length && <p>لا توجد قيم إضافية قابلة للمقارنة لهذا الطالب في هذه النسخة.</p>}
      <ul>{differences.map(row => <li key={row.path}>{row.path} — محليًا: {JSON.stringify(row.local)}{row.confirmed !== undefined && <>، على الخادم: {JSON.stringify(row.confirmed)}</>}</li>)}</ul>
    </>}
  </details>;
}
