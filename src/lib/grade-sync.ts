import { assertGradeSnapshot, GradeOutbox } from "./grade-outbox";
import type { GradePacket, GradeSnapshot, PlanEffect } from "./grade-outbox";
import type { GradesStore } from "./mock-data";
import { decodeAuthTokenPayload, getToken } from "./auth-session";
import { secureGradeSnapshot, secureGradeOperation } from "./secure-data.functions";
export const GRADE_SAVE_EVENT = "qhp-grade-save-status";
let localSaveError: { scope: string; message: string } | null = null;
const snapshots = new Map<string, GradeSnapshot>();
const checkedSnapshotStorage = new Set<string>();
function openGradeSnapshots(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("qhp-confirmed-grade-snapshots", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("snapshots");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("تعذّر فتح مخزن نسخة الدرجات في هذا المتصفح"));
  });
}
async function restoreGradeSnapshot(key: string, cid: number): Promise<void> {
  if (typeof indexedDB === "undefined" || checkedSnapshotStorage.has(key)) return;
  let database: IDBDatabase | undefined;
  try {
    database = await openGradeSnapshots();
    const transaction = database.transaction("snapshots", "readonly");
    const stored = await new Promise<GradeSnapshot | undefined>((resolve, reject) => {
      const request = transaction.objectStore("snapshots").get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (stored?.context_complex_id === cid) {
      assertGradeSnapshot(stored);
      snapshots.set(key, stored);
    }
  } catch (error) {
    // Browsers can block IndexedDB independently of the existing local cache.
    console.warn("Confirmed grade cache could not be read from IndexedDB:", error);
  } finally {
    checkedSnapshotStorage.add(key);
    database?.close();
  }
}
async function persistGradeSnapshot(key: string, snapshot: GradeSnapshot): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const database = await openGradeSnapshots();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("snapshots", "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
      transaction.objectStore("snapshots").put(snapshot, key);
    });
  } finally { database.close(); }
}
function notify() { if (typeof window !== "undefined") { window.dispatchEvent(new Event(GRADE_SAVE_EVENT)); window.dispatchEvent(new Event("qs-grades-changed")); } }
function identity(): { scope: string; cid: number; token: string } | null {
  const token = getToken(), auth = decodeAuthTokenPayload(token);
  if (!token || !auth?.complexId || !auth.role) return null;
  return { scope: JSON.stringify([auth.complexId, auth.role, auth.accountId ?? [auth.halaqaId, auth.name], auth.studentId]), cid: auth.complexId, token };
}
export function currentGradeOutbox(): GradeOutbox | null {
  const session = identity();
  if (!session || typeof window === "undefined") return null;
  return new GradeOutbox(localStorage, session.scope, () => crypto.randomUUID(), notify,
    typeof indexedDB === "undefined" ? undefined : snapshots);
}
export function gradeView(fallback: GradesStore): GradesStore { return currentGradeOutbox()?.view(fallback) ?? fallback; }
export function gradeLocalSaveError(): string { return localSaveError !== null && localSaveError.scope === (identity()?.scope ?? "unavailable") ? localSaveError.message : ""; }
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
  localStorage.setItem(box.prefix + "plan_assignments", JSON.stringify(Object.fromEntries(rows.map(row => [row.student_id, row.assignment_id ?? ""]))));
}
export function confirmedGradePlanAssignment(student: string): string {
  const box = currentGradeOutbox(); if (!box) return "";
  return JSON.parse(localStorage.getItem(box.prefix + "plan_assignments") ?? "{}")[student] ?? "";
}
let serial: Promise<unknown> = Promise.resolve();
function enqueue<T>(run: () => Promise<T>): Promise<T> { const next = serial.then(run, run); serial = next.catch(() => undefined); return next; }
async function read(session: NonNullable<ReturnType<typeof identity>>, box: GradeOutbox) {
  const key = box.prefix + "snapshot";
  await restoreGradeSnapshot(key, session.cid);
  if (identity()?.scope !== session.scope || getToken() !== session.token) throw Error("تغيّرت الجلسة؛ لم تُطبّق استجابة حساب سابق");
  const snapshot = await secureGradeSnapshot(session.token, box.snapshot()?.cursor);
  if (identity()?.scope !== session.scope || getToken() !== session.token) throw Error("تغيّرت الجلسة؛ لم تُطبّق استجابة حساب سابق");
  if (snapshot.context_complex_id !== session.cid) throw Error("استجابة الحفظ لا تطابق المجمع الحالي");
  if ("unchanged" in snapshot) {
    if (snapshot.protocol !== 1 || snapshot.cursor !== box.snapshot()?.cursor) throw Error("لم يؤكد الخادم نسخة الدرجات");
    if (box.drafts().some(d => d.status === "confirmed" && !d.observed)) box.accept(box.snapshot()!);
    return box.view({});
  }
  assertGradeSnapshot(snapshot);
  if (!snapshots.has(key)) {
    try { box.accept(snapshot); return box.view({}); }
    catch (error) {
      if (typeof indexedDB === "undefined" || !(error instanceof DOMException) || error.name !== "QuotaExceededError") throw error;
    }
  }
  await persistGradeSnapshot(key, snapshot);
  if (identity()?.scope !== session.scope || getToken() !== session.token) throw Error("تغيّرت الجلسة؛ لم تُطبّق استجابة حساب سابق");
  snapshots.set(key, snapshot);
  box.accept(snapshot); return box.view({});
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
    try { await box.flush((packet: GradePacket) => secureGradeOperation(session.token, packet), () => identity()?.scope === session.scope && getToken() === session.token); }
    finally { notify(); }
    return read(session, box);
  });
}
