import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  loadSardQueue, loadStudents, loadHalaqat, loadAttendanceArchive,
  loadMessageTemplates, saveMessageTemplates, loadNotifications, updateNotification,
  loadGrades, studentStats,
  DEFAULT_MESSAGE_TEMPLATES, type MessageTemplateKey, type Notification,
} from "@/lib/mock-data";
import { weekLabel } from "@/lib/arabic-numbers";
import { AppHeader } from "@/components/AppHeader";
import { LateSardList } from "@/components/SardLists";
import { GradesExport } from "@/components/GradesExport";
import { Crown, AlertTriangle, Settings, Shield, BookOpen, Archive, MessageSquare, Save, RotateCcw, Send, UserCheck, UserCog, CheckCircle2, AlertCircle } from "lucide-react";
import { Toaster, toast } from "sonner";

export const Route = createFileRoute("/manager")({ component: ManagerPage });

const TEMPLATE_LABELS: Record<MessageTemplateKey, { title: string; vars: string }> = {
  absence:   { title: "رسالة الغياب", vars: "{student} {halaqa}" },
  late:      { title: "رسالة التأخر / منح إذن الدخول", vars: "{student} {halaqa}" },
  sard_pass: { title: "رسالة اجتياز السرد", vars: "{student} {halaqa} {week} {percent}" },
  sard_fail: { title: "رسالة رسوب السرد", vars: "{student} {halaqa} {week} {percent}" },
};

