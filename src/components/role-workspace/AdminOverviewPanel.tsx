import { useEffect, useMemo, useState } from "react";
import {
  loadHalaqat, loadStudents, loadGrades, loadNotifications, DAYS,
  loadSardQueue, updateSardItem, pushNotification, dismissNotification,
  type WeekRecord,
} from "@/lib/mock-data";
import { getCalendarDayKey } from "@/lib/operational-date";
import { fetchActiveCalendar } from "@/lib/academic-context";
import { weekLabel } from "@/lib/arabic-numbers";
import { LateSardList, ActiveSardList } from "@/components/SardLists";
import { TabBadge } from "@/components/role-workspace/RoleShell";
import { Bell, MessageCircle, TrendingUp, UserX, Send, Zap, Clock, Check } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export function AdminOverviewPanel() {
  const halaqat = loadHalaqat();
  const students = loadStudents();
  const grades = loadGrades();
  const [notifications, setNotifications] = useState(() => loadNotifications());
  const [queue, setQueue] = useState(() => loadSardQueue());
  const [tab, setTab] = useState<"today" | "cumulative" | "progress" | "sard" | "alerts">("today");
  const [currentWeek, setCurrentWeek] = useState(1);
  const unread = notifications.filter((n) => !n.read);

  useEffect(() => {
    fetchActiveCalendar().then((cal) => setCurrentWeek(cal.currentWeekNumber)).catch(() => {});
  }, []);

  const resolveNotif = (id: string, targetTab?: string) => {
    dismissNotification(id);
    setNotifications(loadNotifications());
    if (targetTab === "sard" || targetTab === "today") setTab(targetTab as "today" | "sard");
    else if (targetTab === "late") setTab("today");
  };

  const todayKey = getCalendarDayKey();
  const scheduled = queue.filter((q) => q.status === "scheduled");

  const forceImmediate = (id: string, name: string) => {
    updateSardItem(id, { status: "pending", scheduledAt: new Date().toISOString() });
    pushNotification({ message: `سمح الإداري بإعادة سرد فوري للطالب ${name}`, type: "sard" });
    toast.success("تم — يمكن للمسمّع البدء فوراً");
    setQueue(loadSardQueue());
  };

  const todayAbsents = useMemo(() => {
    return students.filter((s) => {
      const w: WeekRecord | undefined = grades[s.id]?.[currentWeek];
      return w?.days[todayKey]?.attendance === "absent";
    });
  }, [students, grades, todayKey, currentWeek]);

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

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} dir="rtl">
      <TabsList className="w-full h-auto flex flex-wrap gap-1 p-1.5 bg-secondary/50 border border-border rounded-xl mb-4">
        <TabsTrigger value="today" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
          <UserX className="w-4 h-4" /> غياب اليوم <TabBadge count={todayAbsents.length} />
        </TabsTrigger>
        <TabsTrigger value="cumulative" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
          <Bell className="w-4 h-4" /> السجل التراكمي <TabBadge count={cumulativeAbsents.length} />
        </TabsTrigger>
        <TabsTrigger value="progress" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
          <TrendingUp className="w-4 h-4" /> الربط والمراجعة
        </TabsTrigger>
        <TabsTrigger value="sard" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
          <Clock className="w-4 h-4" /> السرد <TabBadge count={scheduled.length} />
        </TabsTrigger>
        <TabsTrigger value="alerts" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
          <Bell className="w-4 h-4" /> الإشعارات <TabBadge count={unread.length} />
        </TabsTrigger>
      </TabsList>

      <TabsContent value="today" className="mt-0">
        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-lg font-bold mb-4 text-primary">غياب اليوم</h2>
          {todayAbsents.length === 0 ? (
            <p className="text-muted-foreground text-center py-8 text-sm">لا يوجد غياب اليوم</p>
          ) : (
            <div className="space-y-2">
              {todayAbsents.map((s) => {
                const halaqa = halaqat.find((h) => h.id === s.halaqaId);
                const msg = encodeURIComponent(`السلام عليكم، نُعلمكم بغياب الطالب ${s.name} عن حلقة ${halaqa?.name} اليوم.`);
                return (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 flex-wrap gap-2">
                    <div>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{halaqa?.name}</div>
                    </div>
                    <a href={`https://wa.me/${s.parentPhone}?text=${msg}`} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success/20 text-success border border-success/30 text-sm font-bold">
                      <MessageCircle className="w-4 h-4" /> واتساب
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </TabsContent>

      <TabsContent value="cumulative" className="mt-0">
        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-lg font-bold mb-4 text-primary">السجل التراكمي للغياب</h2>
          {cumulativeAbsents.length === 0 ? (
            <p className="text-muted-foreground text-center py-8 text-sm">لا توجد سجلات غياب</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-right text-muted-foreground border-b border-border">
                    <th className="p-2">الطالب</th><th className="p-2">الحلقة</th><th className="p-2">مرات الغياب</th>
                  </tr>
                </thead>
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
            </div>
          )}
        </div>
      </TabsContent>

      <TabsContent value="progress" className="mt-0 space-y-4">
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
      </TabsContent>

      <TabsContent value="sard" className="mt-0 space-y-4">
        <ActiveSardList />
        <LateSardList />
        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-lg font-bold mb-2 text-primary">انتظار إعادة السرد</h2>
          {scheduled.length === 0 ? (
            <p className="text-muted-foreground text-center py-6 text-sm">لا يوجد</p>
          ) : (
            <div className="space-y-2">
              {scheduled.map((q) => {
                const s = students.find((x) => x.id === q.studentId);
                const h = halaqat.find((x) => x.id === q.halaqaId);
                if (!s || !h) return null;
                return (
                  <div key={q.id} className="flex items-center justify-between p-3 rounded-lg bg-warning/5 border border-warning/20 flex-wrap gap-2">
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
      </TabsContent>

      <TabsContent value="alerts" className="mt-0">
        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-lg font-bold mb-2 text-primary">إشعارات تحتاج إجراء</h2>
          {unread.length === 0 ? (
            <p className="text-muted-foreground text-center py-8 text-sm">لا توجد إشعارات معلّقة</p>
          ) : (
            <div className="space-y-2">
              {unread.map((n) => (
                <div key={n.id} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                  <Send className="w-4 h-4 text-primary mt-1 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">{n.message}</div>
                    <div className="text-xs text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString("ar")}</div>
                  </div>
                  <button onClick={() => { resolveNotif(n.id, n.actionTab); toast.success("تم"); }}
                    className="p-2 rounded-lg bg-success/15 text-success border border-success/30 shrink-0">
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}
