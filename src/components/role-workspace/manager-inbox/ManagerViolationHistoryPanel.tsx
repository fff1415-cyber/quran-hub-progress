import { useCallback, useMemo, useState } from "react";
import { loadStudents, loadHalaqat, loadNotifications, type Notification } from "@/lib/mock-data";
import { transferActionRoleLabel } from "@/lib/transfer-actions";
import { TransferActionsList } from "@/components/role-workspace/TransferActionForm";
import { InboxItemActions } from "@/components/role-workspace/InboxItemActions";
import { transferStatusLabel } from "@/lib/student-profile-data";
import { useInboxRefresh } from "@/hooks/use-inbox-refresh";
import { ScrollText } from "lucide-react";

export function ManagerViolationHistoryPanel() {
  const students = loadStudents();
  const halaqat = loadHalaqat();
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  useInboxRefresh(reload);

  const violationHistory = useMemo(
    () => loadNotifications()
      .filter((n) => n.type === "transfer" && n.transferData && !n.targetRole)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [tick],
  );

  return (
    <section className="glass-card rounded-2xl p-6">
      <h2 className="text-lg font-bold text-primary mb-3 flex items-center gap-2">
        <ScrollText className="w-5 h-5" /> سجل المخالفات والإجراءات
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        أرشيف تحويلات المعلمين مع الإجراءات المسجّلة
      </p>
      {violationHistory.length === 0 ? (
        <p className="text-muted-foreground text-center py-8 text-sm">لا يوجد سجل</p>
      ) : (
        <div className="space-y-3 max-h-[560px] overflow-y-auto">
          {violationHistory.map((n: Notification) => {
            const td = n.transferData;
            if (!td) return null;
            const s = students.find((x) => x.id === td.studentId);
            const h = halaqat.find((x) => x.id === td.halaqaId);
            return (
              <div key={n.id} className="rounded-xl border border-border p-3 text-sm">
                <div className="flex justify-between flex-wrap gap-2 mb-1">
                  <span className="font-bold">{s?.name ?? "—"} · {h?.name ?? "—"}</span>
                  <InboxItemActions id={n.id} onDone={reload} showDismiss={false} />
                </div>
                <p className="text-xs text-muted-foreground mb-1">
                  {new Date(n.createdAt).toLocaleString("ar-SA")} · {transferStatusLabel(n.transferStatus ?? "pending")}
                </p>
                <p className="text-xs text-muted-foreground mb-1">السبب: {td.reason}</p>
                <TransferActionsList
                  actions={(td.actions ?? []).map((a) => ({
                    ...a,
                    role: transferActionRoleLabel(a.role),
                  }))}
                />
                {(td.actions ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground">بانتظار إجراء</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
