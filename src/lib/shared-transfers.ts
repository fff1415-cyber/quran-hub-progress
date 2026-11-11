import { decodeAuthTokenPayload, getToken } from "./auth-session";
import { TransferOutbox, type TransferCommand, type TransferSnapshot } from "./transfer-outbox";
import { secureListTransfers, secureTransferOperation } from "./secure-data.functions";
import type { Notification } from "./mock-data";

export const TRANSFER_SAVE_EVENT = "qhp-transfer-save-status";
function notify() { if (typeof window !== "undefined") { window.dispatchEvent(new Event(TRANSFER_SAVE_EVENT)); window.dispatchEvent(new Event("qshatawi:notifications-changed")); } }
function session() {
  const token = getToken(), auth = decodeAuthTokenPayload(token);
  if (!token || !auth?.complexId || !auth.role || !["teacher", "assistant", "manager", "secretary", "supervisor"].includes(auth.role)) return null;
  const scope = JSON.stringify([auth.complexId, auth.role, auth.accountId ?? auth.taskActorId ?? [auth.halaqaId, auth.name], auth.halaqaId]);
  return { token, cid: auth.complexId, scope };
}
let localError: { scope: string; message: string } | null = null;
export function currentTransferOutbox() { const s = session(); return s && typeof window !== "undefined" ? new TransferOutbox(localStorage, s.scope, () => crypto.randomUUID(), notify) : null; }
export function transferSaveError() { return localError?.scope === session()?.scope ? localError?.message ?? "" : ""; }
export function sharedTransferNotifications(): Notification[] {
  const box = currentTransferOutbox(); if (!box) return [];
  const marks: Record<string, { read?: boolean; hidden?: boolean }> = JSON.parse(localStorage.getItem(box.prefix + "local_marks") ?? "{}");
  return (box.snapshot()?.notifications ?? []).filter(n => !marks[n.id]?.hidden).map(n => ({ ...n, read: n.read || marks[n.id]?.read === true }));
}
export function saveSharedTransferLocalMarks(list: Notification[]) {
  const box = currentTransferOutbox(); if (!box?.snapshot()) return;
  const marks: Record<string, { read?: boolean; hidden?: boolean }> = JSON.parse(localStorage.getItem(box.prefix + "local_marks") ?? "{}");
  for (const row of box.snapshot()!.notifications) {
    const value = list.find(n => n.id === row.id);
    if (!value) marks[row.id] = { ...marks[row.id], hidden: true };
    else if (value.read) marks[row.id] = { ...marks[row.id], read: true };
  }
  localStorage.setItem(box.prefix + "local_marks", JSON.stringify(marks));
}
export function isSharedTransfer(id: string): boolean { return !!currentTransferOutbox()?.snapshot()?.notifications.some(n => n.id === id && n.sharedTransferId); }
let serial: Promise<unknown> = Promise.resolve();
function enqueue<T>(run: () => Promise<T>): Promise<T> { const next = serial.then(run, run); serial = next.catch(() => undefined); return next; }
async function read(s: NonNullable<ReturnType<typeof session>>, box: TransferOutbox) {
  const snapshot: TransferSnapshot = await secureListTransfers(s.token);
  if (getToken() !== s.token || session()?.scope !== s.scope) throw Error("تغيّرت الجلسة؛ لم تُعرض تحويلات حساب سابق");
  localError = null;
  box.accept(snapshot, s.cid); return snapshot;
}
export function refreshSharedTransfers() {
  const s = session(), box = currentTransferOutbox(); if (!s || !box) return Promise.resolve(null);
  return enqueue(() => read(s, box));
}
export function flushSharedTransfers() {
  const s = session(), box = currentTransferOutbox(); if (!s || !box) return Promise.reject(Error("يلزم تسجيل الدخول لتأكيد التحويل"));
  return enqueue(async () => {
    await box.flush(packet => secureTransferOperation(s.token, packet), () => getToken() === s.token && session()?.scope === s.scope);
    // A failed read after a valid receipt must not make a successful create look unsent and invite duplication.
    await read(s, box).catch(error => { localError = { scope: s.scope, message: error instanceof Error ? error.message : "تعذّر تحديث قائمة التحويلات" }; notify(); });
  });
}
function queue(action: (box: TransferOutbox) => string): string {
  const s = session(), box = currentTransferOutbox(); if (!s || !box) throw Error("يلزم تثبيت هوية جلسة التحويل");
  try { const id = action(box); localError = null; return id; }
  catch (error) { localError = { scope: s.scope, message: error instanceof Error ? error.message : "تعذّر حفظ المسودة على الجهاز؛ لم تُرسل" }; notify(); throw error; }
}
async function confirm(id: string) {
  await flushSharedTransfers(); const draft = currentTransferOutbox()?.drafts().find(d => d.packet.operation_id === id);
  if (draft?.status !== "confirmed") throw Error(draft?.message ?? "لم يؤكد الخادم الإجراء؛ بقيت المسودة للمراجعة");
}
export async function createSharedTransfer(student: string, week: number, reason: string) { const id = queue(box => box.create(student, week, reason)); await confirm(id); }
export async function changeSharedTransfer(notification: string, change: { type: "forward"; target_role: "secretary" | "supervisor" } | { type: "action"; text: string; status?: "closed" | "struggling" | null }) {
  const id = queue(box => box.command(notification, change)); await confirm(id);
}
