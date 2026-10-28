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
  if (idx < 0) return;

  const applyActions = (n: Notification, extra: TransferActionRecord): Notification => {
    const td = n.transferData;
    if (!td) return n;
    return {
      ...n,
      transferData: {
        ...td,
        actions: [...(td.actions ?? []), extra],
      },
    };
  };

  list[idx] = applyActions(list[idx], action);
  if(finalPatch) list[idx]={...list[idx],...finalPatch};

  const rootId = list[idx].transferData?.rootTransferId;
  if (rootId && rootId !== notificationId) {
    const rootIdx = list.findIndex((n) => n.id === rootId);
    if (rootIdx >= 0) {
      list[rootIdx] = applyActions(list[rootIdx], action);
    }
  }

  saveNotifications(list);
}

/** Root routing and recipient creation are one shared operation, with a stable recipient ID. */
export function forwardTransferRecord(root: Notification, status: "to_secretary"|"to_supervisor", recipient: Omit<Notification,"id"|"createdAt"|"read">): void {
  const list=loadNotifications();const index=list.findIndex(n=>n.id===root.id);
  if(index<0)throw new Error("التحويل الأصلي غير موجود؛ حدّث القائمة");
  const id=`forward-${root.id}-${recipient.targetRole}`;
  list[index]={...list[index],transferStatus:status,read:true};
  if(!list.some(n=>n.id===id))list.push({...recipient,id,createdAt:new Date().toISOString(),read:false});
  saveNotifications(list);
}
