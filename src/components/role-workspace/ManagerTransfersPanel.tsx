import { useEffect, useMemo, useState } from "react";
import {
  loadSardQueue, loadStudents, loadHalaqat, loadGrades, loadNotifications, updateNotification,
  pushNotification, loadTransfersForRole, type Notification,
} from "@/lib/mock-data";
import { fetchActiveCalendar, type AcademicCalendar } from "@/lib/academic-context";
import { studentReportPercentages, formatOverallPercent } from "@/lib/semester-grading";
import { getSessionName } from "@/lib/session-role";
import { appendTransferAction, syncNotificationsToCloud, transferActionRoleLabel } from "@/lib/transfer-actions";
import { TransferActionForm, TransferActionsList } from "@/components/role-workspace/TransferActionForm";
import { transferStatusLabel } from "@/lib/student-profile-data";
import { weekLabel } from "@/lib/arabic-numbers";
import { TabBadge } from "@/components/role-workspace/RoleShell";
import {
  Send, UserCheck, UserCog, CheckCircle2, AlertCircle, AlertTriangle, Loader2,
} from "lucide-react";
import { toast } from "sonner";

type TransferAction = "to_secretary" | "to_supervisor";

const TRANSFER_TOAST: Record<TransferAction, string> = {
  to_secretary: "تم التحويل للسكرتير بنجاح",
  to_supervisor: "تم التحويل للمشرف العلمي بنجاح",
};

function PctStat({ label, value, tone }: { label: string; value: number; tone: "destructive" | "warning" | "primary" | "success" }) {
  const colors: Record<string, string> = {
    destructive: "bg-destructive/10 text-destructive border-destructive/30",
    warning: "bg-warning/10 text-warning border-warning/30",
    primary: "bg-primary/10 text-primary border-primary/30",
    success: "bg-success/10 text-success border-success/30",
  };
  return (
    <div className={`rounded-lg border p-2 ${colors[tone]}`}>
      <div className="text-base font-bold">{formatOverallPercent(value)}</div>
      <div className="text-[10px] opacity-80">{label}</div>
    </div>
  );
}

