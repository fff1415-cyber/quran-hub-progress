import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  loadHalaqat, loadStudents, saveStudents, loadGrades, loadSardQueue, updateSardItem, pushNotification,
  loadLatePermissions, saveLatePermissions, loadMessageTemplates, formatMessage,
  loadAttendanceArchive, acknowledgeAttendance,
  type WeekRecord, type Student,
} from "@/lib/mock-data";
import { weekLabel } from "@/lib/arabic-numbers";
import { getOperationalDayKey } from "@/lib/operational-date";
import { AppHeader } from "@/components/AppHeader";
import { MessageCircle, UserX, Zap, Clipboard, Clock, Plus, AlertTriangle, CheckCircle2, RotateCcw, Check, Archive, X } from "lucide-react";
import { Toaster, toast } from "sonner";

export const Route = createFileRoute("/secretary")({ component: SecretaryPage });

function SecretaryPage() {
  const halaqat = loadHalaqat();
  const [students, setStudents] = useState<Student[]>(() => loadStudents());
  const grades = loadGrades();
  const [queue, setQueue] = useState(() => loadSardQueue());
  const [latePermissions, setLatePermissions] = useState(() => loadLatePermissions());
  const [archive, setArchive] = useState(() => loadAttendanceArchive());
  const [openLateHistory, setOpenLateHistory] = useState<string | null>(null);
  const [lateSearch, setLateSearch] = useState("");
  const [form, setForm] = useState<Omit<Student, "id">>({
    name: "", halaqaId: halaqat[0]?.id || 1, nationalId: "", parentPhone: "", level: "1", levelType: "gold",
  });
  const refresh = () => setQueue(loadSardQueue());
  const templates = loadMessageTemplates();
  const todayISO = new Date().toISOString().slice(0, 10);
  const me = sessionStorage.getItem("qs_name") || "السكرتير";

  const todayKey = getOperationalDayKey();
  const ackedToday = useMemo(() => new Set(archive.filter((a) => a.date === todayISO).map((a) => `${a.studentId}|${a.type}`)), [archive, todayISO]);
  const today = useMemo(() => {
    const currentWeek = 1;
    return students.map((s) => {
      const w: WeekRecord | undefined = grades[s.id]?.[currentWeek];
      return { s, status: (w?.days[todayKey]?.attendance || "") as "absent" | "late" | "excused" | "present" | "" };
    }).filter((x) => x.status && x.status !== "present" && !ackedToday.has(`${x.s.id}|${x.status}`));
  }, [students, grades, todayKey, ackedToday]);

  const absenceArchive = useMemo(() => archive.filter((a) => a.type === "absent"), [archive]);
  const lateArchive = useMemo(() => archive.filter((a) => a.type === "late"), [archive]);

  const ackToday = (s: Student, type: "absent" | "late" | "excused") => {
    acknowledgeAttendance({ studentId: s.id, halaqaId: s.halaqaId, type, date: todayISO, dayKey: todayKey, acknowledgedBy: me });
    setArchive(loadAttendanceArchive());
    toast.success(type === "absent" ? "نُقل إلى سجل الغياب" : type === "late" ? "نُقل إلى سجل التأخر" : "تم");
  };

  const scheduled = queue.filter((q) => q.status === "scheduled");
  const activeSard = queue.filter((q) => !["passed", "final_failed", "level_repeat"].includes(q.status));
  const passedSard = queue.filter((q) => q.status === "passed");
  const finalFailed = queue.filter((q) => q.status === "final_failed");

  const addStudent = async () => {
    if (!form.name || !form.nationalId) { toast.error("الاسم ورقم الهوية مطلوبان"); return; }
    const next = [...students, { id: `s-${Date.now()}`, ...form }];
    setStudents(next); saveStudents(next);
    try { await import("@/lib/cloud-sync").then((m) => m.pushStudents(next)); toast.success("تمت إضافة الطالب وحفظه"); }
    catch { toast.error("تم الحفظ محلياً فقط — تحقق من الاتصال"); }
    setForm({ ...form, name: "", nationalId: "", parentPhone: "" });
  };

  const forceImmediate = (id: string, name: string) => {
    updateSardItem(id, { status: "pending", scheduledAt: new Date().toISOString() });
    pushNotification({ message: `سمح السكرتير بإعادة سرد فوري للطالب ${name}`, type: "sard" });
    toast.success("تم — يمكن للمسمّع البدء فوراً");
    refresh();
  };

  const grantLate = (studentId: string) => {
    const s = students.find((x) => x.id === studentId);
    if (!s) return;
    const h = halaqat.find((x) => x.id === s.halaqaId);
    const grantedBy = sessionStorage.getItem("qs_name") || "السكرتير";
    const next = [{ id: `late-${Date.now()}`, studentId: s.id, halaqaId: s.halaqaId, grantedBy, grantedAt: new Date().toISOString(), date: new Date().toISOString().slice(0, 10) }, ...latePermissions];
    setLatePermissions(next); saveLatePermissions(next);
    // Notify the halaqa teacher specifically
    pushNotification({
      message: `تم منح الطالب ${s.name} إذن الدخول إلى ${h?.name || "الحلقة"} من قِبل ${grantedBy}`,
      type: "late",
      targetHalaqaId: s.halaqaId,
      actionTab: "late",
    });
    toast.success("تم تسجيل إذن الدخول وإشعار معلم الحلقة");
  };

  const retryFinal = (id: string) => {
    updateSardItem(id, { status: "pending", attempt: 1, scheduledAt: undefined, hifzErrors: 0, reviewErrors: [0, 0, 0, 0, 0] });
    toast.success("تمت إعادة الطالب لقائمة السرد");
    refresh();
  };

  const repeatLevel = (id: string) => {
    updateSardItem(id, { status: "level_repeat" });
    toast.success("تم تسجيل قرار إعادة المستوى");
    refresh();
  };

  return (
    <div className="min-h-screen">
      <Toaster position="top-center" richColors />
      <AppHeader title="لوحة السكرتير" subtitle="أ. أحمد العمر" />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="glass-card rounded-2xl p-6 mb-6 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl gold-gradient flex items-center justify-center">
            <Clipboard className="w-7 h-7 text-primary-foreground" />
          </div>
          <div>
            <h1 className="display text-2xl gold-text">لوحة السكرتير</h1>
            <p className="text-sm text-muted-foreground">متابعة الغياب اليومي وإشعارات أولياء الأمور — يتجدد كل يوم الساعة 2 ظهراً</p>
          </div>
        </div>

        <section className="glass-card rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-primary mb-4 flex items-center gap-2">
            <UserX className="w-5 h-5" /> غياب اليوم ({today.length})
          </h2>
          {today.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">لا توجد حالات غياب أو تأخر اليوم</p>
          ) : (
            <div className="space-y-2">
              {today.map(({ s, status }) => {
                const h = halaqat.find((x) => x.id === s.halaqaId);
                const labelMap: Record<string, string> = { absent: "غائب", late: "متأخر", excused: "مستأذن" };
                const colorMap: Record<string, string> = {
                  absent: "bg-destructive/15 text-destructive border-destructive/30",
                  late: "bg-warning/15 text-warning border-warning/30",
                  excused: "bg-primary/15 text-primary border-primary/30",
                };
                const template = status === "late" ? templates.late : templates.absence;
                const msg = encodeURIComponent(formatMessage(template, { student: s.name, halaqa: h?.name }));
                return (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 rounded text-xs font-bold border ${colorMap[status]}`}>{labelMap[status]}</span>
                      <div>
                        <div className="font-medium">{s.name}</div>
                        <div className="text-xs text-muted-foreground">{h?.name}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a href={`https://wa.me/${s.parentPhone}?text=${msg}`} target="_blank" rel="noreferrer"
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success/20 text-success border border-success/30 text-sm font-bold">
                        <MessageCircle className="w-4 h-4" />
                        واتساب
                      </a>
                      <button onClick={() => ackToday(s, status as "absent" | "late" | "excused")} title="نقل إلى السجل"
                        className="p-2 rounded-lg bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25">
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ----- Absence archive ----- */}
        <section className="glass-card rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-destructive mb-4 flex items-center gap-2">
            <Archive className="w-5 h-5" /> سجل الغياب ({absenceArchive.length})
          </h2>
          {absenceArchive.length === 0 ? (
            <p className="text-muted-foreground text-center py-6 text-sm">لا يوجد سجل بعد</p>
          ) : (
            <div className="space-y-1 max-h-80 overflow-auto">
              {absenceArchive.slice(0, 50).map((a) => {
                const s = students.find((x) => x.id === a.studentId);
                const h = halaqat.find((x) => x.id === a.halaqaId);
                return <div key={a.id} className="p-2 rounded bg-destructive/5 text-sm flex justify-between"><span>{s?.name} · {h?.name}</span><span className="text-muted-foreground">{a.date}</span></div>;
              })}
            </div>
          )}
        </section>

        {/* ----- Late archive ----- */}
        <section className="glass-card rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-warning mb-4 flex items-center gap-2">
            <Archive className="w-5 h-5" /> سجل التأخر ({lateArchive.length})
          </h2>
          {lateArchive.length === 0 ? (
            <p className="text-muted-foreground text-center py-6 text-sm">لا يوجد سجل بعد</p>
          ) : (
            <div className="space-y-1 max-h-80 overflow-auto">
              {lateArchive.slice(0, 50).map((a) => {
                const s = students.find((x) => x.id === a.studentId);
                const h = halaqat.find((x) => x.id === a.halaqaId);
                return <div key={a.id} className="p-2 rounded bg-warning/5 text-sm flex justify-between"><span>{s?.name} · {h?.name}</span><span className="text-muted-foreground">{a.date}</span></div>;
              })}
            </div>
          )}
        </section>

        <section className="glass-card rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-primary mb-4 flex items-center gap-2">
            <Plus className="w-5 h-5" /> إضافة طالب
          </h2>
          <div className="grid md:grid-cols-3 gap-2">
            <input className="px-3 py-2 rounded-lg bg-input border border-border" placeholder="اسم الطالب" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="px-3 py-2 rounded-lg bg-input border border-border" placeholder="رقم الهوية" value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} />
            <select className="px-3 py-2 rounded-lg bg-input border border-border" value={form.halaqaId} onChange={(e) => setForm({ ...form, halaqaId: Number(e.target.value) })}>
              {halaqat.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
            <input className="px-3 py-2 rounded-lg bg-input border border-border" placeholder="جوال ولي الأمر" value={form.parentPhone} onChange={(e) => setForm({ ...form, parentPhone: e.target.value })} />
            <input className="px-3 py-2 rounded-lg bg-input border border-border" placeholder="المستوى" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} />
            <select className="px-3 py-2 rounded-lg bg-input border border-border" value={form.levelType} onChange={(e) => setForm({ ...form, levelType: e.target.value as "gold" | "silver" })}>
              <option value="gold">ذهبي</option><option value="silver">فضي</option>
            </select>
          </div>
          <button onClick={addStudent} className="mt-3 px-4 py-2 rounded-lg gold-gradient text-primary-foreground font-bold flex items-center gap-2">
            <Plus className="w-4 h-4" /> إضافة الطالب
          </button>
        </section>

        <section className="glass-card rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-warning mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" /> إذن دخول المتأخرين
          </h2>
          <p className="text-xs text-muted-foreground mb-3">اضغط على اسم الطالب لعرض سجل تأخراته ثم منح الإذن.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {students.map((s) => {
              const h = halaqat.find((x) => x.id === s.halaqaId);
              const hist = latePermissions.filter((p) => p.studentId === s.id);
              const open = openLateHistory === s.id;
              return (
                <div key={s.id} className="rounded-lg border border-border bg-secondary/30">
                  <button onClick={() => setOpenLateHistory(open ? null : s.id)}
                    className="w-full p-3 text-right flex items-center justify-between hover:bg-primary/5">
                    <div>
                      <div className="font-medium text-sm">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{h?.name}</div>
                    </div>
                    <span className="px-2 py-1 rounded bg-warning/15 text-warning text-xs font-bold">{hist.length} تأخر</span>
                  </button>
                  {open && (
                    <div className="border-t border-border p-3 bg-background/40 space-y-2">
                      <div className="text-xs font-bold text-muted-foreground">سجل التأخر:</div>
                      {hist.length === 0 ? (
                        <div className="text-xs text-muted-foreground">لا يوجد تأخر سابق</div>
                      ) : (
                        <ul className="text-xs space-y-1 max-h-32 overflow-auto">
                          {hist.map((p) => <li key={p.id} className="flex justify-between"><span>{p.date}</span><span className="text-muted-foreground">أذن: {p.grantedBy}</span></li>)}
                        </ul>
                      )}
                      <button onClick={() => { grantLate(s.id); setLatePermissions(loadLatePermissions()); setOpenLateHistory(null); }}
                        className="w-full px-3 py-2 rounded-lg bg-warning/20 text-warning border border-warning/30 font-bold text-sm flex items-center justify-center gap-1">
                        <Check className="w-4 h-4" /> منح إذن الدخول الآن
                      </button>
                      <button onClick={() => setOpenLateHistory(null)} className="w-full text-xs text-muted-foreground flex items-center justify-center gap-1">
                        <X className="w-3 h-3" /> إغلاق
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="glass-card rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-primary mb-4 flex items-center gap-2"><Clock className="w-5 h-5" /> قائمة طلاب السرد كاملة ({activeSard.length})</h2>
          <div className="space-y-2">
            {activeSard.length === 0 ? <p className="text-muted-foreground text-center py-6">لا يوجد طلاب في السرد</p> : activeSard.map((q) => {
              const s = students.find((x) => x.id === q.studentId); const h = halaqat.find((x) => x.id === q.halaqaId);
              return s && h ? <div key={q.id} className="p-3 rounded-lg bg-secondary/50 text-sm flex justify-between"><span>{s.name} · {h.name} · {weekLabel(q.week)}</span><span className="text-primary font-bold">{q.status}</span></div> : null;
            })}
          </div>
        </section>

        <section className="glass-card rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-success mb-4 flex items-center gap-2"><CheckCircle2 className="w-5 h-5" /> المجتازون ({passedSard.length})</h2>
          <div className="space-y-2">
            {passedSard.length === 0 ? <p className="text-muted-foreground text-center py-6">لا يوجد مجتازون بعد</p> : passedSard.map((q) => {
              const s = students.find((x) => x.id === q.studentId); const h = halaqat.find((x) => x.id === q.halaqaId);
              const msg = encodeURIComponent(formatMessage(templates.sard_pass, { student: s?.name, halaqa: h?.name, week: weekLabel(q.week), percent: q.finalPercent ?? "" }));
              return s && h ? <div key={q.id} className="flex items-center justify-between p-3 rounded-lg bg-success/10 border border-success/20"><span>{s.name} · {h.name} · {q.finalPercent}%</span><a href={`https://wa.me/${s.parentPhone}?text=${msg}`} target="_blank" rel="noreferrer" className="text-success font-bold text-sm flex items-center gap-1"><MessageCircle className="w-4 h-4" /> واتساب</a></div> : null;
            })}
          </div>
        </section>

        <section className="glass-card rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-destructive mb-4 flex items-center gap-2"><RotateCcw className="w-5 h-5" /> الراسبون نهائياً ({finalFailed.length})</h2>
          <div className="space-y-2">
            {finalFailed.length === 0 ? <p className="text-muted-foreground text-center py-6">لا يوجد رسوب نهائي</p> : finalFailed.map((q) => {
              const s = students.find((x) => x.id === q.studentId); const h = halaqat.find((x) => x.id === q.halaqaId);
              return s && h ? <div key={q.id} className="flex items-center justify-between gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20"><span>{s.name} · {h.name} · {q.finalPercent}%</span><div className="flex gap-2"><button onClick={() => retryFinal(q.id)} className="px-3 py-1.5 rounded-lg bg-warning/20 text-warning text-sm font-bold">إعادة السرد</button><button onClick={() => repeatLevel(q.id)} className="px-3 py-1.5 rounded-lg bg-destructive/20 text-destructive text-sm font-bold">إعادة المستوى</button></div></div> : null;
            })}
          </div>
        </section>

        <section className="glass-card rounded-2xl p-6">
          <h2 className="text-lg font-bold text-primary mb-2 flex items-center gap-2">
            <Clock className="w-5 h-5" /> طلاب في انتظار إعادة السرد ({scheduled.length})
          </h2>
          <p className="text-xs text-muted-foreground mb-4">يحق لك السماح بإعادة السرد فوراً دون انتظار يومين.</p>
          {scheduled.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">لا يوجد</p>
          ) : (
            <div className="space-y-2">
              {scheduled.map((q) => {
                const s = students.find((x) => x.id === q.studentId);
                const h = halaqat.find((x) => x.id === q.halaqaId);
                if (!s || !h) return null;
                return (
                  <div key={q.id} className="flex items-center justify-between p-3 rounded-lg bg-warning/5 border border-warning/20">
                    <div>
                      <div className="font-bold">{s.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">{h.name} · {weekLabel(q.week)}</div>
                    </div>
                    <button onClick={() => forceImmediate(q.id, s.name)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning/20 text-warning border border-warning/30 font-bold text-sm">
                      <Zap className="w-4 h-4" /> الإعادة الآن
                    </button>
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
