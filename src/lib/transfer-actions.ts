import {
  loadNotifications,
  saveNotifications,
  type Notification,
  type TransferActionRecord,
  type TransferActionRole,
} from "@/lib/mock-data";

export const TRANSFER_ACTION_ROLE_LABELS: Record<TransferActionRole, string> = {
  manager: "المدير",
  secretary: "السكرتير",
  supervisor: "المشرف العلمي",
};

export function transferActionRoleLabel(role: TransferActionRole): string {
  return TRANSFER_ACTION_ROLE_LABELS[role];
}

/** Append action to a notification and mirror it on the root teacher transfer when linked. */
export function appendTransferAction(
  notificationId: string,
  action: TransferActionRecord,
  finalPatch?: Partial<Pick<Notification, "read" | "transferStatus">>,
): void {
  const list = loadNotifications();
  const idx = list.findIndex((n) => n.id === notificationId);
  if (idx < 0 || !list[idx].transferData) throw new Error("التحويل غير موجود؛ حدّث القائمة");

  const applyActions = (n: Notification, extra: TransferActionRecord): Notification => {
    const td = n.transferData;
    if (!td) return n;
    if (td.actions?.some(a => a.at === extra.at && a.role === extra.role && a.byName === extra.byName && a.text === extra.text)) return n;
    return {
      ...n,
      transferData: {
        ...td,
        actions: [...(td.actions ?? []), extra],
      },
    };
  };

  list[idx] = applyActions(list[idx], action);
  if (finalPatch) list[idx] = { ...list[idx], ...finalPatch };

  const rootId = list[idx].transferData?.rootTransferId;
  if (rootId && rootId !== notificationId) {
    const rootIdx = list.findIndex((n) => n.id === rootId);
    if (rootIdx >= 0) {
      list[rootIdx] = applyActions(list[rootIdx], action);
    }
  }

  saveNotifications(list);
}

/** One local write keeps the original routing and its recipient together; no shared transport. */
export function forwardTransferRecord(
  root: Notification,
  status: "to_secretary" | "to_supervisor",
  recipient: Omit<Notification, "id" | "createdAt" | "read">,
): void {
  const list = loadNotifications();
  const index = list.findIndex(n => n.id === root.id);
  const current = list[index];
  if (!current || current.type !== "transfer" || !current.transferData) throw new Error("التحويل الأصلي غير موجود؛ حدّث القائمة");
  const role = status === "to_secretary" ? "secretary" : "supervisor";
  if (recipient.targetRole !== role || recipient.transferData?.rootTransferId !== current.id) throw new Error("تعذّر تأكيد وجهة التحويل");
  if (current.transferStatus !== status && (current.read || (current.transferStatus && current.transferStatus !== "pending"))) throw new Error("تغيّرت حالة التحويل؛ حدّث القائمة قبل إعادة توجيهه");
  const linked = list.filter(n => n.type === "transfer" && n.transferData?.rootTransferId === current.id && n.targetRole === role);
  if (linked.length > 1) throw new Error("توجد نسخ تحويل متعددة؛ بقيت محفوظة للمراجعة");
  const id = `forward-${current.id}-${role}`;
  if (!linked.length && list.some(n => n.id === id)) throw new Error("تعارض معرّف التحويل؛ بقيت السجلات محفوظة");
  if (linked.length && current.transferStatus === status && current.read) return;
  list[index] = { ...current, transferStatus: status, read: true };
  if (!linked.length) list.unshift({
    ...recipient, id, createdAt: new Date().toISOString(), read: false,
    transferData: { ...current.transferData, forwardedBy: recipient.transferData?.forwardedBy, rootTransferId: current.id },
  });
  saveNotifications(list);
}
