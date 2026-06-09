import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  loadHalaqat, loadStudents, loadGrades, loadNotifications, DAYS,
  loadSardQueue, updateSardItem, pushNotification, dismissNotification,
  type WeekRecord,
} from "@/lib/mock-data";
import { getOperationalDayKey } from "@/lib/operational-date";
import { weekLabel } from "@/lib/arabic-numbers";
import { AppHeader } from "@/components/AppHeader";
import { LateSardList, ActiveSardList } from "@/components/SardLists";
import { Bell, MessageCircle, TrendingUp, UserX, Send, Zap, Clock, Check } from "lucide-react";
import { Toaster, toast } from "sonner";

export const Route = createFileRoute("/admin")({ component: AdminPage });

function AdminPage() {
  const halaqat = loadHalaqat();
  const students = loadStudents();
  const grades = loadGrades();
  const [notifications, setNotifications] = useState(() => loadNotifications());
  const [queue, setQueue] = useState(() => loadSardQueue());
  const [tab, setTab] = useState<"today" | "cumulative" | "progress" | "sard" | "alerts">("today");
  const unread = notifications.filter((n) => !n.read);

  const resolveNotif = (id: string, targetTab?: string) => {
    dismissNotification(id);
    setNotifications(loadNotifications());
    if (targetTab === "sard" || targetTab === "today") setTab(targetTab as any);
    else if (targetTab === "late") setTab("today");
  };

  const todayKey = useMemo(() => getOperationalDayKey(), []);
  const scheduled = queue.filter((q) => q.status === "scheduled");

  const forceImmediate = (id: string, name: string) => {
    updateSardItem(id, { status: "pending", scheduledAt: new Date().toISOString() });
    pushNotification({ message: `سمح الإداري بإعادة سرد فوري للطالب ${name}`, type: "sard" });
    toast.success("تم — يمكن للمسمّع البدء فوراً");
    setQueue(loadSardQueue());
  };

  const todayAbsents = useMemo(() => {
    const currentWeek = 1; // for demo
    return students.filter((s) => {
      const w: WeekRecord | undefined = grades[s.id]?.[currentWeek];
      return w?.days[todayKey]?.attendance === "absent";
    });
  }, [students, grades, todayKey]);

  const cumulativeAbsents = useMemo(() => {
    const map: Record<string, number> = {};
    students.forEach((s) => {
      let count = 0;
      const weeks = grades[s.id] || {};
      Object.values(weeks).forEach((w) => {
        DAYS.forEach((d) => { if (w.days[d.key]?.attendance === "absent") count++; });
      });
      if (count > 0) map[s.id] = count;
    });
    return Object.entries(map).map(([sid, count]) => ({ student: students.find((s) => s.id === sid)!, count }));
  }, [students, grades]);

  const halaqaProgress = useMemo(() => {
    return halaqat.map((h) => {
      const hStudents = students.filter((s) => s.halaqaId === h.id);
      const weeks: { week: number; pct: number }[] = [];
      for (let w = 1; w <= 18; w++) {
        let passed = 0;
        hStudents.forEach((s) => {
          if (grades[s.id]?.[w]?.testMuraja) passed++;
        });
        const pct = hStudents.length ? Math.round((passed / hStudents.length) * 100) : 0;
        if (pct > 0) weeks.push({ week: w, pct });
      }
      return { halaqa: h, weeks };
    });
  }, [halaqat, students, grades]);

  const tabs = [
    { id: "today", label: "غياب اليوم", icon: UserX, count: todayAbsents.length },
    { id: "cumulative", label: "السجل التراكمي", icon: Bell, count: cumulativeAbsents.length },
    { id: "progress", label: "متابعة الربط والمراجعة", icon: TrendingUp },
    { id: "sard", label: "السرد المعلّق", icon: Clock, count: scheduled.length },
    { id: "alerts", label: "الإشعارات", icon: Bell, count: notifications.filter((n) => !n.read).length },
  ];

  return (
    <div className="min-h-screen">
      <Toaster position="top-center" richColors />
      <AppHeader title="لوحة الإداري" subtitle="الإدارة العامة" />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="glass-card rounded-2xl p-6 mb-6">
          <h1 className="display text-3xl gold-text mb-1">لوحة الإداري</h1>
          <p className="text-muted-foreground text-sm">إدارة الغياب والمتابعة والإشعارات</p>
          <div className="mt-4">
            <Link to="/dashboard" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg gold-gradient text-primary-foreground text-sm font-bold">
              فتح لوحة التحكم الكاملة
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                  active ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-bold">{t.count}</span>
                )}
              </button>
            );
          })}
        </div>

        {tab === "today" && (
          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-4 text-primary">غياب اليوم</h2>
            {todayAbsents.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">لا يوجد غياب اليوم</p>
            ) : (
              <div className="space-y-2">
                {todayAbsents.map((s) => {
                  const halaqa = halaqat.find((h) => h.id === s.halaqaId);
                  const msg = encodeURIComponent(`السلام عليكم، نُعلمكم بغياب الطالب ${s.name} عن حلقة ${halaqa?.name} اليوم.`);
                  return (
                    <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                      <div>
                        <div className="font-medium">{s.name}</div>
                        <div className="text-xs text-muted-foreground">{halaqa?.name}</div>
                      </div>
                      <a
                        href={`https://wa.me/${s.parentPhone}?text=${msg}`}
                        target="_blank" rel="noreferrer"
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success/20 text-success border border-success/30 text-sm"
                      >
                        <MessageCircle className="w-4 h-4" />
                        إرسال واتساب
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "cumulative" && (
          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-4 text-primary">السجل التراكمي للغياب</h2>
            {cumulativeAbsents.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">لا توجد سجلات غياب</p>
            ) : (
              <table className="w-full">
                <thead><tr className="text-right text-sm text-muted-foreground border-b border-border">
                  <th className="p-2">الطالب</th><th className="p-2">الحلقة</th><th className="p-2">عدد مرات الغياب</th>
                </tr></thead>
                <tbody>
                  {cumulativeAbsents.map(({ student, count }) => (
                    <tr key={student.id} className="border-b border-border/30">
                      <td className="p-2">{student.name}</td>
                      <td className="p-2 text-muted-foreground">{halaqat.find((h) => h.id === student.halaqaId)?.name}</td>
                      <td className="p-2"><span className="px-2 py-1 rounded bg-destructive/20 text-destructive font-bold">{count}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "progress" && (
          <div className="space-y-4">
            {halaqaProgress.map(({ halaqa, weeks }) => (
              <div key={halaqa.id} className="glass-card rounded-2xl p-6">
                <h3 className="font-bold text-primary mb-3">{halaqa.name}</h3>
                {weeks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا توجد اختبارات مفعّلة بعد</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                    {weeks.map(({ week, pct }) => (
                      <div key={week} className="p-3 rounded-lg bg-secondary/50 text-center">
                        <div className="text-xs text-muted-foreground">أسبوع {week}</div>
                        <div className="text-xl font-bold gold-text">{pct}%</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "sard" && (
          <div className="space-y-4">
            <ActiveSardList />
            <LateSardList />
            <div className="glass-card rounded-2xl p-6">
              <h2 className="text-lg font-bold mb-2 text-primary">طلاب في انتظار إعادة السرد بعد رسوب</h2>
              <p className="text-xs text-muted-foreground mb-4">يحق للإداري السماح بإعادة السرد فوراً دون انتظار يومين.</p>
              {scheduled.length === 0 ? (
                <p className="text-muted-foreground text-center py-6 text-sm">لا يوجد</p>
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
            </div>
          </div>
        )}

        {tab === "alerts" && (
          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-4 text-primary">الإشعارات</h2>
            {notifications.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">لا توجد إشعارات</p>
            ) : (
              <div className="space-y-2">
                {notifications.map((n) => (
                  <div key={n.id} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                    <Send className="w-4 h-4 text-primary mt-1" />
                    <div className="flex-1">
                      <div className="text-sm">{n.message}</div>
                      <div className="text-xs text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString("ar")}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
