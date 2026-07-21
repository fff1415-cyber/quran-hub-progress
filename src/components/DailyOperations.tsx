import { useEffect, useMemo, useState } from "react";
import {
  loadHalaqat, loadStudents, loadGrades, loadSardQueue, updateSardItem, pushNotification,
  loadLatePermissions, saveLatePermissions, loadMessageTemplates, formatMessage,
  loadAttendanceArchive, acknowledgeAttendance,
  type WeekRecord, type Student, type SardQueueItem,
} from "@/lib/mock-data";
import { weekLabel } from "@/lib/arabic-numbers";
import { getCalendarDayKey, getCalendarIsoDate } from "@/lib/operational-date";
import { fetchActiveCalendar, type AcademicCalendar } from "@/lib/academic-context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Search, UserX, Clock, Mic, MessageCircle, Check, Zap, RotateCcw,
  AlertTriangle, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

type OpsTab = "absence" | "late" | "sard";

function matchesSearch(name: string, query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  return name.includes(q);
}

function EmptySearchState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
      <Search className="w-10 h-10 mb-3 opacity-30" />
      <p className="text-sm">ابدأ بكتابة اسم الطالب للبحث...</p>
    </div>
  );
}

function TabBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Badge variant="default" className="mr-1.5 h-5 min-w-5 justify-center px-1.5 text-[10px]">
      {count}
    </Badge>
  );
}