export function ManagerTransfersPanel() {
  const [queue] = useState(() => loadSardQueue());
  const students = loadStudents();
  const halaqat = loadHalaqat();
  const grades = loadGrades();
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [strugglingPromptId, setStrugglingPromptId] = useState<string | null>(null);
  const [calendar, setCalendar] = useState<AcademicCalendar | null>(null);

  const reload = () => setNotifs(loadNotifications());

  useEffect(() => { reload(); }, []);
  useEffect(() => {
    let cancelled = false;
    fetchActiveCalendar(true)
      .then((cal) => { if (!cancelled) setCalendar(cal); })
      .catch(() => { if (!cancelled) setCalendar(null); });
    return () => { cancelled = true; };
  }, []);

  const failedFinal = useMemo(() => queue.filter((q) => q.status === "final_failed"), [queue]);
  const pendingTransfers = useMemo(
    () => loadTransfersForRole("manager"),
    [notifs],
  );
  const struggling = useMemo(
    () => notifs.filter((n) => n.type === "transfer" && n.transferStatus === "struggling" && !n.targetRole && n.transferData),
    [notifs],
  );
  const violationHistory = useMemo(
    () => notifs
      .filter((n) => n.type === "transfer" && n.transferData && !n.targetRole)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 30),
    [notifs],
  );

  const forwardTransfer = async (n: Notification, status: TransferAction) => {
    if (!n.transferData || processingId) return;
    const td = n.transferData;
    const student = students.find((x) => x.id === td.studentId);
    const halaqa = halaqat.find((x) => x.id === td.halaqaId);
    const managerName = getSessionName("المدير");
    const patch = { transferStatus: status, read: true } as const;

    setProcessingId(n.id);
    setNotifs((cur) => cur.map((item) => (item.id === n.id ? { ...item, ...patch } : item)));

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
      await syncNotificationsToCloud();
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
      await syncNotificationsToCloud();
      reload();
    } catch (e) {
      reload();
      toast.error(e instanceof Error ? e.message : "فشل التسجيل");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="glass-card rounded-2xl p-6">
        <h2 className="text-lg font-bold text-warning mb-3 flex items-center gap-2">
          <Send className="w-5 h-5" /> تحويلات من المعلمين
          <TabBadge count={pendingTransfers.length} />
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          تاريخ المخالفة يُسجَّل تلقائياً عند إرسال المعلم — المعلم يكتب السبب فقط.
        </p>
        {pendingTransfers.length === 0 ? (
          <p className="text-muted-foreground text-center py-6 text-sm">لا توجد تحويلات معلّقة</p>
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
                    <div className="text-[10px] text-muted-foreground">
                      تاريخ المخالفة: {new Date(n.createdAt).toLocaleString("ar-SA")}
                    </div>
                  </div>
                  <div className="rounded-lg bg-background/40 border border-border p-2 mb-3 text-sm">
                    <span className="text-xs text-muted-foreground">السبب: </span>{td.reason}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 text-center text-xs">
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

      <section className="glass-card rounded-2xl p-6">
        <h2 className="text-lg font-bold text-destructive mb-3 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" /> المتعثرون
          <TabBadge count={struggling.length} />
        </h2>
        {struggling.length === 0 ? (
          <p className="text-muted-foreground text-center py-6 text-sm">لا يوجد متعثرون</p>
        ) : (
          <div className="space-y-3">
            {struggling.map((n) => {
              const td = n.transferData;
              if (!td) return null;
              const s = students.find((x) => x.id === td.studentId);
              const h = halaqat.find((x) => x.id === td.halaqaId);
              return (
                <div key={n.id} className="p-3 rounded-xl bg-destructive/5 border border-destructive/20 text-sm">
                  <div className="flex justify-between flex-wrap gap-2 mb-1">
                    <span className="font-medium">{s?.name} · {h?.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(n.createdAt).toLocaleDateString("ar-SA")}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">السبب: {td.reason}</p>
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

      <section className="glass-card rounded-2xl p-6">
        <h2 className="text-lg font-bold text-primary mb-3">سجل المخالفات والإجراءات</h2>
        <p className="text-xs text-muted-foreground mb-4">جميع تحويلات المعلمين مع الإجراءات المسجّلة (سكرتير / مشرف / مدير)</p>
        {violationHistory.length === 0 ? (
          <p className="text-muted-foreground text-center py-6 text-sm">لا يوجد سجل</p>
        ) : (
          <div className="space-y-3 max-h-[480px] overflow-y-auto">
            {violationHistory.map((n) => {
              const td = n.transferData;
              if (!td) return null;
              const s = students.find((x) => x.id === td.studentId);
              const h = halaqat.find((x) => x.id === td.halaqaId);
              return (
                <div key={n.id} className="rounded-xl border border-border p-3 text-sm">
                  <div className="flex justify-between flex-wrap gap-2 mb-1">
                    <span className="font-bold">{s?.name ?? "—"} · {h?.name ?? "—"}</span>
                    <span className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString("ar-SA")}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">السبب: {td.reason} · {transferStatusLabel(n.transferStatus ?? "pending")}</p>
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

      <section className="glass-card rounded-2xl p-6">
        <h2 className="text-lg font-bold text-destructive mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" /> راسبون نهائياً
          <TabBadge count={failedFinal.length} />
        </h2>
        {failedFinal.length === 0 ? (
          <p className="text-muted-foreground text-center py-8 text-sm">لا يوجد حالات رسوب نهائي</p>
        ) : (
          <div className="space-y-2">
            {failedFinal.map((q) => {
              const s = students.find((x) => x.id === q.studentId);
              const h = halaqat.find((x) => x.id === q.halaqaId);
              if (!s || !h) return null;
              return (
                <div key={q.id} className="flex items-center justify-between p-4 rounded-lg bg-destructive/10 border border-destructive/30 flex-wrap gap-3">
                  <div>
                    <div className="font-bold">{s.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">{h.name} · {weekLabel(q.week)} · {q.finalPercent}%</div>
                  </div>
                  <a href={`https://wa.me/${s.parentPhone}`} target="_blank" rel="noreferrer"
                    className="px-4 py-2 rounded-lg bg-success/20 text-success border border-success/30 text-sm font-bold">
                    تواصل مع ولي الأمر
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
