import { useEffect, useState } from "react";
import {
  loadStudents, loadHalaqat, loadGrades, loadNotifications,
  updateNotification, type Notification,
} from "@/lib/mock-data";
import { fetchActiveCalendar, type AcademicCalendar } from "@/lib/academic-context";
import { studentReportPercentages, formatOverallPercent } from "@/lib/semester-grading";
import type { TransferTargetRole } from "@/lib/mock-data";
import { getSessionName } from "@/lib/session-role";
import {
  appendTransferAction,
  syncNotificationsToCloud,
  transferActionRoleLabel,
} from "@/lib/transfer-actions";
import { TransferActionForm } from "@/components/role-workspace/TransferActionForm";
import { weekLabel } from "@/lib/arabic-numbers";
import { TabBadge } from "@/components/role-workspace/RoleShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Send } from "lucide-react";
import { toast } from "sonner";

const ROLE_LABEL: Record<TransferTargetRole, string> = {
  manager: "المدير",
  secretary: "السكرتير",
  supervisor: "المشرف التعليمي",
};

function PctStat({ label, value, tone }: { label: string; value: number; tone: "destructive" | "warning" | "primary" | "success" }) {
  const colors: Record<string, string> = {
    destructive: "bg-destructive/10 text-destructive border-destructive/30",
    warning: "bg-warning/10 text-warning border-warning/30",
    primary: "bg-primary/10 text-primary border-primary/30",
    success: "bg-success/10 text-success border-success/30",
  };
  return (
    <div className={`rounded-lg border p-2 text-center text-xs ${colors[tone]}`}>
      <div className="text-base font-bold">{formatOverallPercent(value)}</div>
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
  const [calendar, setCalendar] = useState<AcademicCalendar | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchActiveCalendar(true)
      .then((cal) => { if (!cancelled) setCalendar(cal); })
      .catch(() => { if (!cancelled) setCalendar(null); });
    return () => { cancelled = true; };
  }, []);

  const refresh = () => {
    setItems(
      loadNotifications().filter(
        (n) => n.type === "transfer" && n.targetRole === role && !n.read && n.transferStatus !== "closed",
      ),
    );
  };

  useEffect(() => { refresh(); }, [role]);

  const submitAction = async (n: Notification, actionText: string) => {
    if (!n.transferData || busyId) return;
    setBusyId(n.id);
    const actorName = getSessionName(transferActionRoleLabel(role));

    try {
      appendTransferAction(n.id, {
        role,
        byName: actorName,
        text: actionText,
        at: new Date().toISOString(),
      });
      updateNotification(n.id, { read: true, transferStatus: "closed" });
      refresh();
      toast.success("تم تسجيل الإجراء وإغلاق الحالة");
      await syncNotificationsToCloud();
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
          حالات أحالها المدير إلى {ROLE_LABEL[role]} — يجب تسجيل الإجراء المتخذ لكل طالب قبل الإغلاق
        </CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-muted-foreground text-center py-10 text-sm">لا توجد تحويلات معلّقة</p>
        ) : (
          <div className="space-y-4">
            {items.map((n) => {
              const td = n.transferData;
              if (!td) return null;
              const s = students.find((x) => x.id === td.studentId);
              const h = halaqat.find((x) => x.id === td.halaqaId);
              const pct = calendar && s && h
                ? studentReportPercentages(s.id, s.levelType, h.isTalqeen, grades, calendar).components
                : null;
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
                    <div className="text-[10px] text-muted-foreground">
                      تاريخ المخالفة: {td.rootTransferId
                        ? new Date(
                            loadNotifications().find((x) => x.id === td.rootTransferId)?.createdAt ?? n.createdAt,
                          ).toLocaleString("ar-SA")
                        : new Date(n.createdAt).toLocaleString("ar-SA")}
                    </div>
                  </div>
                  <div className="rounded-lg bg-background/40 border border-border p-2 mb-3 text-sm">
                    <span className="text-xs text-muted-foreground">السبب: </span>{td.reason}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                    {pct ? (
                      h?.isTalqeen ? (
                        <>
                          <PctStat label="نسبة الحضور" value={pct.attendance} tone="primary" />
                          <PctStat label="نسبة الواجب" value={pct.wajib} tone="success" />
                        </>
                      ) : (
                        <>
                          <PctStat label="نسبة الحضور" value={pct.attendance} tone="primary" />
                          <PctStat label="نسبة الحفظ" value={pct.hifz} tone="success" />
                          <PctStat label="نسبة المراجعة" value={pct.muraja} tone="warning" />
                          <PctStat label="نسبة الربط" value={pct.rabt} tone="success" />
                        </>
                      )
                    ) : (
                      <p className="col-span-full text-xs text-muted-foreground">جاري تحميل النسب...</p>
                    )}
                  </div>
                  <TransferActionForm
                    roleLabel={transferActionRoleLabel(role)}
                    submitLabel="تسجيل الإجراء وإغلاق"
                    busy={processing}
                    onSubmit={(text) => void submitAction(n, text)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
