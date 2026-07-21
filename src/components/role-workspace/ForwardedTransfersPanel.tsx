import { useEffect, useState } from "react";
import {
  loadStudents, loadHalaqat, loadGrades, loadNotifications,
  updateNotification, studentStats, type Notification,
} from "@/lib/mock-data";
import type { TransferTargetRole } from "@/lib/mock-data";
import { weekLabel } from "@/lib/arabic-numbers";
import { TabBadge } from "@/components/role-workspace/RoleShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

const ROLE_LABEL: Record<TransferTargetRole, string> = {
  manager: "المدير",
  secretary: "السكرتير",
  supervisor: "المشرف التعليمي",
};

function Stat({ label, value, tone }: { label: string; value: number; tone: "destructive" | "warning" | "primary" | "success" }) {
  const colors: Record<string, string> = {
    destructive: "bg-destructive/10 text-destructive border-destructive/30",
    warning: "bg-warning/10 text-warning border-warning/30",
    primary: "bg-primary/10 text-primary border-primary/30",
    success: "bg-success/10 text-success border-success/30",
  };
  return (
    <div className={`rounded-lg border p-2 text-center text-xs ${colors[tone]}`}>
      <div className="text-base font-bold">{value}</div>
      <div className="opacity-80">{label}</div>
    </div>
  );
}

export function ForwardedTransfersPanel({ role }: { role: "secretary" | "supervisor" }) {
  const students = loadStudents();
  const halaqat = loadHalaqat();
  const grades = loadGrades();
  const [items, setItems] = useState<Notification[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = () => {
    setItems(
      loadNotifications().filter(
        (n) => n.type === "transfer" && n.targetRole === role && !n.read && n.transferStatus !== "closed",
      ),
    );
  };

  useEffect(() => { refresh(); }, [role]);

  const acknowledge = async (n: Notification) => {
    if (!n.transferData || busyId) return;
    setBusyId(n.id);
    try {
      updateNotification(n.id, { read: true, transferStatus: "closed" });
      refresh();
      toast.success("تم استلام الحالة وإغلاقها");
      try {
        const { pushAppState } = await import("@/lib/cloud-sync");
        await pushAppState("notifications", loadNotifications());
      } catch {
        toast.warning("تم التحديث محلياً — تعذّرت المزامنة");
      }
    } catch (e) {
      refresh();
      toast.error(e instanceof Error ? e.message : "فشل التحديث");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="glass-card border-warning/20 shadow-none">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2 text-warning">
          <Send className="w-5 h-5" />
          تحويلات من الإدارة
          <TabBadge count={items.length} />
        </CardTitle>
        <CardDescription>
          حالات أحالها المدير إلى {ROLE_LABEL[role]} — راجع السبب ثم أكّد الاستلام
        </CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-muted-foreground text-center py-10 text-sm">لا توجد تحويلات معلّقة</p>
        ) : (
          <div className="space-y-3">
            {items.map((n) => {
              const td = n.transferData!;
              const s = students.find((x) => x.id === td.studentId);
              const h = halaqat.find((x) => x.id === td.halaqaId);
              const st = studentStats(td.studentId, grades);
              const processing = busyId === n.id;
              return (
                <div key={n.id} className="rounded-xl border border-warning/30 bg-warning/5 p-4">
                  <div className="flex items-start justify-between flex-wrap gap-2 mb-2">
                    <div>
                      <div className="font-bold">{s?.name || "—"}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {h?.name} · {weekLabel(td.week)}
                        {td.forwardedBy ? ` · من المدير: ${td.forwardedBy}` : td.fromName ? ` · من: ${td.fromName}` : ""}
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground">{new Date(n.createdAt).toLocaleString("ar")}</div>
                  </div>
                  <div className="rounded-lg bg-background/40 border border-border p-2 mb-3 text-sm">
                    <span className="text-xs text-muted-foreground">السبب: </span>{td.reason}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                    <Stat label="غياب" value={st.absentCount} tone="destructive" />
                    <Stat label="تأخر" value={st.lateCount} tone="warning" />
                    <Stat label="استئذان" value={st.excusedCount} tone="primary" />
                    <Stat label="حفظ" value={st.hifzCount} tone="success" />
                  </div>
                  <button
                    type="button"
                    disabled={processing}
                    onClick={() => void acknowledge(n)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-success/15 text-success border border-success/30 text-sm font-bold disabled:opacity-50"
                  >
                    {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    تم الاستلام
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
