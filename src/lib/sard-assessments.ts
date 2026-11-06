import { decodeAuthTokenPayload, getToken } from "./auth-session";
import { getActiveComplexId } from "./tenant";
import { buildRphpUrl } from "./api-base";
import { fetchWithTimeout } from "./request-timeout";
import { flushSardQueue, hasPendingSardWrites, pushSardHistory, type SardHistoryItem, type SardQueueItem } from "./mock-data";
import { refreshSardQueueFromShared } from "./sard-queue-refresh";

type Receipt = { operation_id: string; context_complex_id: number; item: SardQueueItem; history_record: SardHistoryItem };
export type AssessmentEntry = { id: string; body: string; status: "pending" | "committed" | "verified" | "conflict" | "archived"; receipt?: Receipt; message?: string };
export const SARD_ASSESSMENT_EVENT = "qhp-sard-assessment-status";
function canonical(value: unknown): string { return JSON.stringify(value, (_k, v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v); }
export function assessmentContext() {
  if (typeof window === "undefined") return null;
  const token = getToken(), auth = decodeAuthTokenPayload(token), cid = getActiveComplexId();
  if (!token || !auth?.accountId || !auth.complexId || auth.complexId !== cid) return null;
  return { token, cid, prefix: "qhp_sard_assessment_v1:" + encodeURIComponent(JSON.stringify([cid, auth.role, auth.accountId])) + ":" };
}
export function assessmentEntries(): AssessmentEntry[] {
  const context = assessmentContext(); if (!context) return [];
  const rows: AssessmentEntry[] = [];
  for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key?.startsWith(context.prefix)) rows.push(JSON.parse(localStorage.getItem(key)!)); }
  return rows;
}
function write(context: NonNullable<ReturnType<typeof assessmentContext>>, entry: AssessmentEntry) {
  if (assessmentContext()?.token !== context.token || assessmentContext()?.prefix !== context.prefix) throw Error("تغيّرت جلسة الاختبار؛ لم تُنقل بياناتها إلى حساب آخر");
  const raw = localStorage.getItem(context.prefix + entry.id), current = raw ? JSON.parse(raw) as AssessmentEntry : null;
  if (current?.body && current.body !== entry.body) throw Error("تغيّر الطلب المحفوظ؛ لم يُستبدل");
  if (current?.status === "verified" && entry.status !== "archived") return;
  if (current?.receipt && ["pending", "conflict"].includes(entry.status)) entry = { ...current, message: entry.message };
  try { localStorage.setItem(context.prefix + entry.id, JSON.stringify(entry)); }
  catch (cause) { throw new Error("تعذّر حفظ طلب الاختبار على الجهاز؛ لم يبدأ إرسال جديد. لا تمسح بيانات المتصفح", { cause }); }
  window.dispatchEvent(new Event(SARD_ASSESSMENT_EVENT));
}
function prepare(base: SardQueueItem, patch: Partial<SardQueueItem>, history: SardHistoryItem) {
  const context = assessmentContext(); if (!context || !base.assignmentId) throw Error("تعذّر تثبيت حساب الاختبار أو تعيينه؛ لم يبدأ حفظ");
  const fingerprint = (h: SardHistoryItem) => { const { at: _at, id: _id, ...rest } = h; return canonical(rest); };
  const existing = assessmentEntries().filter(e => e.status !== "archived" && canonical(JSON.parse(e.body).value.changes[0].base) === canonical(base));
  if (existing.some(e => fingerprint(JSON.parse(e.body).value.history_record) !== fingerprint(history))) throw Error("توجد نتيجة مختلفة محفوظة لنفس الاختبار؛ راجع الطلب الأصلي أولًا");
  if (existing.length) return existing[0];
  if (assessmentEntries().some(e => !["verified", "archived"].includes(e.status) && JSON.parse(e.body).value.changes[0].base.id === base.id)) throw Error("يوجد طلب اختبار لم يُحسم؛ استعده قبل تعديل النتيجة");
  const id = crypto.randomUUID(), value = { sard_assessment_protocol: 1, operation_id: id, changes: [{ base: structuredClone(base), item: { ...structuredClone(base), ...structuredClone(patch) } }], history_record: structuredClone(history) };
  const entry: AssessmentEntry = { id, body: JSON.stringify({ key: "sard_queue", value }), status: "pending" };
  write(context, entry); return entry;
}
const running = new Map<string, Promise<Receipt>>();
async function execute(id: string): Promise<Receipt> {
  const context = assessmentContext(), initial = assessmentEntries().find(e => e.id === id);
  if (!context || !initial || ["conflict", "archived"].includes(initial.status)) throw Error("طلب الاختبار يحتاج مراجعة؛ لم يُرسل طلب آخر");
  const assertCurrent = () => { if (assessmentContext()?.token !== context.token || assessmentContext()?.prefix !== context.prefix) throw Error("تغيّرت جلسة الاختبار؛ بقي الطلب في حسابه الأصلي"); };
  const request = async (path: string, body?: string) => {
    assertCurrent(); const response = await fetchWithTimeout(buildRphpUrl(path), { method: body ? "POST" : "GET", headers: { Authorization: "Bearer " + context.token, "Content-Type": "application/json" }, ...(body ? { body } : {}) });
    assertCurrent(); const data = JSON.parse(await response.text()); if (!response.ok) throw Object.assign(Error(data.error ?? "لم يتأكد حفظ الاختبار"), { status: response.status }); return data;
  };
  let entry = initial;
  try {
    if (!entry.receipt) {
      await flushSardQueue(); assertCurrent();
      const capability = await request("/sard/capabilities");
      if (capability.context_complex_id !== context.cid || capability.sard_assessment_protocol !== 1 || capability.atomic_history !== true || capability.immutable_receipts !== true) throw Error("الخادم لم يؤكد الحفظ الذري للاختبار؛ لم يُرسل الطلب");
      const response = await request("/app-state", entry.body), receipt = response.assessment_receipt as Receipt | undefined;
      const packet = JSON.parse(entry.body).value, base = packet.changes[0].base;
      if (!receipt || receipt.operation_id !== entry.id || receipt.context_complex_id !== context.cid || receipt.history_record?.studentId !== base.studentId || receipt.history_record.assignmentId !== base.assignmentId || receipt.history_record.sourceQueueItemId !== base.id || receipt.history_record.assessmentConfirmed !== true || canonical(receipt.item) !== canonical(packet.changes[0].item)) throw Error("لم يؤكد الخادم تفاصيل الاختبار والقائمة معًا؛ بقي الطلب محفوظًا");
      for (const field of ["hifzErrors", "hifzWarnings", "reviewErrors", "reviewWarnings", "evaluationRules", "percent"] as const) if (canonical(receipt.history_record[field] ?? (field === "hifzWarnings" ? 0 : field === "reviewWarnings" ? [] : undefined)) !== canonical(packet.history_record[field] ?? (field === "hifzWarnings" ? 0 : field === "reviewWarnings" ? [] : undefined))) throw Error("إيصال الاختبار لا يطابق التفاصيل المرسلة؛ بقي الطلب محفوظًا");
      entry = { ...entry, receipt, status: "committed", message: undefined }; write(context, entry);
    }
    assertCurrent(); if (hasPendingSardWrites()) throw Error("أكد الخادم الاختبار؛ يلزم حسم تعديلات القائمة قبل تأكيد العرض");
    await refreshSardQueueFromShared(); assertCurrent();
    pushSardHistory(entry.receipt!.history_record, { sync: false });
    write(context, { ...entry, status: "verified", message: undefined }); return entry.receipt!;
  } catch (error) {
    assertCurrent(); const current = assessmentEntries().find(e => e.id === id) ?? entry;
    // A late failure in another tab must not downgrade a confirmed receipt.
    if (current.status !== "verified") write(context, { ...current, status: current.receipt ? "committed" : [400, 403, 409].includes((error as { status?: number }).status ?? 0) ? "conflict" : "pending", message: error instanceof Error ? error.message : "لم يتأكد الحفظ" });
    throw error;
  }
}
export function resumeSardAssessment(id: string): Promise<Receipt> {
  const context = assessmentContext(), key = context?.prefix + ":" + context?.token + ":" + id;
  const active = running.get(key); if (active) return active;
  const pending = execute(id).finally(() => { if (running.get(key) === pending) running.delete(key); }); running.set(key, pending); return pending;
}
export async function saveSardAssessment(base: SardQueueItem, patch: Partial<SardQueueItem>, history: SardHistoryItem) {
  const entry = prepare(base, patch, history); return resumeSardAssessment(entry.id);
}
export function archiveSardAssessment(id: string) {
  const context = assessmentContext(), entry = assessmentEntries().find(e => e.id === id);
  if (context && entry?.status === "conflict") write(context, { ...entry, status: "archived" });
}
