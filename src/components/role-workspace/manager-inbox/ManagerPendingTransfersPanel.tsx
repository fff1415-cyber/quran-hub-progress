import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadStudents, loadHalaqat, loadGrades, updateNotification,
  pushNotification, loadTransfersForRole, type Notification,
} from "@/lib/mock-data";
import { fetchActiveCalendar, type AcademicCalendar } from "@/lib/academic-context";
import { studentReportPercentages } from "@/lib/semester-grading";
import { getSessionName } from "@/lib/session-role";
import { appendTransferAction } from "@/lib/transfer-actions";
import { TransferActionForm } from "@/components/role-workspace/TransferActionForm";
import { InboxItemActions } from "@/components/role-workspace/InboxItemActions";
import { TransferPctStat } from "@/components/role-workspace/manager-inbox/TransferPctStat";
import { useInboxRefresh } from "@/hooks/use-inbox-refresh";
import { weekLabel } from "@/lib/arabic-numbers";
import { Send, UserCheck, UserCog, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

type TransferAction = "to_secretary" | "to_supervisor";

const TRANSFER_TOAST: Record<TransferAction, string> = {
  to_secretary: "تم التحويل للسكرتير بنجاح",
  to_supervisor: "تم التحويل للمشرف العلمي بنجاح",
};

export function ManagerPendingTransfersPanel() {
  const students = loadStudents();
  const halaqat = loadHalaqat();
  const grades = loadGrades();
  const [tick, setTick] = useState(0);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [strugglingPromptId, setStrugglingPromptId] = useState<string | null>(null);
  const [calendar, setCalendar] = useState<AcademicCalendar | null>(null);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  useInboxRefresh(reload);

  useEffect(() => {
    let cancelled = false;
    fetchActiveCalendar(true)
      .then((cal) => { if (!cancelled) setCalendar(cal); })
      .catch(() => { if (!cancelled) setCalendar(null); });
    return () => { cancelled = true; };
  }, []);

  const pendingTransfers = useMemo(
    () => loadTransfersForRole("manager"),
    [tick],
  );

  const forwardTransfer = async (n: Notification, status: TransferAction) => {
    if (!n.transferData || processingId) return;
    const td = n.transferData;
    const student = students.find((x) => x.id === td.studentId);
    const halaqa = halaqat.find((x) => x.id === td.halaqaId);
    const managerName = getSessionName("المدير");
    const patch = { transferStatus: status, read: true } as const;

    setProcessingId(n.id);
    try {
      updateNotification(n.id, patch);
      const targetRole = status === "to_secretary" ? "secretary" : "supervisor";
      const targetLabel = status === "to_secretary" ? "السكرتير" : "المشرف العلمي";
      pushNotification({
        message: `تحويل من المدير: الطالب ${student?.name || "—"} (${halaqa?.name || "—"}) → ${targetLabel} — ${td.reason}`,
        type: "transfer",
        targetRole,
        transferStatus: "pending",
        actionTab: "transfers",
        transferData: {
          ...td,
          forwardedBy: managerName,
          rootTransferId: n.id,
        },
      });
      toast.success(TRANSFER_TOAST[status]);
      reload();
    } catch (e) {
      reload();
      toast.error(e instanceof Error ? e.message : "فشل التحويل");
    } finally {
      setProcessingId(null);
    }
  };

  const markStruggling = async (n: Notification, actionText: string) => {
    if (!n.transferData || processingId) return;
    const managerName = getSessionName("المدير");
    setProcessingId(n.id);
    try {
      appendTransferAction(n.id, {
        role: "manager",
        byName: managerName,
        text: actionText,
        at: new Date().toISOString(),
      });
      updateNotification(n.id, { transferStatus: "struggling", read: true });
      toast.success("تم تسجيل الإجراء ونقل الطالب للمتعثرين");
      setStrugglingPromptId(null);
      reload();
    } catch (e) {
      reload();
      toast.error(e instanceof Error ? e.message : "فشل التسجيل");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <section className="glass-card rounded-2xl p-6">
      <h2 className="text-lg font-bold text-warning mb-3 flex items-center gap-2">
        <Send className="w-5 h-5" /> بانتظار الإجراء
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        تحويلات المعلمين الجديدة — تاريخ المخالفة يُسجَّل تلقائياً عند الإرسال.
      </p>
      {pendingTransfers.length === 0 ? (
        <p className="text-muted-foreground text-center py-8 text-sm">لا توجد تحويلات معلّقة</p>
      ) : (
        <div className="space-y-3">
          {pendingTransfers.map((n) => {
            const td = n.transferData;
            if (!td) return null;
            const s = students.find((x) => x.id === td.studentId);
            const h = halaqat.find((x) => x.id === td.halaqaId);
            const pct = calendar && s && h
              ? studentReportPercentages(s.id, s.levelType, h.isTalqeen, grades, calendar).components
              : null;
            const busy = processingId === n.id;
            const showStrugglingForm = strugglingPromptId === n.id;
            return (
              <div key={n.id} className="rounded-xl border border-warning/30 bg-warning/5 p-4">
                <div className="flex items-start justify-between flex-wrap gap-2 mb-2">
                  <div>
                    <div className="font-bold">{s?.name || "—"}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {h?.name} · {weekLabel(td.week)} · من: {td.fromName}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(n.createdAt).toLocaleString("ar-SA")}
                    </div>
                    <InboxItemActions id={n.id} onDone={reload} showDismiss={false} />
                  </div>
                </div>
                <div className="rounded-lg bg-background/40 border border-border p-2 mb-3 text-sm">
                  <span className="text-xs text-muted-foreground">السبب: </span>{td.reason}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                  {pct ? (
                    h?.isTalqeen ? (
                      <>
                        <TransferPctStat label="نسبة الحضور" value={pct.attendance} tone="primary" />
                        <TransferPctStat label="نسبة الواجب" value={pct.wajib} tone="success" />
                      </>
                    ) : (
                      <>
                        <TransferPctStat label="نسبة الحضور" value={pct.attendance} tone="primary" />
                        <TransferPctStat label="نسبة الحفظ" value={pct.hifz} tone="success" />
                        <TransferPctStat label="نسبة المراجعة" value={pct.muraja} tone="warning" />
                        <TransferPctStat label="نسبة الربط" value={pct.rabt} tone="success" />
                      </>
                    )
                  ) : (
                    <p className="col-span-full text-xs text-muted-foreground">جاري تحميل النسب...</p>
                  )}
                </div>
                {showStrugglingForm ? (
                  <TransferActionForm
                    roleLabel="المدير"
                    submitLabel="تسجيل الإجراء ووضع متعثر"
                    busy={busy}
                    onCancel={() => setStrugglingPromptId(null)}
                    onSubmit={(text) => void markStruggling(n, text)}
                  />
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    <button type="button" disabled={busy} onClick={() => void forwardTransfer(n, "to_secretary")}
                      className="flex items-center gap-1 px-3 py-2 rounded-lg bg-primary/15 text-primary border border-primary/30 text-sm font-bold disabled:opacity-50">
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCog className="w-4 h-4" />}
                      تحويل للسكرتير
                    </button>
                    <button type="button" disabled={busy} onClick={() => void forwardTransfer(n, "to_supervisor")}
                      className="flex items-center gap-1 px-3 py-2 rounded-lg bg-primary/15 text-primary border border-primary/30 text-sm font-bold disabled:opacity-50">
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                      تحويل للمشرف
                    </button>
                    <button type="button" disabled={busy} onClick={() => setStrugglingPromptId(n.id)}
                      className="flex items-center gap-1 px-3 py-2 rounded-lg bg-destructive/15 text-destructive border border-destructive/30 text-sm font-bold disabled:opacity-50">
                      <CheckCircle2 className="w-4 h-4" />
                      متعثر — يلزم إجراء
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
