import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import {
  loadHalaqat, loadStudents, saveStudents, loadGrades, saveGrades, emptyWeek, DAYS,
  weekPercentage, enqueueSard, HIFZ_LABELS, loadNotifications, dismissNotification, pushNotification,
  type WeekRecord, type DayEntry, type HifzValue, type Student,
} from "@/lib/mock-data";
import { weekLabel } from "@/lib/arabic-numbers";
import { AppHeader } from "@/components/AppHeader";
import { ArrowRight, Bell, Check, CheckCircle2, ListChecks, Send, Users, X } from "lucide-react";
import { Toaster, toast } from "sonner";

export const Route = createFileRoute("/teacher")({
  validateSearch: z.object({ h: z.number().optional(), w: z.number().optional() }),
  component: TeacherPage,
});

function TeacherPage() {
  const { h, w } = Route.useSearch();
  const navigate = useNavigate();
  const halaqat = loadHalaqat();
  const halaqa = halaqat.find((x) => x.id === h);
  const [role, setRole] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    setRole(sessionStorage.getItem("qs_role"));
    setName(sessionStorage.getItem("qs_name"));
  }, []);

  const isAssistant = role === "assistant";
  const elevated = role === "manager" || role === "secretary" || role === "supervisor";

  if (!halaqa) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass-card p-8 rounded-2xl text-center">
          <p>الحلقة غير موجودة</p>
          <button onClick={() => navigate({ to: "/" })} className="mt-4 px-4 py-2 rounded-lg gold-gradient text-primary-foreground">العودة</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Toaster position="top-center" richColors />
      <AppHeader title={halaqa.name} subtitle={isAssistant ? "مساعد" : elevated ? "مشرف" : "معلم"} />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="glass-card rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-2xl display gold-text">مرحباً {name || ""}</div>
              <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-bold">
                  {isAssistant ? "مساعد" : elevated ? "صلاحية كاملة" : "معلم"}
                </span>
                {halaqa.name}
              </div>
            </div>
            {elevated && (
              <HalaqaSwitcher current={halaqa.id} />
            )}
            {w && (
              <button
                onClick={() => navigate({ to: "/teacher", search: { h: halaqa.id } })}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-primary/30 text-primary"
              >
                <ArrowRight className="w-4 h-4" />
                رجوع للأسابيع
              </button>
            )}
          </div>
        </div>

        <HalaqaNotifications halaqaId={halaqa.id} />


        {!w ? (
          <WeeksGrid halaqaId={halaqa.id} canAssign={!isAssistant} />
        ) : (
          <WeekTable halaqaId={halaqa.id} weekNum={w} isTalqeen={halaqa.isTalqeen} viewerRole={isAssistant ? "assistant" : "teacher"} />
        )}
      </main>
    </div>
  );
}

function HalaqaSwitcher({ current }: { current: number }) {
  const navigate = useNavigate();
  const halaqat = loadHalaqat();
  return (
    <select
      value={current}
      onChange={(e) => navigate({ to: "/teacher", search: { h: Number(e.target.value) } })}
      className="px-3 py-2 rounded-lg bg-input border border-border text-sm"
    >
      {halaqat.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
    </select>
  );
}

function WeeksGrid({ halaqaId, canAssign }: { halaqaId: number; canAssign: boolean }) {
  const navigate = useNavigate();
  const [showAssign, setShowAssign] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-primary flex items-center gap-2">
          <ListChecks className="w-5 h-5" /> الأسابيع الدراسية
        </h2>
        {canAssign && (
          <button onClick={() => setShowAssign(true)} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-primary/30 text-primary text-sm hover:bg-primary/10">
            <Users className="w-4 h-4" />
            تقسيم الطلاب بيني وبين المساعد
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            onClick={() => navigate({ to: "/teacher", search: { h: halaqaId, w: n } })}
            className="aspect-[5/3] rounded-xl glass-card hover:gold-glow hover:border-primary transition-all flex flex-col items-center justify-center group"
          >
            <div className="text-xs text-muted-foreground">{weekLabel(n).split(" ")[0]}</div>
            <div className="text-lg display font-bold gold-text group-hover:scale-105 transition-transform">{weekLabel(n).split(" ").slice(1).join(" ")}</div>
          </button>
        ))}
      </div>
      {showAssign && <AssignmentDialog halaqaId={halaqaId} onClose={() => setShowAssign(false)} />}
    </div>
  );
}