export function DailyOperations() {
  const halaqat = loadHalaqat();
  const [students] = useState<Student[]>(() => loadStudents());
  const grades = loadGrades();
  const templates = loadMessageTemplates();
  const [calendar, setCalendar] = useState<AcademicCalendar | null>(null);
  const todayISO = calendar?.operationalDate ?? getCalendarIsoDate();
  const todayKey = calendar?.currentDayKey ?? getCalendarDayKey();
  const currentWeek = calendar?.currentWeekNumber ?? 1;
  const me = typeof window !== "undefined" ? sessionStorage.getItem("qs_name") || "الإداري" : "الإداري";

  useEffect(() => {
    fetchActiveCalendar().then(setCalendar).catch(() => {});
  }, []);

  const [tab, setTab] = useState<OpsTab>("absence");
  const [search, setSearch] = useState("");
  const [queue, setQueue] = useState(() => loadSardQueue());
  const [latePermissions, setLatePermissions] = useState(() => loadLatePermissions());
  const [archive, setArchive] = useState(() => loadAttendanceArchive());
  const [openLateId, setOpenLateId] = useState<string | null>(null);

  const refreshQueue = () => setQueue(loadSardQueue());
  const refreshArchive = () => setArchive(loadAttendanceArchive());

  const ackedToday = useMemo(
    () => new Set(archive.filter((a) => a.date === todayISO).map((a) => `${a.studentId}|${a.type}`)),
    [archive, todayISO],
  );

  const todayAttendance = useMemo(() => {
    return students.map((s) => {
      const w: WeekRecord | undefined = grades[s.id]?.[currentWeek];
      const status = (w?.days[todayKey]?.attendance || "") as "absent" | "late" | "excused" | "present" | "";
      return { s, status };
    }).filter((x) => x.status && x.status !== "present" && !ackedToday.has(`${x.s.id}|${x.status}`));
  }, [students, grades, todayKey, ackedToday, currentWeek]);

  const absenceArchive = useMemo(() => archive.filter((a) => a.type === "absent"), [archive]);

  const lateTodayNeedingPerm = useMemo(() => {
    const lateToday = todayAttendance.filter((x) => x.status === "late").map((x) => x.s);
    const permittedToday = new Set(
      latePermissions.filter((p) => p.date === todayISO).map((p) => p.studentId),
    );
    return lateToday.filter((s) => !permittedToday.has(s.id));
  }, [todayAttendance, latePermissions, todayISO]);

  const scheduled = useMemo(() => queue.filter((q) => q.status === "scheduled"), [queue]);
  const activeSard = useMemo(() => {
    const now = Date.now();
    return queue.filter((q) => {
      if (["passed", "final_failed", "level_repeat"].includes(q.status)) return false;
      if (q.status === "pending" || q.status === "approved_third" || q.status === "awaiting_supervisor") return true;
      if (q.status === "scheduled" && q.scheduledAt && new Date(q.scheduledAt).getTime() <= now) return true;
      return false;
    });
  }, [queue]);
  const finalFailed = useMemo(() => queue.filter((q) => q.status === "final_failed"), [queue]);
  const passedSard = useMemo(() => queue.filter((q) => q.status === "passed"), [queue]);

  const pendingCounts = {
    absence: todayAttendance.length,
    late: lateTodayNeedingPerm.length,
    sard: scheduled.length + activeSard.length + finalFailed.length,
  };

  const showResults = search.trim().length > 0;
  const q = search.trim();

  const filteredTodayAttendance = useMemo(
    () => todayAttendance.filter(({ s }) => matchesSearch(s.name, q)),
    [todayAttendance, q],
  );
  const filteredAbsenceArchive = useMemo(
    () => absenceArchive.filter((a) => {
      const s = students.find((x) => x.id === a.studentId);
      return s && matchesSearch(s.name, q);
    }),
    [absenceArchive, students, q],
  );
  const filteredLateStudents = useMemo(
    () => students.filter((s) => matchesSearch(s.name, q)),
    [students, q],
  );
  const filteredSardItems = useMemo(() => {
    const actionable = [...scheduled, ...activeSard, ...finalFailed, ...passedSard];
    const seen = new Set<string>();
    return actionable.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      const s = students.find((x) => x.id === item.studentId);
      return s && matchesSearch(s.name, q);
    });
  }, [scheduled, activeSard, finalFailed, passedSard, students, q]);

  const ackToday = (s: Student, type: "absent" | "late" | "excused") => {
    acknowledgeAttendance({ studentId: s.id, halaqaId: s.halaqaId, type, date: todayISO, dayKey: todayKey, acknowledgedBy: me });
    refreshArchive();
    toast.success(type === "absent" ? "نُقل إلى سجل الغياب" : type === "late" ? "نُقل إلى سجل التأخر" : "تم");
  };

  const grantLate = (studentId: string) => {
    const s = students.find((x) => x.id === studentId);
    if (!s) return;
    const h = halaqat.find((x) => x.id === s.halaqaId);
    const next = [{
      id: `late-${Date.now()}`,
      studentId: s.id,
      halaqaId: s.halaqaId,
      grantedBy: me,
      grantedAt: new Date().toISOString(),
      date: todayISO,
    }, ...latePermissions];
    setLatePermissions(next);
    saveLatePermissions(next);
    pushNotification({
      message: `تم منح الطالب ${s.name} إذن الدخول إلى ${h?.name || "الحلقة"} من قِبل ${me}`,
      type: "late",
      targetHalaqaId: s.halaqaId,
      actionTab: "late",
    });
    toast.success("تم تسجيل إذن الدخول وإشعار معلم الحلقة");
    setOpenLateId(null);
  };

  const forceImmediate = (id: string, name: string) => {
    updateSardItem(id, { status: "pending", scheduledAt: new Date().toISOString() });
    pushNotification({ message: `سمح ${me} بإعادة سرد فوري للطالب ${name}`, type: "sard" });
    toast.success("تم — يمكن للمسمّع البدء فوراً");
    refreshQueue();
  };

  const retryFinal = (id: string) => {
    updateSardItem(id, { status: "pending", attempt: 1, scheduledAt: undefined, hifzErrors: 0, reviewErrors: [0, 0, 0, 0, 0] });
    toast.success("تمت إعادة الطالب لقائمة السرد");
    refreshQueue();
  };

  const repeatLevel = (id: string) => {
    updateSardItem(id, { status: "level_repeat" });
    toast.success("تم تسجيل قرار إعادة المستوى");
    refreshQueue();
  };

  const handleTabChange = (value: string) => {
    setTab(value as OpsTab);
    setSearch("");
    setOpenLateId(null);
  };

  const statusLabel: Record<string, string> = { absent: "غائب", late: "متأخر", excused: "مستأذن" };
  const statusColor: Record<string, string> = {
    absent: "bg-destructive/15 text-destructive border-destructive/30",
    late: "bg-warning/15 text-warning border-warning/30",
    excused: "bg-primary/15 text-primary border-primary/30",
  };

  const renderSardCard = (item: SardQueueItem) => {
    const s = students.find((x) => x.id === item.studentId);
    const h = halaqat.find((x) => x.id === item.halaqaId);
    if (!s || !h) return null;

    if (item.status === "scheduled") {
      return (
        <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-warning/5 border border-warning/20">
          <div>
            <div className="font-bold">{s.name}</div>
            <div className="text-xs text-muted-foreground mt-1">{h.name} · {weekLabel(item.week)} · انتظار إعادة السرد</div>
          </div>
          <button onClick={() => forceImmediate(item.id, s.name)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning/20 text-warning border border-warning/30 font-bold text-sm shrink-0">
            <Zap className="w-4 h-4" /> الإعادة الآن
          </button>
        </div>
      );
    }

    if (item.status === "final_failed") {
      return (
        <div key={item.id} className="flex items-center justify-between gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex-wrap">
          <div>
            <div className="font-medium">{s.name}</div>
            <div className="text-xs text-muted-foreground">{h.name} · {weekLabel(item.week)} · راسب نهائياً {item.finalPercent != null ? `(${item.finalPercent}%)` : ""}</div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => retryFinal(item.id)} className="px-3 py-1.5 rounded-lg bg-warning/20 text-warning text-sm font-bold">إعادة السرد</button>
            <button onClick={() => repeatLevel(item.id)} className="px-3 py-1.5 rounded-lg bg-destructive/20 text-destructive text-sm font-bold">إعادة المستوى</button>
          </div>
        </div>
      );
    }

    if (item.status === "passed") {
      const msg = encodeURIComponent(formatMessage(templates.sard_pass, { student: s.name, halaqa: h.name, week: weekLabel(item.week), percent: item.finalPercent ?? "" }));
      return (
        <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-success/10 border border-success/20">
          <div>
            <div className="font-medium">{s.name}</div>
            <div className="text-xs text-muted-foreground">{h.name} · مجتاز {item.finalPercent != null ? `${item.finalPercent}%` : ""}</div>
          </div>
          <a href={`https://wa.me/${s.parentPhone}?text=${msg}`} target="_blank" rel="noreferrer"
            className="text-success font-bold text-sm flex items-center gap-1 shrink-0">
            <MessageCircle className="w-4 h-4" /> واتساب
          </a>
        </div>
      );
    }

    return (
      <div key={item.id} className="p-3 rounded-lg bg-secondary/50 border border-border">
        <div className="font-bold text-sm">{s.name}</div>
        <div className="text-xs text-muted-foreground mt-1">{h.name} · {weekLabel(item.week)} · {item.status}</div>
        {item.attempt > 1 && (
          <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-warning/20 text-warning">
            محاولة {item.attempt}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={handleTabChange} dir="rtl">
        <TabsList className="w-full h-auto flex flex-wrap gap-1 p-1.5 bg-secondary/50 border border-border rounded-xl">
          <TabsTrigger
            value="absence"
            className="flex-1 min-w-[120px] gap-1.5 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
          >
            <UserX className="w-4 h-4" />
            سجل الغياب
            <TabBadge count={pendingCounts.absence} />
          </TabsTrigger>
          <TabsTrigger
            value="late"
            className="flex-1 min-w-[120px] gap-1.5 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
          >
            <Clock className="w-4 h-4" />
            إذن التأخر
            <TabBadge count={pendingCounts.late} />
          </TabsTrigger>
          <TabsTrigger
            value="sard"
            className="flex-1 min-w-[120px] gap-1.5 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
          >
            <Mic className="w-4 h-4" />
            إدارة السرد
            <TabBadge count={pendingCounts.sard} />
          </TabsTrigger>
        </TabsList>

        <div className="relative mt-4">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث باسم الطالب..."
            className="pr-10 py-5 text-base bg-input border-border"
          />
        </div>

        <TabsContent value="absence" className="mt-4">
          {!showResults ? (
            <EmptySearchState />
          ) : filteredTodayAttendance.length === 0 && filteredAbsenceArchive.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">لا توجد نتائج لـ «{q}»</p>
          ) : (
            <div className="space-y-4">
              {filteredTodayAttendance.length > 0 && (
                <section>
                  <h3 className="text-sm font-bold text-primary mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> حالات اليوم ({filteredTodayAttendance.length})
                  </h3>
                  <div className="space-y-2">
                    {filteredTodayAttendance.map(({ s, status }) => {
                      const h = halaqat.find((x) => x.id === s.halaqaId);
                      const template = status === "late" ? templates.late : templates.absence;
                      const msg = encodeURIComponent(formatMessage(template, { student: s.name, halaqa: h?.name }));
                      return (
                        <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-1 rounded text-xs font-bold border ${statusColor[status]}`}>{statusLabel[status]}</span>
                            <div>
                              <div className="font-medium">{s.name}</div>
                              <div className="text-xs text-muted-foreground">{h?.name}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <a href={`https://wa.me/${s.parentPhone}?text=${msg}`} target="_blank" rel="noreferrer"
                              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success/20 text-success border border-success/30 text-sm font-bold">
                              <MessageCircle className="w-4 h-4" /> واتساب
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
                </section>
              )}
              {filteredAbsenceArchive.length > 0 && (
                <section>
                  <h3 className="text-sm font-bold text-destructive mb-2 flex items-center gap-2">
                    <UserX className="w-4 h-4" /> سجل الغياب السابق ({filteredAbsenceArchive.length})
                  </h3>
                  <div className="space-y-1">
                    {filteredAbsenceArchive.slice(0, 30).map((a) => {
                      const s = students.find((x) => x.id === a.studentId);
                      const h = halaqat.find((x) => x.id === a.halaqaId);
                      return (
                        <div key={a.id} className="p-2 rounded bg-destructive/5 text-sm flex justify-between">
                          <span>{s?.name} · {h?.name}</span>
                          <span className="text-muted-foreground">{a.date}</span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="late" className="mt-4">
          {!showResults ? (
            <EmptySearchState />
          ) : filteredLateStudents.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">لا توجد نتائج لـ «{q}»</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {filteredLateStudents.map((s) => {
                const h = halaqat.find((x) => x.id === s.halaqaId);
                const hist = latePermissions.filter((p) => p.studentId === s.id);
                const hasTodayPerm = hist.some((p) => p.date === todayISO);
                const open = openLateId === s.id;
                return (
                  <div key={s.id} className="rounded-lg border border-border bg-secondary/30">
                    <button onClick={() => setOpenLateId(open ? null : s.id)}
                      className="w-full p-3 text-right flex items-center justify-between hover:bg-primary/5">
                      <div>
                        <div className="font-medium text-sm">{s.name}</div>
                        <div className="text-xs text-muted-foreground">{h?.name}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="px-2 py-1 rounded bg-warning/15 text-warning text-xs font-bold">{hist.length} تأخر</span>
                        {hasTodayPerm && (
                          <span className="px-2 py-0.5 rounded bg-success/15 text-success text-[10px] font-bold flex items-center gap-0.5">
                            <CheckCircle2 className="w-3 h-3" /> مُمنَح اليوم
                          </span>
                        )}
                      </div>
                    </button>
                    {open && (
                      <div className="border-t border-border p-3 bg-background/40 space-y-2">
                        <div className="text-xs font-bold text-muted-foreground">سجل التأخر:</div>
                        {hist.length === 0 ? (
                          <div className="text-xs text-muted-foreground">لا يوجد تأخر سابق</div>
                        ) : (
                          <ul className="text-xs space-y-1 max-h-32 overflow-auto">
                            {hist.map((p) => (
                              <li key={p.id} className="flex justify-between">
                                <span>{p.date}</span>
                                <span className="text-muted-foreground">أذن: {p.grantedBy}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {!hasTodayPerm && (
                          <button onClick={() => grantLate(s.id)}
                            className="w-full px-3 py-2 rounded-lg bg-warning/20 text-warning border border-warning/30 font-bold text-sm flex items-center justify-center gap-1">
                            <Check className="w-4 h-4" /> منح إذن الدخول الآن
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sard" className="mt-4">
          {!showResults ? (
            <EmptySearchState />
          ) : filteredSardItems.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">لا توجد نتائج لـ «{q}»</p>
          ) : (
            <div className="space-y-2">
              {filteredSardItems.map(renderSardCard)}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
