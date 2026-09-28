import { useCallback, useEffect, useMemo, useState } from "react";
import { listStudentFollowups, STUDENT_FOLLOWUPS_CHANGED } from "@/lib/student-followups";
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
  const [followupTransferCount, setFollowupTransferCount] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  useInboxRefresh(reload);
  useEffect(() => {
    let active = true;
    const refreshFollowups = async () => {
      try {
        const data = await listStudentFollowups();
        if (active) setFollowupTransferCount(data.items.filter((item) => item.status === "escalated").length);
      } catch { /* Keep the last count. */ }
    };
    void refreshFollowups();
    window.addEventListener(STUDENT_FOLLOWUPS_CHANGED, refreshFollowups);
    const interval = setInterval(() => void refreshFollowups(), 60_000);
    return () => { active = false; clearInterval(interval); window.removeEventListener(STUDENT_FOLLOWUPS_CHANGED, refreshFollowups); };
  }, []);

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
        badge: pendingTransfers + followupTransferCount || undefined,
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
    [pendingTransfers, followupTransferCount, struggling.length, failedFinal.length, historyCount, generalUnread.length, tick],
  );

  const activeSection = section === "transfers" ? "pending" : section;

  return (
    <ManagerSubTabs tabs={tabs} value={activeSection} onValueChange={onSectionChange} />
  );
}