function ManagerPage() {
  const [queue] = useState(() => loadSardQueue());
  const students = loadStudents();
  const halaqat = loadHalaqat();
  const archive = loadAttendanceArchive();
  const grades = loadGrades();
  const [templates, setTemplates] = useState(() => loadMessageTemplates());
  const [notifs, setNotifs] = useState(() => loadNotifications());

  const failedFinal = queue.filter((q) => q.status === "final_failed");
  const absenceArchive = archive.filter((a) => a.type === "absent");
  const lateArchive = archive.filter((a) => a.type === "late");
  const pendingTransfers = notifs.filter((n) => n.type === "transfer" && (n.transferStatus === "pending" || !n.transferStatus));
  const struggling = notifs.filter((n) => n.type === "transfer" && n.transferStatus === "struggling");

  const refreshNotifs = () => setNotifs(loadNotifications());
  const resolveTransfer = (n: Notification, status: "to_secretary" | "to_supervisor" | "struggling") => {
    updateNotification(n.id, { transferStatus: status, read: status !== "struggling" });
    const map = { to_secretary: "تم التحويل للسكرتير", to_supervisor: "تم التحويل للمشرف العلمي", struggling: "تم النقل لقائمة المتعثرين" };
    toast.success(map[status]);
    refreshNotifs();
  };

  const saveTpl = () => { saveMessageTemplates(templates); toast.success("تم حفظ الرسائل"); };
  const resetTpl = (k: MessageTemplateKey) => setTemplates({ ...templates, [k]: DEFAULT_MESSAGE_TEMPLATES[k] });

  return (
    <div className="min-h-screen">
      <Toaster position="top-center" richColors />
      <AppHeader title="لوحة المدير" subtitle="أ. فيصل الفوزان" />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="glass-card rounded-2xl p-6 mb-6 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl gold-gradient flex items-center justify-center">
            <Crown className="w-7 h-7 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h1 className="display text-2xl gold-text">لوحة المدير</h1>
            <p className="text-sm text-muted-foreground">إدارة عليا — متابعة الحالات الخاصة وكل الحلقات</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 mb-6">
          <Link to="/admin" className="glass-card rounded-2xl p-5 hover:gold-glow hover:border-primary transition-all">
            <Shield className="w-6 h-6 text-primary mb-2" />
            <div className="font-bold">لوحة الإدارة</div>
            <div className="text-xs text-muted-foreground">غياب وإشعارات</div>
          </Link>
          <Link to="/dashboard" className="glass-card rounded-2xl p-5 hover:gold-glow hover:border-primary transition-all">
            <Settings className="w-6 h-6 text-primary mb-2" />
            <div className="font-bold">لوحة التحكم</div>
            <div className="text-xs text-muted-foreground">طلاب، حلقات، استيراد</div>
          </Link>
          <Link to="/supervisor" className="glass-card rounded-2xl p-5 hover:gold-glow hover:border-primary transition-all">
            <BookOpen className="w-6 h-6 text-primary mb-2" />
            <div className="font-bold">الإشراف التعليمي</div>
            <div className="text-xs text-muted-foreground">موافقات السرد</div>
          </Link>
        </div>

        <div className="mb-6"><LateSardList /></div>
        <GradesExport />

        {/* Pending transfers from teachers */}
        <section className="glass-card rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-warning mb-3 flex items-center gap-2">
            <Send className="w-5 h-5" /> تحويلات من المعلمين ({pendingTransfers.length})
          </h2>
          {pendingTransfers.length === 0 ? (
            <p className="text-muted-foreground text-center py-6 text-sm">لا توجد تحويلات معلّقة</p>
          ) : (
            <div className="space-y-3">
              {pendingTransfers.map((n) => {
                const td = n.transferData!;
                const s = students.find((x) => x.id === td.studentId);
                const h = halaqat.find((x) => x.id === td.halaqaId);
                const st = studentStats(td.studentId, grades);
                return (
                  <div key={n.id} className="rounded-xl border border-warning/30 bg-warning/5 p-4">
                    <div className="flex items-start justify-between flex-wrap gap-2 mb-2">
                      <div>
                        <div className="font-bold flex items-center gap-2 flex-wrap">
                          {s?.name || "—"}
                          {s && (
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${s.levelType === "gold" ? "gold-gradient text-primary-foreground" : "bg-muted"}`}>
                              {s.levelType === "gold" ? "ذهبي" : "فضي"} · مستوى {s.level}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{h?.name} · {weekLabel(td.week)} · من: {td.fromName}</div>
                      </div>
                      <div className="text-[10px] text-muted-foreground">{new Date(n.createdAt).toLocaleString("ar")}</div>
                    </div>
                    <div className="rounded-lg bg-background/40 border border-border p-2 mb-3 text-sm">
                      <span className="text-xs text-muted-foreground">السبب: </span>{td.reason}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 text-center text-xs">
                      <Stat label="غياب" value={st.absentCount} tone="destructive" />
                      <Stat label="تأخر" value={st.lateCount} tone="warning" />
                      <Stat label="استئذان" value={st.excusedCount} tone="primary" />
                      <Stat label="حفظ" value={st.hifzCount} tone="success" />
                      <Stat label="مراجعة ✓" value={st.murajaPass} tone="success" />
                      <Stat label="مراجعة ✗" value={st.murajaFail} tone="destructive" />
                      <Stat label="ربط ✓" value={st.rabtPass} tone="success" />
                      <Stat label="ربط ✗" value={st.rabtFail} tone="destructive" />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => resolveTransfer(n, "to_secretary")} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-primary/15 text-primary border border-primary/30 text-sm font-bold">
                        <UserCog className="w-4 h-4" /> تحويل للسكرتير
                      </button>
                      <button onClick={() => resolveTransfer(n, "to_supervisor")} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-primary/15 text-primary border border-primary/30 text-sm font-bold">
                        <UserCheck className="w-4 h-4" /> تحويل للمشرف العلمي
                      </button>
                      <button onClick={() => resolveTransfer(n, "struggling")} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-destructive/15 text-destructive border border-destructive/30 text-sm font-bold">
                        <CheckCircle2 className="w-4 h-4" /> إنهاء (متعثر)
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Struggling students */}
        <section className="glass-card rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-destructive mb-3 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" /> الطلاب المتعثرون ({struggling.length})
          </h2>
          {struggling.length === 0 ? (
            <p className="text-muted-foreground text-center py-6 text-sm">لا يوجد متعثرون</p>
          ) : (
            <div className="space-y-1">
              {struggling.map((n) => {
                const td = n.transferData!;
                const s = students.find((x) => x.id === td.studentId);
                const h = halaqat.find((x) => x.id === td.halaqaId);
                return (
                  <div key={n.id} className="p-2 rounded bg-destructive/5 text-sm flex justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{s?.name}</span>
                      {s && <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${s.levelType === "gold" ? "gold-gradient text-primary-foreground" : "bg-muted"}`}>{s.levelType === "gold" ? "ذهبي" : "فضي"} {s.level}</span>}
                      <span className="text-xs text-muted-foreground">{h?.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{td.reason}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Halaqat quick view */}
        <section className="glass-card rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-primary mb-3 flex items-center gap-2">
            <BookOpen className="w-5 h-5" /> الحلقات
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {halaqat.map((h) => (
              <Link key={h.id} to="/teacher" search={{ h: h.id }}
                className="p-3 rounded-lg bg-secondary/50 hover:bg-primary/10 border border-transparent hover:border-primary text-sm">
                {h.name}
              </Link>
            ))}
          </div>
        </section>

        {/* Absence archive */}
        <section className="glass-card rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-destructive mb-4 flex items-center gap-2">
            <Archive className="w-5 h-5" /> سجل الغياب الإجمالي ({absenceArchive.length})
          </h2>
          {absenceArchive.length === 0 ? (
            <p className="text-muted-foreground text-center py-6 text-sm">لا يوجد سجل بعد</p>
          ) : (
            <div className="space-y-1 max-h-72 overflow-auto">
              {absenceArchive.slice(0, 100).map((a) => {
                const s = students.find((x) => x.id === a.studentId);
                const h = halaqat.find((x) => x.id === a.halaqaId);
                return <div key={a.id} className="p-2 rounded bg-destructive/5 text-sm flex justify-between"><span>{s?.name} · {h?.name}</span><span className="text-muted-foreground">{a.date}</span></div>;
              })}
            </div>
          )}
        </section>

        {/* Late archive */}
        <section className="glass-card rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-warning mb-4 flex items-center gap-2">
            <Archive className="w-5 h-5" /> سجل التأخر الإجمالي ({lateArchive.length})
          </h2>
          {lateArchive.length === 0 ? (
            <p className="text-muted-foreground text-center py-6 text-sm">لا يوجد سجل بعد</p>
          ) : (
            <div className="space-y-1 max-h-72 overflow-auto">
              {lateArchive.slice(0, 100).map((a) => {
                const s = students.find((x) => x.id === a.studentId);
                const h = halaqat.find((x) => x.id === a.halaqaId);
                return <div key={a.id} className="p-2 rounded bg-warning/5 text-sm flex justify-between"><span>{s?.name} · {h?.name}</span><span className="text-muted-foreground">{a.date}</span></div>;
              })}
            </div>
          )}
        </section>

        {/* Message templates editor */}
        <section className="glass-card rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-primary mb-2 flex items-center gap-2">
            <MessageSquare className="w-5 h-5" /> تحرير الرسائل المرسلة لأولياء الأمور
          </h2>
          <p className="text-xs text-muted-foreground mb-4">المتغيرات: <code className="text-primary">{"{student}"}</code> اسم الطالب · <code className="text-primary">{"{halaqa}"}</code> الحلقة · <code className="text-primary">{"{week}"}</code> الأسبوع · <code className="text-primary">{"{percent}"}</code> النسبة</p>
          <div className="space-y-4">
            {(Object.keys(TEMPLATE_LABELS) as MessageTemplateKey[]).map((k) => (
              <div key={k} className="rounded-lg border border-border p-3 bg-secondary/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-sm">{TEMPLATE_LABELS[k].title}</div>
                  <button onClick={() => resetTpl(k)} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" /> استعادة الافتراضي
                  </button>
                </div>
                <textarea
                  value={templates[k]}
                  onChange={(e) => setTemplates({ ...templates, [k]: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm"
                />
                <div className="text-[10px] text-muted-foreground mt-1">المتغيرات المتاحة: {TEMPLATE_LABELS[k].vars}</div>
              </div>
            ))}
          </div>
          <button onClick={saveTpl} className="mt-4 px-4 py-2 rounded-lg gold-gradient text-primary-foreground font-bold flex items-center gap-2">
            <Save className="w-4 h-4" /> حفظ جميع الرسائل
          </button>
        </section>

        {/* Final failed students */}
        <section className="glass-card rounded-2xl p-6">
          <h2 className="text-lg font-bold text-destructive mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" /> طلاب رسبوا نهائياً ({failedFinal.length})
          </h2>
          {failedFinal.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">لا يوجد حالات رسوب نهائي حالياً</p>
          ) : (
            <div className="space-y-2">
              {failedFinal.map((q) => {
                const s = students.find((x) => x.id === q.studentId);
                const h = halaqat.find((x) => x.id === q.halaqaId);
                if (!s || !h) return null;
                return (
                  <div key={q.id} className="flex items-center justify-between p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                    <div>
                      <div className="font-bold">{s.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {h.name} · {weekLabel(q.week)} · النسبة النهائية: {q.finalPercent}%
                      </div>
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
      </main>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "destructive" | "warning" | "primary" | "success" }) {
  const colors: Record<string, string> = {
    destructive: "bg-destructive/10 text-destructive border-destructive/30",
    warning: "bg-warning/10 text-warning border-warning/30",
    primary: "bg-primary/10 text-primary border-primary/30",
    success: "bg-success/10 text-success border-success/30",
  };
  return (
    <div className={`rounded-lg border p-2 ${colors[tone]}`}>
      <div className="text-base font-bold">{value}</div>
      <div className="text-[10px] opacity-80">{label}</div>
    </div>
  );
}
