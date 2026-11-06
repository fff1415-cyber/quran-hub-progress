import { decodeAuthTokenPayload, getToken } from "./auth-session";
import type { AcademicPhaseRecord } from "./academic-record";
import type { SardHistoryItem } from "./mock-data";
import type { SardPassPayload } from "./post-pass-automation";

export type PlanTransitionReceipt = { assignment_id: string; academic_record?: AcademicPhaseRecord | null; sard_history_record?: SardHistoryItem | null; sard_queue?: unknown[] | null; student_phase?: { phase_number: number; level: string; institute_level: string } };
export type PlanTransitionDraft = { id: string; student: string; expected: string; plan: string; body: string; order: number; status: "pending" | "committed" | "verified" | "conflict" | "historical" | "archived"; receipt?: PlanTransitionReceipt; message?: string };
export const PLAN_TRANSITION_EVENT = "qhp-plan-transition-status";
export type PlanPassIntent = { id: string; payload: SardPassPayload; status: "preparing" | "linked" | "blocked" | "archived"; message?: string; operation?: string };
function canonical(value: unknown): string { return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(k => [k, item[k]])) : item); }
export class PlanTransitionJournal {
  readonly prefix: string;
  constructor(private storage: Storage, readonly cid: number, scope: string, private id = () => crypto.randomUUID(), private changed = () => {}) { this.prefix = "qhp_plan_transition_v1:" + encodeURIComponent(scope) + ":"; }
  entries(): PlanTransitionDraft[] {
    const rows: PlanTransitionDraft[] = [];
    for (let i = 0; i < this.storage.length; i++) { const key = this.storage.key(i); if (key?.startsWith(this.prefix + "operation:")) rows.push(JSON.parse(this.storage.getItem(key)!)); }
    return rows.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }
  intents(): PlanPassIntent[] {
    const rows: PlanPassIntent[] = [];
    for (let i = 0; i < this.storage.length; i++) { const key = this.storage.key(i); if (key?.startsWith(this.prefix + "intent:")) rows.push(JSON.parse(this.storage.getItem(key)!)); }
    return rows;
  }
  private writeIntent(intent: PlanPassIntent) {
    try { this.storage.setItem(this.prefix + "intent:" + intent.id, JSON.stringify(intent)); }
    catch (error) { throw new Error("تعذّر حفظ تفاصيل الاجتياز على الجهاز؛ لم يبدأ طلب جديد", { cause: error }); }
    this.changed();
  }
  prepare(payload: SardPassPayload): PlanPassIntent {
    if (!payload.queueItemId || !payload.historyRecord) throw Error("تفاصيل الاجتياز غير مكتملة؛ لم يبدأ طلب");
    const current = this.intents().filter(i => i.payload.studentId === payload.studentId && i.payload.queueItemId === payload.queueItemId && i.status !== "archived");
    const core = (p: SardPassPayload) => { const { planStartDate: _date, ...rest } = p; return canonical(rest); };
    if (current.some(i => core(i.payload) !== core(payload) || payload.planStartDate && i.payload.planStartDate !== payload.planStartDate)) throw Error("يوجد اجتياز محفوظ بتفاصيل مختلفة؛ راجعه قبل اعتماد نتيجة أخرى");
    if (current.length) return current[0];
    const intent: PlanPassIntent = { id: this.id(), payload: { ...structuredClone(payload), planStartDate: payload.planStartDate ?? new Date().toISOString().slice(0, 10) }, status: payload.assignmentId ? "preparing" : "blocked", ...(payload.assignmentId ? {} : { message: "لم تُثبت هوية تعيين طلب السرد؛ يلزم مراجعتها دون إسناد تاريخي بالتخمين" }) };
    this.writeIntent(intent); return intent;
  }
  noteIntent(intent: PlanPassIntent, message: string) {
    const current = this.intents().find(i => i.id === intent.id); if (current) this.writeIntent({ ...current, message });
  }
  archiveIntent(intent: PlanPassIntent) {
    if (this.entries().some(e => e.student === intent.payload.studentId && JSON.parse(e.body).sard_result?.id === intent.payload.queueItemId)) throw Error("يوجد طلب إرسال محفوظ لهذا الاجتياز؛ تحقّق منه قبل أرشفة تفاصيله");
    this.writeIntent({ ...intent, status: "archived" });
  }
  private linkIntents(entry: PlanTransitionDraft) {
    const body = JSON.parse(entry.body), result = body.sard_result;
    for (const intent of this.intents().filter(i => i.status !== "archived" && i.payload.studentId === entry.student && i.payload.assignmentId === entry.expected && i.payload.queueItemId === result.id)) {
      if (canonical(intent.payload.historyRecord) === canonical(result.history_record) && intent.payload.percent === result.percent && intent.payload.hifzScore === result.academic_record?.hifzScore && intent.payload.reviewScore === result.academic_record?.reviewScore) this.writeIntent({ ...intent, status: "linked", operation: entry.id, message: undefined });
    }
  }
  private write(entry: PlanTransitionDraft) {
    try { this.storage.setItem(this.prefix + "operation:" + entry.id, JSON.stringify(entry)); }
    catch (error) { throw new Error("تعذّر حفظ حالة طلب الانتقال على الجهاز؛ بقيت النسخة السابقة محفوظة. لا تمسح بيانات المتصفح", { cause: error }); }
    this.changed();
  }
  begin(student: string, expected: string, body: string): PlanTransitionDraft {
    const input = JSON.parse(body);
    if (!expected || input.student_id !== student || input.expected_assignment_id !== expected || typeof input.plan_id !== "string" || input.sard_result?.write_protocol !== 2 || !input.sard_result.history_record) throw Error("طلب الانتقال لا يحتوي تفاصيل اختبار مؤكدة الهوية");
    const all = this.entries(), existing = all.filter(e => e.student === student && e.expected === expected && e.status !== "archived");
    if (existing.some(e => e.body !== body)) throw Error("يوجد طلب اجتياز سابق محفوظ بمحتوى مختلف؛ استعده وراجعه قبل اعتماد نتيجة أخرى");
    if (existing.length) { this.linkIntents(existing[0]); return existing[0]; }
    if (all.some(e => e.student === student && !["verified", "archived"].includes(e.status))) throw Error("يوجد انتقال سابق لم يُحسم لهذا الطالب؛ لم يبدأ انتقال آخر");
    const entry: PlanTransitionDraft = { id: this.id(), student, expected, plan: input.plan_id, body, order: Math.max(0, ...all.map(e => e.order)) + 1, status: "pending" };
    this.write(entry); this.linkIntents(entry); return entry;
  }
  find(student: string, expected?: string, offered?: unknown): PlanTransitionDraft | null {
    const candidates = this.entries().filter(e => e.student === student && e.status !== "archived" && (expected ? e.expected === expected : e.status !== "verified"));
    if (!candidates.length) return null;
    if (new Set(candidates.map(e => canonical(JSON.parse(e.body)))).size > 1) throw Error("توجد طلبات انتقال متعارضة محفوظة من أكثر من جلسة؛ راجعها دون اختيار نتيجة تلقائيًا");
    const entry = candidates[0];
    if (offered && canonical(JSON.parse(entry.body).sard_result) !== canonical(offered)) throw Error("نتيجة الطلب المحفوظ تختلف عن الشاشة؛ استعد الطلب الأصلي قبل أي تعديل");
    return entry;
  }
  update(entry: PlanTransitionDraft, status: PlanTransitionDraft["status"], message?: string, receipt?: PlanTransitionReceipt) {
    const current = this.entries().find(e => e.id === entry.id); if (!current || current.body !== entry.body) throw Error("تغيّرت مسودة الانتقال على الجهاز؛ لم تُستبدل");
    if (current.receipt && ["pending", "conflict"].includes(status)) { this.write({ ...current, message }); return; }
    if (current.status === "verified" && status === "committed") return;
    this.write({ ...current, status, message, ...(receipt ? { receipt } : {}) });
    if (receipt) this.linkIntents(entry);
  }
  commit(entry: PlanTransitionDraft, receipt: PlanTransitionReceipt) {
    const input = JSON.parse(entry.body), academic = receipt.academic_record, history = receipt.sard_history_record;
    if (!receipt.assignment_id || !academic || academic.studentId !== entry.student || academic.assignmentId !== entry.expected || !history || history.studentId !== entry.student || history.assignmentId !== entry.expected || history.sourceQueueItemId !== input.sard_result.id || history.transitionConfirmed !== true) throw Error("لم يؤكد الخادم الخطة والسجل الأكاديمي وتفاصيل الاختبار معًا؛ بقي الطلب محفوظًا");
    this.update(entry, "committed", undefined, receipt);
  }
}
export function currentPlanTransitionJournal(): PlanTransitionJournal | null {
  if (typeof window === "undefined") return null;
  const token = getToken(), auth = decodeAuthTokenPayload(token);
  if (!token || !auth?.complexId || !auth.accountId || !["manager", "supervisor", "musammi"].includes(auth.role ?? "")) return null;
  return new PlanTransitionJournal(localStorage, auth.complexId, JSON.stringify([auth.complexId, auth.role, auth.accountId]), () => crypto.randomUUID(), () => window.dispatchEvent(new Event(PLAN_TRANSITION_EVENT)));
}
