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

  const rootId = list[idx].transferData?.rootTransferId;
  if (rootId && rootId !== notificationId) {
    const rootIdx = list.findIndex((n) => n.id === rootId);
    if (rootIdx >= 0) {
      list[rootIdx] = applyActions(list[rootIdx], action);
    }
  }

  saveNotifications(list);
}

export async function syncNotificationsToCloud(): Promise<void> {
  try {
    const { pushAppState } = await import("@/lib/cloud-sync");
    await pushAppState("notifications", loadNotifications());
  } catch {
    /* caller shows toast */
  }
}
