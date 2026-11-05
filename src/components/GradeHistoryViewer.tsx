import { useEffect, useState } from "react";
import { currentSharedOutbox, GRADE_SAVE_EVENT } from "@/lib/grade-sync";
import type { GradeStoreKey } from "@/lib/grade-outbox";
import { getToken } from "@/lib/auth-session";
import { loadStudents } from "@/lib/mock-data";
import { secureGradeHistory, type GradeHistoryRow } from "@/lib/secure-data.functions";

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const labels: Record<string, string> = { attendance: "الحضور", hifz: "الحفظ", rabt: "الربط", muraja: "المراجعة", compensationFaces: "التعويض", sun: "الأحد", mon: "الإثنين", tue: "الثلاثاء", wed: "الأربعاء", thu: "الخميس", fri: "الجمعة", sat: "السبت", pass: "ناجح", fail: "غير مجتاز", present: "حاضر", absent: "غائب", late: "متأخر", excused: "مستأذن", half: "نصف", one: "واحد", two: "اثنان" };
function describe(value: unknown): string {
  if (Array.isArray(value)) return value.map(describe).join("، ");
  if (object(value)) return Object.entries(value).filter(([key]) => key in labels).map(([key, v]) => `${labels[key]}: ${describe(v)}`).join(" · ");
  return value === "" || value == null ? "—" : labels[String(value)] ?? String(value);
}
export function gradeHistoryEntries(history: GradeHistoryRow[]): { semester: string; student: string; week: string; details: string }[] {
  return history.flatMap(row => {
    const semester = row.legacy_unknown_semester ? "سجل سابق — الفصل غير محدد" : `الفصل ${row.semester_id}`;
    const stores = row.key === "scientific_grades" ? Object.values(object(row.value.data) ? row.value.data : {}) : [row.value];
    return stores.flatMap(store => object(store) ? Object.entries(store).flatMap(([student, weeks]) => object(weeks) ? Object.entries(weeks).map(([week, values]) => ({ semester, student, week, details: describe(object(values) && object(values.days) ? values.days : values) })) : []) : []);
  });
}
export function GradeHistoryViewer({ storeKey }: { storeKey: GradeStoreKey }) {
  const [, redraw] = useState(0), [rows, setRows] = useState<GradeHistoryRow[]>([]), [loadedFor, setLoadedFor] = useState(""), [error, setError] = useState(""), [loading, setLoading] = useState(false), [page, setPage] = useState(0);
  useEffect(() => { const update = () => redraw(n => n + 1); window.addEventListener(GRADE_SAVE_EVENT, update); return () => window.removeEventListener(GRADE_SAVE_EVENT, update); }, []);
  const box = currentSharedOutbox(storeKey);
  if (!box?.snapshot()?.semester_scoped) return null;
  const visibleRows = loadedFor === box.prefix ? rows : [];
  const students = loadStudents(), entries = gradeHistoryEntries(visibleRows);
  const read = async () => {
    const token = getToken(), scope = box.prefix; if (!token) return;
    setLoading(true); setError("");
    try { const result = await secureGradeHistory(token, storeKey); if (getToken() !== token || currentSharedOutbox(storeKey)?.prefix !== scope) return; setRows(result); setLoadedFor(scope); setPage(0); }
    catch (e) { setError(e instanceof Error ? e.message : "تعذّر عرض السجل السابق"); }
    finally { setLoading(false); }
  };
  return <details className="border-b p-3 text-sm" dir="rtl"><summary>السجلات السابقة لل{storeKey === "grades" ? "درجات اليومية" : storeKey === "weekly_tests" ? "اختبارات الأسبوعية" : "درجات العلمية"} — للقراءة فقط</summary>
    <p>يبقى السجل الذي لم يُحدد فصله منفصلًا، ولا يُنقل إلى الفصل الحالي تلقائيًا.</p>
    <button className="underline" disabled={loading} onClick={() => void read()}>{loading ? "جارٍ التحميل…" : "عرض السجلات المحفوظة"}</button>
    {error && <p role="alert">{error}</p>}
    {visibleRows.length > 0 && <><p>{entries.length} سجلًا · عرض {page + 1}</p><div className="overflow-auto"><table className="w-full text-right"><thead><tr><th>الفصل</th><th>الطالب</th><th>الأسبوع</th><th>التسجيل</th></tr></thead><tbody>{entries.slice(page * 50, (page + 1) * 50).map((row, i) => <tr key={i}><td>{row.semester}</td><td>{students.find(s => s.id === row.student)?.name ?? "طالب من السجل السابق"}</td><td>{row.week}</td><td>{row.details || "سجل محفوظ دون تفاصيل قابلة للعرض"}</td></tr>)}</tbody></table></div>
    <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>السابق</button><button disabled={(page + 1) * 50 >= entries.length} onClick={() => setPage(p => p + 1)}>التالي</button></>}
  </details>;
}
