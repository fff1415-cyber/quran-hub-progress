import { GradeOutbox } from "./grade-outbox";
import type { GradePacket, PlanEffect, GradeStoreKey } from "./grade-outbox";
import type { GradesStore } from "./mock-data";
import { decodeAuthTokenPayload, getToken } from "./auth-session";
import { secureGradeSnapshot, secureGradeOperation } from "./secure-data.functions";
export const GRADE_SAVE_EVENT = "qhp-grade-save-status";
let localSaveError: { scope: string; message: string } | null = null;
const storeEvents = { grades: "qs-grades-changed", scientific_grades: "qs-scientific-grades-changed", weekly_tests: "qshatawi:weekly-tests-changed" };
function notify(key: GradeStoreKey = "grades") { if (typeof window !== "undefined") { window.dispatchEvent(new Event(GRADE_SAVE_EVENT)); window.dispatchEvent(new Event(storeEvents[key])); } }
function identity(): { scope: string; cid: number; token: string } | null {
  const token = getToken(), auth = decodeAuthTokenPayload(token);
  if (!token || !auth?.complexId || !auth.role) return null;
  return { scope: JSON.stringify([auth.complexId, auth.role, auth.accountId ?? [auth.halaqaId, auth.name], auth.studentId]), cid: auth.complexId, token };
}
export function currentSharedOutbox<T extends object = GradesStore>(key: GradeStoreKey): GradeOutbox<T> | null { const session = identity(); return session && typeof window !== "undefined" ? new GradeOutbox<T>(localStorage, session.scope, () => crypto.randomUUID(), () => notify(key), key) : null; }
export function currentGradeOutbox(): GradeOutbox | null { return currentSharedOutbox("grades"); }
export function sharedGradeView<T extends object>(key: GradeStoreKey, fallback: T): T { return currentSharedOutbox<T>(key)?.view(fallback) ?? fallback; }
export function assertSharedGradePeriod(key: GradeStoreKey, semester: string | null | undefined): void {
  const snapshot = currentSharedOutbox(key)?.snapshot();
  if (snapshot?.semester_scoped && (semester === undefined || !snapshot.calendar_context.known || snapshot.calendar_context.active_semester_id !== semester)) throw new Error("تغيّر الفصل؛ أعد تحميل الشاشة قبل التسجيل. لم يُرسل التعديل إلى فصل آخر");
}
export function recordSharedGradeEdit<T extends object>(key: GradeStoreKey, before: T, after: T): boolean { return recordEdit(key, before, after); }
export function recordWeeklyResult(student: string, week: number, kind: "muraja" | "rabt", index: number, result: "" | "pass" | "fail", semester: string | null) {
 const box = currentSharedOutbox("weekly_tests"); if (!box) throw Error("يلزم تسجيل الدخول لتأكيد الاختبار");
 try { box.editWeeklyResult(student, week, kind, index, result, semester); localSaveError = null; }
 catch (error) { localSaveError = { scope: identity()!.scope, message: error instanceof Error ? error.message : "لم تُحفظ المسودة" }; notify("weekly_tests"); throw error; }
}
export function gradeView(fallback: GradesStore): GradesStore { return currentGradeOutbox()?.view(fallback) ?? fallback; }
export function gradeLocalSaveError(): string { return localSaveError !== null && localSaveError.scope === (identity()?.scope ?? "unavailable") ? localSaveError.message : ""; }
export function recordGradeEdit(before: GradesStore, after: GradesStore, plan?: PlanEffect): boolean {
  return recordEdit("grades", before, after, plan);
}
function recordEdit<T extends object>(key: GradeStoreKey, before: T, after: T, plan?: PlanEffect): boolean {
  const box = currentSharedOutbox<T>(key);
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
  localStorage.setItem(box.prefix + "plan_assignments", JSON.stringify(Object.fromEntries(rows.map(row => [row.student_id, row.assignment_id ?? ""]))));
}
export function confirmedGradePlanAssignment(student: string): string {
  const box = currentGradeOutbox(); if (!box) return "";
  return JSON.parse(localStorage.getItem(box.prefix + "plan_assignments") ?? "{}")[student] ?? "";
}
let serial: Promise<unknown> = Promise.resolve();
function enqueue<T>(run: () => Promise<T>): Promise<T> { const next = serial.then(run, run); serial = next.catch(() => undefined); return next; }
async function read<T extends object>(session: NonNullable<ReturnType<typeof identity>>, box: GradeOutbox<T>, fallback: T) {
  const snapshot = await secureGradeSnapshot<T>(session.token, box.snapshot()?.cursor, box.storeKey);
  if (identity()?.scope !== session.scope || getToken() !== session.token) throw Error("تغيّرت الجلسة؛ لم تُطبّق استجابة حساب سابق");
  if (snapshot.context_complex_id !== session.cid) throw Error("استجابة الحفظ لا تطابق المجمع الحالي");
  if ("unchanged" in snapshot) {
    if (snapshot.protocol !== 1 || snapshot.cursor !== box.snapshot()?.cursor) throw Error("لم يؤكد الخادم نسخة الدرجات");
    if (box.drafts().some(d => d.status === "confirmed" && !d.observed)) box.accept(box.snapshot()!);
    return box.view(fallback);
  }
  box.accept(snapshot); return box.view(fallback);
}
export function refreshConfirmedGrades(): Promise<GradesStore> {
  const session = identity(), box = currentGradeOutbox();
  if (!session || !box) return Promise.reject(Error("يلزم تسجيل الدخول لتأكيد الدرجات"));
  return enqueue(() => read(session, box, {}));
}
export function flushConfirmedGrades(): Promise<GradesStore> {
  const session = identity(), box = currentGradeOutbox();
  if (!session || !box) return Promise.reject(Error("يلزم تسجيل الدخول لتأكيد الحفظ"));
  return enqueue(async () => {
    try { await box.flush((packet: GradePacket) => secureGradeOperation(session.token, packet), () => identity()?.scope === session.scope && getToken() === session.token); }
    finally { notify(); }
    return read(session, box, {});
  });
}

export function refreshSharedGrades<T extends object>(key: GradeStoreKey, fallback: T): Promise<T> {
 const session = identity(), box = currentSharedOutbox<T>(key);
 if (!session || !box) return Promise.reject(Error("يلزم تسجيل الدخول لتأكيد البيانات"));
 return enqueue(() => read(session, box, fallback));
}
export function flushSharedGrades<T extends object>(key: GradeStoreKey, fallback: T): Promise<T> {
 const session = identity(), box = currentSharedOutbox<T>(key);
 if (!session || !box) return Promise.reject(Error("يلزم تسجيل الدخول لتأكيد الحفظ"));
 return enqueue(async () => {
  try { await box.flush(packet => secureGradeOperation(session.token, packet), () => identity()?.scope === session.scope && getToken() === session.token); }
  finally { notify(key); }
  return read(session, box, fallback);
 });
}