function AssignmentDialog({ halaqaId, onClose }: { halaqaId: number; onClose: () => void }) {
  const [students, setStudents] = useState<Student[]>(() => loadStudents().filter((s) => s.halaqaId === halaqaId));
  const setAssign = (id: string, to: "teacher" | "assistant" | undefined) => {
    const all = loadStudents();
    const next = all.map((s) => s.id === id ? { ...s, assignedTo: to } : s);
    saveStudents(next);
    void import("@/lib/cloud-sync").then((m) => m.patchStudent(id, { assignedTo: to }));
    setStudents(next.filter((s) => s.halaqaId === halaqaId));
  };
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass-card rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h3 className="text-lg font-bold text-primary">تقسيم الطلاب</h3>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          <p className="text-xs text-muted-foreground mb-2">الأصل: كل الطلاب يظهرون عند المعلم وعند المساعد. عيّن طالباً لجهة معينة لإخفائه عن الجهة الأخرى.</p>
          {students.map((s) => (
            <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
              <span className="font-medium">{s.name}</span>
              <div className="flex gap-2">
                <button onClick={() => setAssign(s.id, undefined)}
                  className={`px-3 py-1 rounded text-xs font-bold ${!s.assignedTo ? "gold-gradient text-primary-foreground" : "border border-border text-muted-foreground"}`}>
                  كلاهما
                </button>
                <button onClick={() => setAssign(s.id, "teacher")}
                  className={`px-3 py-1 rounded text-xs font-bold ${s.assignedTo === "teacher" ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>
                  معي فقط
                </button>
                <button onClick={() => setAssign(s.id, "assistant")}
                  className={`px-3 py-1 rounded text-xs font-bold ${s.assignedTo === "assistant" ? "bg-primary/20 text-primary border border-primary" : "border border-border text-muted-foreground"}`}>
                  المساعد فقط
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WeekTable({ halaqaId, weekNum, isTalqeen, viewerRole }: { halaqaId: number; weekNum: number; isTalqeen: boolean; viewerRole: "teacher" | "assistant" }) {
  const allStudents = useMemo(() => loadStudents().filter((s) => s.halaqaId === halaqaId), [halaqaId]);
  // Default: both teacher and assistant see all students.
  // After assignment: teacher hides those assigned to assistant, and vice versa.
  const students = viewerRole === "assistant"
    ? allStudents.filter((s) => s.assignedTo !== "teacher")
    : allStudents.filter((s) => s.assignedTo !== "assistant");
  const [grades, setGrades] = useState(() => loadGrades());
  const [transferFor, setTransferFor] = useState<Student | null>(null);
  const [transferReason, setTransferReason] = useState("");
  const senderName = typeof window !== "undefined" ? (sessionStorage.getItem("qs_name") || "المعلم") : "المعلم";

  const submitTransfer = () => {
    if (!transferFor) return;
    const reason = transferReason.trim();
    if (!reason) { toast.error("اكتب سبب التحويل"); return; }
    pushNotification({
      message: `تحويل من ${senderName}: الطالب ${transferFor.name} — ${reason}`,
      type: "transfer",
      actionTab: "transfers",
      transferData: {
        studentId: transferFor.id,
        halaqaId: transferFor.halaqaId,
        week: weekNum,
        reason,
        fromName: senderName,
      },
      transferStatus: "pending",
    });
    toast.success("تم إرسال الطالب للإدارة");
    setTransferFor(null);
    setTransferReason("");
  };

  useEffect(() => {
    let changed = false;
    const g = { ...grades };
    students.forEach((s) => {
      if (!g[s.id]) g[s.id] = {};
      if (!g[s.id][weekNum]) { g[s.id][weekNum] = emptyWeek(); changed = true; }
    });
    if (changed) { setGrades(g); saveGrades(g); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekNum, halaqaId]);

  const update = (studentId: string, fn: (w: WeekRecord) => WeekRecord) => {
    const g = { ...grades };
    if (!g[studentId]) g[studentId] = {};
    if (!g[studentId][weekNum]) g[studentId][weekNum] = emptyWeek();
    g[studentId][weekNum] = fn(g[studentId][weekNum]);
    setGrades(g);
    saveGrades(g);
  };

  const updateDay = (studentId: string, dayKey: string, patch: Partial<DayEntry>) => {
    update(studentId, (w) => ({ ...w, days: { ...w.days, [dayKey]: { ...w.days[dayKey], ...patch } } }));
  };

  const toggleSard = (s: Student, on: boolean) => {
    update(s.id, (w) => ({ ...w, sard: on }));
    if (on) {
      enqueueSard(s.id, s.halaqaId, weekNum);
      toast.success(`تم إحالة الطالب ${s.name} للمسمّع`);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-4 overflow-x-auto">
      <div className="flex items-center justify-between mb-4 px-2">
        <h3 className="display text-xl gold-text">{weekLabel(weekNum)}</h3>
        <span className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="w-4 h-4" /> حفظ تلقائي
        </span>
      </div>
      {students.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground text-sm">
          {viewerRole === "assistant" ? "لم يُعيّن لك أي طالب بعد" : "لا يوجد طلاب"}
        </p>
      ) : (
      <table className="w-full text-sm border-collapse min-w-[900px]">
        <thead>
          <tr className="bg-secondary/50">
            <th className="p-2 text-right sticky right-0 bg-secondary z-10 min-w-[140px]">الطالب</th>
            {DAYS.map((d) => (
              <th key={d.key} colSpan={isTalqeen ? 2 : 4} className="p-2 border-r border-border text-primary">{d.label}</th>
            ))}
            {!isTalqeen && <th className="p-2 border-r border-border">اختبار مراجعة</th>}
            <th className="p-2 border-r border-border">اختبار ربط</th>
            <th className="p-2 border-r border-border">السرد</th>
            <th className="p-2 border-r border-border text-primary">النسبة</th>
            <th className="p-2 border-r border-border text-warning">إرسال للإدارة</th>
          </tr>
          <tr className="bg-secondary/30 text-xs text-muted-foreground">
            <th className="sticky right-0 bg-secondary"></th>
            {DAYS.map((d) =>
              isTalqeen ? (
                <React.Fragment key={d.key}>
                  <th className="p-1 border-r border-border">حاضر</th>
                  <th className="p-1">واجب</th>
                </React.Fragment>
              ) : (
                <React.Fragment key={d.key}>
                  <th className="p-1 border-r border-border">الحضور</th>
                  <th className="p-1">حفظ</th>
                  <th className="p-1">ربط</th>
                  <th className="p-1">مراجعة</th>
                </React.Fragment>
              )
            )}
            {!isTalqeen && <th></th>}
            <th></th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => {
            const w = grades[s.id]?.[weekNum] || emptyWeek();
            const pct = weekPercentage(w, isTalqeen);
            return (
              <tr key={s.id} className="border-b border-border/50 hover:bg-accent/30">
                <td className="p-2 sticky right-0 bg-card font-medium">
                  <div className="flex flex-col">
                    <span>{s.name}</span>
                    {s.assignedTo === "assistant" && viewerRole === "teacher" && (
                      <span className="text-[10px] text-muted-foreground">مع المساعد</span>
                    )}
                  </div>
                </td>
                {DAYS.map((d) => {
                  const e = w.days[d.key];
                  return isTalqeen ? (
                    <React.Fragment key={d.key}>
                      <td className="p-1 border-r border-border/30">
                        <AttSelect value={e.attendance} talqeen onChange={(v) => updateDay(s.id, d.key, { attendance: v })} />
                      </td>
                      <td className="p-1 text-center">
                        <Cbx checked={!!e.wajib} onChange={(v) => updateDay(s.id, d.key, { wajib: v })} />
                      </td>
                    </React.Fragment>
                  ) : (
                    <React.Fragment key={d.key}>
                      <td className="p-1 border-r border-border/30">
                        <AttSelect value={e.attendance} onChange={(v) => updateDay(s.id, d.key, { attendance: v })} />
                      </td>
                      <td className="p-1">
                        <HifzSelect value={e.hifz} onChange={(v) => updateDay(s.id, d.key, { hifz: v })} />
                      </td>
                      <td className="p-1">
                        <PassFail value={e.rabt} onChange={(v) => updateDay(s.id, d.key, { rabt: v })} />
                      </td>
                      <td className="p-1">
                        <PassFail value={e.muraja} onChange={(v) => updateDay(s.id, d.key, { muraja: v })} />
                      </td>
                    </React.Fragment>
                  );
                })}
                {!isTalqeen && (
                  <td className="p-1 text-center border-r border-border/30">
                    <Cbx checked={w.testMuraja} onChange={(v) => update(s.id, (x) => ({ ...x, testMuraja: v }))} />
                  </td>
                )}
                <td className="p-1 text-center border-r border-border/30">
                  <Cbx checked={w.testRabt} onChange={(v) => update(s.id, (x) => ({ ...x, testRabt: v }))} />
                </td>
                <td className="p-1 text-center border-r border-border/30">
                  <Cbx checked={w.sard} onChange={(v) => toggleSard(s, v)} />
                </td>
                <td className="p-2 text-center font-bold">
                  <span className={pct >= 80 ? "text-success" : pct >= 50 ? "text-warning" : "text-muted-foreground"}>
                    {pct}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      )}
    </div>
  );
}

function AttSelect({ value, onChange, talqeen }: { value: string; onChange: (v: DayEntry["attendance"]) => void; talqeen?: boolean }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as DayEntry["attendance"])} className="w-full bg-input border border-border rounded px-1 py-1 text-xs">
      <option value="">—</option>
      <option value="present">حاضر</option>
      {!talqeen && <option value="late">متأخر</option>}
      {!talqeen && <option value="excused">مستأذن</option>}
      <option value="absent">غائب</option>
    </select>
  );
}
function HifzSelect({ value, onChange }: { value: HifzValue; onChange: (v: HifzValue) => void }) {
  // Show only the quantity (½ / ١ / ٢), hide the underlying score (15/20/25).
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as HifzValue)} className="w-full bg-input border border-border rounded px-1 py-1 text-xs font-bold">
      <option value="">{HIFZ_LABELS[""]}</option>
      <option value="half">{HIFZ_LABELS["half"]}</option>
      <option value="one">{HIFZ_LABELS["one"]}</option>
      <option value="two">{HIFZ_LABELS["two"]}</option>
    </select>
  );
}
function PassFail({ value, onChange }: { value: string; onChange: (v: DayEntry["rabt"]) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as DayEntry["rabt"])} className="w-full bg-input border border-border rounded px-1 py-1 text-xs">
      <option value="">—</option>
      <option value="pass">مجتاز</option>
      <option value="fail">راسب</option>
    </select>
  );
}
function Cbx({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${
        checked ? "bg-primary border-primary" : "border-border bg-input hover:border-primary/50"
      }`}
    >
      {checked && <Check className="w-4 h-4 text-primary-foreground" />}
    </button>
  );
}

function HalaqaNotifications({ halaqaId }: { halaqaId: number }) {
  const [items, setItems] = useState(() =>
    loadNotifications().filter((n) => !n.read && n.targetHalaqaId === halaqaId)
  );
  if (items.length === 0) return null;
  const dismiss = (id: string) => {
    dismissNotification(id);
    setItems(loadNotifications().filter((n) => !n.read && n.targetHalaqaId === halaqaId));
  };
  return (
    <div className="glass-card rounded-2xl p-4 mb-6 border border-warning/30">
      <div className="flex items-center gap-2 mb-3 text-warning font-bold">
        <Bell className="w-4 h-4" />
        إشعارات الحلقة ({items.length})
      </div>
      <div className="space-y-2">
        {items.map((n) => (
          <div key={n.id} className="flex items-start gap-2 p-2 rounded-lg bg-warning/10">
            <div className="flex-1 text-sm">{n.message}</div>
            <button
              onClick={() => dismiss(n.id)}
              aria-label="تم"
              className="p-1.5 rounded-md bg-success/15 text-success border border-success/30"
            >
              <Check className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// React import for React.Fragment
import React from "react";
