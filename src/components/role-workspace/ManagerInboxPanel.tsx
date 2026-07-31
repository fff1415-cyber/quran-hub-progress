import { useMemo } from "react";
import { loadNotifications, loadSardQueue, countTransfersForRole } from "@/lib/mock-data";
import { ManagerTransfersPanel } from "@/components/role-workspace/ManagerTransfersPanel";
import { ManagerNotificationsPanel } from "@/components/role-workspace/ManagerNotificationsPanel";
import { ManagerSubTabs } from "@/components/role-workspace/ManagerSubTabs";
import { Bell, Send } from "lucide-react";

type Props = {
  section: string;
  onSectionChange: (id: string) => void;
};

export function ManagerInboxPanel({ section, onSectionChange }: Props) {
  const queue = loadSardQueue();
  const notifs = loadNotifications();
  const pendingTransfers = countTransfersForRole("manager");
  const struggling = notifs.filter((n) => n.type === "transfer" && n.transferStatus === "struggling");
  const failedFinal = queue.filter((q) => q.status === "final_failed");
  const unread = notifs.filter((n) => !n.read);

  const tabs = useMemo(
    () => [
      {
        id: "transfers",
        label: "التحويلات",
        icon: Send,
        badge: pendingTransfers + struggling.length + failedFinal.length,
        content: <ManagerTransfersPanel />,
      },
      {
        id: "notifications",
        label: "الإشعارات",
        icon: Bell,
        badge: unread.length,
        content: <ManagerNotificationsPanel />,
      },
    ],
    [pendingTransfers, struggling.length, failedFinal.length, unread.length],
  );

  return (
    <ManagerSubTabs tabs={tabs} value={section} onValueChange={onSectionChange} />
  );
}
