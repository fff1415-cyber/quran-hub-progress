import { decodeAuthTokenPayload, getToken } from "./auth-session";
import { getActiveComplexId } from "./tenant";
import { buildRphpUrl } from "./api-base";
import { fetchWithTimeout } from "./request-timeout";

export type AssignmentStateSnapshot = { status: "active" | "frozen"; version: string };
type Receipt = { ok: boolean; assignment_id: string; status: string; status_version: string; operation_id: string; context_complex_id: number };
export type AssignmentStateEntry = { id: string; body: string; status: "pending" | "committed" | "verified" | "conflict" | "archived"; receipt?: Receipt; message?: string };
export const ASSIGNMENT_STATE_EVENT = "qhp-assignment-state-status";
function context() {
  if (typeof window === "undefined") return null;
  const token = getToken(), auth = decodeAuthTokenPayload(token), cid = getActiveComplexId();
  if (!token || !auth?.accountId || !auth.complexId || cid !== auth.complexId || !["supervisor", "manager"].includes(auth.role ?? "")) return null;
  return { token, cid, prefix: "qhp_assignment_state_v1:" + encodeURIComponent(JSON.stringify([cid, auth.role, auth.accountId])) + ":" };
}
export function assignmentStateEntries(): AssignmentStateEntry[] {
  const own = context(), entries: AssignmentStateEntry[] = []; if (!own) return entries;
  for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key?.startsWith(own.prefix)) entries.push(JSON.parse(localStorage.getItem(key)!)); }
  return entries;
}
function write(own: NonNullable<ReturnType<typeof context>>, entry: AssignmentStateEntry) {
  if (context()?.token !== own.token || context()?.prefix !== own.prefix) throw Error("تغيّرت الجلسة؛ بقي طلب حالة الخطة محفوظًا في حسابه");
  const raw = localStorage.getItem(own.prefix + entry.id), current = raw ? JSON.parse(raw) as AssignmentStateEntry : null;
  if (current && current.body !== entry.body) throw Error("تغيّر الطلب المحفوظ؛ لم يُستبدل");
  if (current?.status === "verified" && entry.status !== "archived") return;
  if (current?.receipt && ["pending", "conflict"].includes(entry.status)) entry = { ...current, message: entry.message };
  try { localStorage.setItem(own.prefix + entry.id, JSON.stringify(entry)); }
  catch (cause) { throw new Error("تعذّر حفظ طلب حالة الخطة على الجهاز؛ لم يبدأ إرسال جديد", { cause }); }
  window.dispatchEvent(new Event(ASSIGNMENT_STATE_EVENT));
}
const running = new Map<string, Promise<void>>();
async function execute(id: string) {
  const own = context(); let entry = assignmentStateEntries().find(e => e.id === id);
  if (!own || !entry || ["conflict", "archived"].includes(entry.status)) throw Error("طلب حالة الخطة يحتاج مراجعة");
  const input = JSON.parse(entry.body);
  const assertCurrent = () => { if (context()?.token !== own.token || context()?.prefix !== own.prefix) throw Error("تغيّرت الجلسة؛ تحقق من حالة الخطة في الحساب الأصلي"); };
  const request = async (path: string, body?: string) => {
    assertCurrent(); const response = await fetchWithTimeout(buildRphpUrl(path), { method: body ? "PATCH" : "GET", headers: { Authorization: "Bearer " + own.token, "Content-Type": "application/json" }, ...(body ? { body } : {}) });
    const data = JSON.parse(await response.text()); assertCurrent(); if (!response.ok) throw Object.assign(Error(data.error ?? "لم يتأكد تغيير حالة الخطة"), { status: response.status }); return data;
  };
  try {
    if (!entry.receipt) {
      const capabilities = await request("/plans/assignment-capabilities");
      if (capabilities.context_complex_id !== own.cid || capabilities.assignment_state_protocol !== 1 || capabilities.immutable_receipts !== true || capabilities.state_versions !== true) throw Error("الخادم لم يؤكد حماية حالة الخطة؛ لم يُرسل الطلب");
      const receipt = await request("/plans/assignment", entry.body) as Receipt;
      if (!receipt.ok || receipt.operation_id !== entry.id || receipt.context_complex_id !== own.cid || receipt.assignment_id !== input.assignment_id || receipt.status !== input.status || typeof receipt.status_version !== "string" || !receipt.status_version) throw Error("لم يؤكد الخادم تغيير الحالة المطلوبة؛ بقي الطلب محفوظًا");
      entry = { ...entry, status: "committed", receipt, message: undefined }; write(own, entry);
    }
    const sheet = await request("/plans/student-sheet?student_id=" + encodeURIComponent(input.student_id));
    write(own, { ...entry, status: "verified", message: undefined });
    if (input.status === "transferred" ? sheet.assignment?.id === input.assignment_id : sheet.assignment?.id !== input.assignment_id || sheet.assignment.status !== input.status || sheet.assignment.status_version !== entry.receipt!.status_version) throw Error("حُفظ الطلب الأصلي؛ حالة الخطة الحالية تغيّرت لاحقًا. حدّث الاستمارة لمراجعتها");
  } catch (error) {
    assertCurrent(); const current = assignmentStateEntries().find(e => e.id === id) ?? entry;
    if (current.status !== "verified") write(own, { ...current, status: current.receipt ? "committed" : [400, 403, 409].includes((error as { status?: number }).status ?? 0) ? "conflict" : "pending", message: error instanceof Error ? error.message : "لم يتأكد تغيير الحالة" });
    throw error;
  }
}
export function resumeAssignmentState(id: string): Promise<void> {
  const own = context(), key = own?.prefix + ":" + own?.token + ":" + id, existing = running.get(key); if (existing) return existing;
  const pending = execute(id).finally(() => { if (running.get(key) === pending) running.delete(key); }); running.set(key, pending); return pending;
}
export async function setAssignmentState(student: string, assignment: string, status: "active" | "frozen" | "transferred", observed: AssignmentStateSnapshot) {
  const own = context(); if (!own || !assignment || !observed.version || !["active", "frozen"].includes(observed.status)) throw Error("حدّث الاستمارة لتأكيد هوية التعيين وإصدار حالته؛ لم يبدأ طلب");
  const same = assignmentStateEntries().filter(e => e.status !== "archived" && JSON.parse(e.body).assignment_id === assignment && JSON.parse(e.body).expected_status_version === observed.version);
  if (same.some(e => JSON.parse(e.body).status !== status)) throw Error("يوجد طلب مختلف محفوظ لإصدار حالة الخطة؛ راجعه أولًا");
  if (same.length) return resumeAssignmentState(same[0].id);
  if (assignmentStateEntries().some(e => !["verified", "archived"].includes(e.status) && JSON.parse(e.body).assignment_id === assignment)) throw Error("يوجد طلب حالة خطة لم يُحسم؛ استعده أولًا");
  const id = crypto.randomUUID(), entry: AssignmentStateEntry = { id, status: "pending", body: JSON.stringify({ student_id: student, assignment_id: assignment, status, expected_status: observed.status, expected_status_version: observed.version, operation_id: id, assignment_state_protocol: 1 }) };
  write(own, entry); return resumeAssignmentState(id);
}
export function archiveAssignmentState(id: string) { const own = context(), entry = assignmentStateEntries().find(e => e.id === id); if (own && entry?.status === "conflict") write(own, { ...entry, status: "archived" }); }
