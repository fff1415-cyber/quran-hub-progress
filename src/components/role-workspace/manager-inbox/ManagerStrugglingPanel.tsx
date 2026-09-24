import { useCallback, useMemo, useState } from "react";
import { loadStudents, loadHalaqat, loadNotifications, type Notification } from "@/lib/mock-data";
import { transferActionRoleLabel } from "@/lib/transfer-actions";
import { TransferActionsList } from "@/components/role-workspace/TransferActionForm";
import { InboxItemActions } from "@/components/role-workspace/InboxItemActions";
import { useInboxRefresh } from "@/hooks/use-inbox-refresh";
import { AlertCircle } from "lucide-react";

export function ManagerStrugglingPanel() {
  const students = loadStudents();
  const halaqat = loadHalaqat();
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  useInboxRefresh(reload);

  const struggling = useMemo(
    () => loadNotifications().filter(
      (n) => n.type === "transfer" && n.transferStatus === "struggling" && !n.targetRole && n.transferData,
    ),
    [tick],
  );

  return (
    <section className="glass-card rounded-2xl p-6">
      <h2 className="text-lg font-bold text-destructive mb-3 flex items-center gap-2">
        <AlertCircle className="w-5 h-5" /> المتعثرون
      </h2>
      {struggling.length === 0 ? (
        <p className="text-muted-foreground text-center py-8 text-sm">لا يوجد متعثرون</p>
      ) : (
        <div className="space-y-3">
          {struggling.map((n: Notification) => {
            const td = n.transferData;
            if (!td) return null;
            const s = students.find((x) => x.id === td.studentId);
            const h = halaqat.find((x) => x.id === td.halaqaId);
            return (
              <div key={n.id} className="p-4 rounded-xl bg-destructive/5 border border-destructive/20 text-sm">
                <div className="flex justify-between flex-wrap gap-2 mb-2">
                  <span className="font-medium">{s?.name} · {h?.name}</span>
                  <InboxItemActions id={n.id} onDone={reload} showDismiss={false} />
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  {new Date(n.createdAt).toLocaleDateString("ar-SA")} · السبب: {td.reason}
                </p>
                <TransferActionsList
                  actions={(td.actions ?? []).map((a) => ({
                    ...a,
                    role: transferActionRoleLabel(a.role),
                  }))}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
