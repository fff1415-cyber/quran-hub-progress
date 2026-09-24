import { useCallback, useMemo, useState } from "react";
import {
  loadNotifications, loadSardQueue, countTransfersForRole, loadGeneralNotificationsForManager,
} from "@/lib/mock-data";
import { useInboxRefresh } from "@/hooks/use-inbox-refresh";
import { ManagerNotificationsPanel } from "@/components/role-workspace/ManagerNotificationsPanel";
import { ManagerSubTabs } from "@/components/role-workspace/ManagerSubTabs";
import { ManagerPendingTransfersPanel } from "@/components/role-workspace/manager-inbox/ManagerPendingTransfersPanel";
import { ManagerStrugglingPanel } from "@/components/role-workspace/manager-inbox/ManagerStrugglingPanel";
import { ManagerFailedFinalPanel } from "@/components/role-workspace/manager-inbox/ManagerFailedFinalPanel";
import { ManagerViolationHistoryPanel } from "@/components/role-workspace/manager-inbox/ManagerViolationHistoryPanel";
import {
  Bell, Send, AlertCircle, AlertTriangle, ScrollText,
} from "lucide-react";

type Props = {
  section: string;
  onSectionChange: (id: string) => void;
};

export function ManagerInboxPanel({ section, onSectionChange }: Props) {
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  useInboxRefresh(reload);

  const pendingTransfers = countTransfersForRole("manager");
  const struggling = loadNotifications().filter(
    (n) => n.type === "transfer" && n.transferStatus === "struggling" && !n.targetRole,
  );
  const failedFinal = loadSardQueue().filter((q) => q.status === "final_failed");
  const historyCount = loadNotifications().filter(
    (n) => n.type === "transfer" && n.transferData && !n.targetRole,
  ).length;
  const generalUnread = loadGeneralNotificationsForManager();

  const tabs = useMemo(
    () => [
      {
        id: "pending",
        label: "بانتظار الإجراء",
        icon: Send,
        badge: pendingTransfers || undefined,
        content: <ManagerPendingTransfersPanel />,
      },
      {
        id: "struggling",
        label: "المتعثرون",
        icon: AlertCircle,
        badge: struggling.length || undefined,
        content: <ManagerStrugglingPanel />,
      },
      {
        id: "failed",
        label: "راسبون نهائياً",
        icon: AlertTriangle,
        badge: failedFinal.length || undefined,
        content: <ManagerFailedFinalPanel />,
      },
      {
        id: "history",
        label: "السجل",
        icon: ScrollText,
        badge: historyCount || undefined,
        content: <ManagerViolationHistoryPanel />,
      },
      {
        id: "notifications",
        label: "الإشعارات",
        icon: Bell,
        badge: generalUnread.length || undefined,
        content: <ManagerNotificationsPanel />,
      },
    ],
    [pendingTransfers, struggling.length, failedFinal.length, historyCount, generalUnread.length, tick],
  );

  const activeSection = section === "transfers" ? "pending" : section;

  return (
    <ManagerSubTabs tabs={tabs} value={activeSection} onValueChange={onSectionChange} />
  );
}
