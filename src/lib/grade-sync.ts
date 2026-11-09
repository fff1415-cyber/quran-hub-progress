import { cancelsDayGrade, GradeOutbox } from "./grade-outbox";
import type { GradePacket, PlanEffect } from "./grade-outbox";
import type { GradesStore } from "./mock-data";
import { decodeAuthTokenPayload, getToken } from "./auth-session";
import { secureGradeSnapshot, secureGradeOperation } from "./secure-data.functions";
export const GRADE_SAVE_EVENT = "qhp-grade-save-status";
let localSaveError: { scope: string; message: string } | null = null;
const planAssignments = new Map<string, Record<string, string>>();
function notify() { if (typeof window !== "undefined") { window.dispatchEvent(new Event(GRADE_SAVE_EVENT)); window.dispatchEvent(new Event("qs-grades-changed")); } }
function identity(): { scope: string; cid: number; token: string } | null {
  const token = getToken(), auth = decodeAuthTokenPayload(token);
  if (!token || !auth?.complexId || !auth.role) return null;
  return { scope: JSON.stringify([auth.complexId, auth.role, auth.accountId ?? [auth.halaqaId, auth.name], auth.studentId]), cid: auth.complexId, token };
}
export function currentGradeOutbox(): GradeOutbox | null { const session = identity(); return session && typeof window !== "undefined" ? new GradeOutbox(localStorage, session.scope, () => crypto.randomUUID(), notify) : null; }
export function gradeView(fallback: GradesStore): GradesStore { return currentGradeOutbox()?.view(fallback) ?? fallback; }
export function gradeLocalSaveError(): string {
  if (currentGradeOutbox()?.volatileDrafts().length) return "مسودة الدرجة بانتظار التخزين. أبقِ هذه الصفحة مفتوحة حتى يتأكد الحفظ، أو نزّل المسودة.";
  return localSaveError !== null && localSaveError.scope === (identity()?.scope ?? "unavailable") ? localSaveError.message : "";
}
export function recordGradeEdit(before: GradesStore, after: GradesStore, plan?: PlanEffect): boolean {
  const box = currentGradeOutbox();
  if (!box) {
    if (!getToken()) return false;
    const message = "تعذّر تأكيد هوية جلسة الحفظ؛ أعد تسجيل الدخول قبل تعديل الدرجات. لم يُرسل التعديل.";
    localSaveError = { scope: "unavailable", message }; notify(); throw Error(message);
  }
  try { box.edit(before, after, plan); localSaveError = null; return true; }
  catch (error) { localSaveError = { scope: identity()!.scope, message: "تعذّر حفظ المسودة على هذا الجهاز؛ لم يُرسل التعديل. وفّر مساحة أو تحقق من تخزين المتصفح ثم أعد التسجيل." }; notify(); throw error; }
}
export function rememberGradePlanAssignments(rows: { student_id: string; assignment_id?: string }[]) {
  const box = currentGradeOutbox(); if (!box) return;
  planAssignments.set(box.prefix, Object.fromEntries(rows.map(row => [row.student_id, row.assignment_id ?? ""])));
  localStorage.removeItem(box.prefix + "plan_assignments");
}
export function confirmedGradePlanAssignment(student: string): string {
  const box = currentGradeOutbox(); if (!box) return "";
  return (planAssignments.get(box.prefix) ?? JSON.parse(localStorage.getItem(box.prefix + "plan_assignments") ?? "{}"))[student] ?? "";
}
let serial: Promise<unknown> = Promise.resolve();
function enqueue<T>(run: () => Promise<T>): Promise<T> { const next = serial.then(run, run); serial = next.catch(() => undefined); return next; }
async function read(session: NonNullable<ReturnType<typeof identity>>, box: GradeOutbox) {
  await box.hydrate();
  const snapshot = await secureGradeSnapshot(session.token, box.snapshot()?.cursor);
  if (identity()?.scope !== session.scope || getToken() !== session.token) throw Error("تغيّرت الجلسة؛ لم تُطبّق استجابة حساب سابق");
  if (snapshot.context_complex_id !== session.cid) throw Error("استجابة الحفظ لا تطابق المجمع الحالي");
  if ("unchanged" in snapshot) {
    const cached = box.snapshot();
    if (snapshot.protocol !== 1 || !cached || snapshot.cursor !== cached.cursor) throw Error("لم يؤكد الخادم نسخة الدرجات");
    if (box.drafts().some(d => d.status === "confirmed" && !d.observed)) box.accept(cached);
    else box.reconcile(cached);
    return box.view({});
  }
  box.accept(snapshot);
  // Preparation and its scientific projection commit together. Read both before
  // refreshing the program totals; a failed read cannot undo the grade receipt.
  await import("./cloud-sync").then((cloud) => cloud.refreshScientificFromCloud(session.token)).catch(() => undefined);
  return box.view({});
}
export function refreshConfirmedGrades(): Promise<GradesStore> {
  const session = identity(), box = currentGradeOutbox();
  if (!session || !box) return Promise.reject(Error("يلزم تسجيل الدخول لتأكيد الدرجات"));
  return enqueue(() => read(session, box));
}
export function flushConfirmedGrades(): Promise<GradesStore> {
  const session = identity(), box = currentGradeOutbox();
  if (!session || !box) return Promise.reject(Error("يلزم تسجيل الدخول لتأكيد الحفظ"));
  return enqueue(async () => {
    await box.hydrate();
    const tracked = new Set(box.drafts().filter(d => d.status === "pending" && (d.packet.plan || cancelsDayGrade(d)))
      .map(d => d.packet.operation_id));
    try { await box.flush((packet: GradePacket) => secureGradeOperation(session.token, packet), () => identity()?.scope === session.scope && getToken() === session.token); }
    finally { notify(); }
    const view = await read(session, box);
    const rejected = box.drafts().find(d => tracked.has(d.packet.operation_id) && (d.status === "conflict" || d.status === "archived"));
    if (rejected) throw new Error(rejected.message || "لم يتأكد الحفظ؛ بقيت المسودة للمراجعة.");
    return view;
  });
}
