import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  loadHalaqat, loadStudents, loadGrades, loadSardQueue,
  loadLatePermissions, saveLatePermissions, loadMessageTemplates, formatMessage,
  pushNotification, updateSardItem, DAYS,
  type WeekRecord, type Student, type GradesStore,
} from "@/lib/mock-data";
import {
  buildForceImmediatePatch,
  forceRetryKind,
  isSupervisorForceRetryCandidate,
} from "@/lib/sard-phased-flow";
import { weekLabel } from "@/lib/arabic-numbers";
import { getCalendarDayKey, getCalendarIsoDate } from "@/lib/operational-date";
import { fetchActiveCalendar } from "@/lib/academic-context";
import { getSessionName } from "@/lib/session-role";
import { TabBadge } from "@/components/role-workspace/RoleShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, UserX, Clock, Search, CheckCircle2, AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";

function matchesSearch(name: string, query: string): boolean {
  const q = query.trim();
  return q.length > 0 && name.includes(q);
}

function totalLateCount(studentId: string, grades: GradesStore): number {
  const weeks = grades[studentId] || {};
  let count = 0;
  for (const w of Object.values(weeks)) {
    for (const d of DAYS) {
      if (w.days[d.key]?.attendance === "late") count++;
    }
  }
  return count;
}

function todayLabel(dayKey: string): string {
  return DAYS.find((d) => d.key === dayKey)?.label ?? dayKey;
}

function whatsappAbsenceMessage(studentName: string, status: "absent" | "late", dayKey: string): string {
  const statusWord = status === "absent" ? "غياب" : "تأخر";
  return `السلام عليكم، نُعلمكم بـ ${statusWord} الطالب ${studentName} ليوم ${todayLabel(dayKey)}.`;
}

export function SecretaryAttendancePanel() {
  const halaqat = loadHalaqat();
  const students = loadStudents();
  const grades = loadGrades();
  const [currentWeek, setCurrentWeek] = useState(1);
  const todayKey = getCalendarDayKey();

  useEffect(() => {
    fetchActiveCalendar().then((cal) => setCurrentWeek(cal.currentWeekNumber)).catch(() => {});
  }, []);

  const todayAbsentOrLate = useMemo(() => {
    return students
      .map((s) => {
        const w: WeekRecord | undefined = grades[s.id]?.[currentWeek];
        const status = (w?.days[todayKey]?.attendance || "") as "absent" | "late" | "";
        return { s, status };
      })
      .filter((x): x is { s: Student; status: "absent" | "late" } =>
        x.status === "absent" || x.status === "late",
      );
  }, [students, grades, todayKey, currentWeek]);

  return (
    <Card className="glass-card border-primary/15 shadow-none">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2 text-primary">
          <UserX className="w-5 h-5" /> غياب وتأخر اليوم
          <TabBadge count={todayAbsentOrLate.length} />
        </CardTitle>
        <CardDescription>حالة اليوم ({todayLabel(todayKey)}) — إرسال واتساب لولي الأمر</CardDescription>
      </CardHeader>
      <CardContent>
        {todayAbsentOrLate.length === 0 ? (
          <p className="text-muted-foreground text-center py-8 text-sm">لا يوجد غياب أو تأخر اليوم</p>
        ) : (
          <div className="space-y-2">
            {todayAbsentOrLate.map(({ s, status }) => {
              const h = halaqat.find((x) => x.id === s.halaqaId);
              const isAbsent = status === "absent";
              const msg = encodeURIComponent(whatsappAbsenceMessage(s.name, status, todayKey));
              return (
                <div key={s.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-secondary/50 flex-wrap">
                  <div className="flex items-center gap-3">
                    <Badge variant={isAbsent ? "destructive" : "secondary"} className={isAbsent ? "" : "bg-warning/20 text-warning border-warning/30"}>
                      {isAbsent ? "غائب" : "متأخر"}
                    </Badge>
                    <div>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{h?.name}</div>
                    </div>
                  </div>
                  <Button asChild variant="outline" size="sm" className="bg-success/10 text-success border-success/30">
                    <a href={`https://wa.me/${s.parentPhone}?text=${msg}`} target="_blank" rel="noreferrer">
                      <MessageCircle className="w-4 h-4" /> واتساب
                    </a>
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SecretaryLatePermitPanel() {
  const halaqat = loadHalaqat();
  const students = loadStudents();
  const grades = loadGrades();
  const [latePermissions, setLatePermissions] = useState(() => loadLatePermissions());
  const [search, setSearch] = useState("");
  const todayISO = getCalendarIsoDate();
  const me = getSessionName("السكرتير");

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return [];
    return students.filter((s) => matchesSearch(s.name, q));
  }, [students, search]);

  const grantLate = (studentId: string) => {
    const s = students.find((x) => x.id === studentId);
    if (!s) return;
    const h = halaqat.find((x) => x.id === s.halaqaId);
    if (latePermissions.some((p) => p.studentId === studentId && p.date === todayISO)) {
      toast.info("مُمنَح إذن الدخول اليوم مسبقاً");
      return;
    }
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
      message: `تم منح ${s.name} إذن الدخول — ${h?.name || "الحلقة"}`,
      type: "late",
      targetHalaqaId: s.halaqaId,
      actionTab: "late",
    });
    toast.success("تم تسجيل إذن الدخول");
  };

  return (
    <Card className="glass-card border-primary/15 shadow-none">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2 text-warning">
          <Clock className="w-5 h-5" /> إذن الدخول
        </CardTitle>
        <CardDescription>ابحث عن الطالب لمنحه إذن دخول فوراً</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث باسم الطالب..." className="pr-10 py-5" />
        </div>
        {!search.trim() ? (
          <p className="text-center text-muted-foreground py-12 text-sm">ابدأ بكتابة اسم الطالب...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-12 text-sm">لا توجد نتائج</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {filtered.map((s) => {
              const h = halaqat.find((x) => x.id === s.halaqaId);
              const grantedToday = latePermissions.some((p) => p.studentId === s.id && p.date === todayISO);
              return (
                <Card key={s.id} className="border-border bg-secondary/30 shadow-none">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex justify-between gap-2">
                      <div>
                        <div className="font-bold">{s.name}</div>
                        <div className="text-xs text-muted-foreground">{h?.name}</div>
                      </div>
                      <Badge className="bg-warning/15 text-warning border-warning/30">{totalLateCount(s.id, grades)} تأخر</Badge>
                    </div>
                    {grantedToday ? (
                      <div className="flex items-center gap-1.5 text-xs text-success font-bold">
                        <CheckCircle2 className="w-4 h-4" /> مُمنَح اليوم
                      </div>
                    ) : (
                      <Button type="button" onClick={() => grantLate(s.id)} variant="outline"
                        className="w-full bg-warning/20 text-warning border-warning/30">
                        <Check className="w-4 h-4" /> منح إذن الدخول
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SecretarySardPanel() {
  const halaqat = loadHalaqat();
  const students = loadStudents();
  const templates = loadMessageTemplates();
  const [queue] = useState(() => loadSardQueue());
  const passedSard = useMemo(() => queue.filter((q) => q.status === "passed"), [queue]);
  const finalFailed = useMemo(() => queue.filter((q) => q.status === "final_failed"), [queue]);

  return (
    <div className="space-y-6">
      <Card className="glass-card border-primary/15 shadow-none">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-success">
            <CheckCircle2 className="w-5 h-5" /> المجتازون <TabBadge count={passedSard.length} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {passedSard.length === 0 ? (
            <p className="text-muted-foreground text-center py-8 text-sm">لا يوجد مجتازون</p>
          ) : (
            <div className="space-y-2">
              {passedSard.map((q) => {
                const s = students.find((x) => x.id === q.studentId);
                const h = halaqat.find((x) => x.id === q.halaqaId);
                if (!s || !h) return null;
                const msg = encodeURIComponent(formatMessage(templates.sard_pass, {
                  student: s.name, halaqa: h.name, week: weekLabel(q.week), percent: q.finalPercent ?? "",
                }));
                return (
                  <div key={q.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-success/10 border border-success/20 flex-wrap">
                    <div>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{h.name} · {weekLabel(q.week)}</div>
                    </div>
                    <Button asChild variant="outline" size="sm" className="bg-success/10 text-success border-success/30">
                      <a href={`https://wa.me/${s.parentPhone}?text=${msg}`} target="_blank" rel="noreferrer">
                        <MessageCircle className="w-4 h-4" /> واتساب
                      </a>
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="glass-card border-primary/15 shadow-none">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" /> الراسبون <TabBadge count={finalFailed.length} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {finalFailed.length === 0 ? (
            <p className="text-muted-foreground text-center py-8 text-sm">لا يوجد رسوب نهائي</p>
          ) : (
            <div className="space-y-2">
              {finalFailed.map((q) => {
                const s = students.find((x) => x.id === q.studentId);
                const h = halaqat.find((x) => x.id === q.halaqaId);
                if (!s || !h) return null;
                const msg = encodeURIComponent(formatMessage(templates.sard_fail, {
                  student: s.name, halaqa: h.name, week: weekLabel(q.week), percent: q.finalPercent ?? "",
                }));
                return (
                  <div key={q.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex-wrap">
                    <div>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{h.name} · {weekLabel(q.week)}</div>
                    </div>
                    <Button asChild variant="outline" size="sm" className="bg-success/10 text-success border-success/30">
                      <a href={`https://wa.me/${s.parentPhone}?text=${msg}`} target="_blank" rel="noreferrer">
                        <MessageCircle className="w-4 h-4" /> واتساب
                      </a>
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function SupervisorHalaqatPanel() {
  const halaqat = loadHalaqat();
  return (
    <section className="glass-card rounded-2xl p-6">
      <h2 className="text-lg font-bold text-primary mb-3">الحلقات ({halaqat.length})</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {halaqat.map((h) => (
          <Link key={h.id} to="/teacher" search={{ h: h.id }}
            className="p-3 rounded-lg bg-secondary/50 hover:bg-primary/10 border border-transparent hover:border-primary text-sm">
            {h.name}
          </Link>
        ))}
      </div>
    </section>
  );
}

export function SupervisorApprovalsPanel() {
  const [queue, setQueue] = useState(() => loadSardQueue());
  const students = loadStudents();
  const halaqat = loadHalaqat();
  const refresh = () => setQueue(loadSardQueue());
  const awaiting = queue.filter((q) => q.status === "awaiting_supervisor");

  const approveThird = (id: string, name: string) => {
    updateSardItem(id, {
      status: "approved_third",
      attempt: 3,
      phase: "full",
      hifzErrors: 0,
      hifzWarnings: 0,
      reviewErrors: [0, 0, 0, 0, 0],
      reviewWarnings: [0, 0, 0, 0, 0],
      lockedHifzScore: undefined,
      lockedHifzErrors: undefined,
      lockedHifzWarnings: undefined,
      reviewSegmentCount: undefined,
    });
    pushNotification({ message: `وافق المشرف على محاولة ثالثة — ${name}`, type: "sard" });
    toast.success("تمت الموافقة");
    refresh();
  };

  return (
    <section className="glass-card rounded-2xl p-6">
      <h2 className="text-lg font-bold text-primary mb-4">موافقات المحاولة الثالثة ({awaiting.length})</h2>
      {awaiting.length === 0 ? (
        <p className="text-muted-foreground text-center py-8 text-sm">لا توجد طلبات</p>
      ) : (
        <div className="space-y-2">
          {awaiting.map((q) => {
            const s = students.find((x) => x.id === q.studentId);
            const h = halaqat.find((x) => x.id === q.halaqaId);
            if (!s || !h) return null;
            return (
              <div key={q.id} className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 border border-border flex-wrap gap-2">
                <div>
                  <div className="font-bold">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{h.name} · {weekLabel(q.week)}</div>
                </div>
                <button onClick={() => approveThird(q.id, s.name)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg gold-gradient text-primary-foreground font-bold text-sm">
                  <Check className="w-4 h-4" /> السماح بمحاولة ثالثة
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function SupervisorForceRetryPanel() {
  const [queue, setQueue] = useState(() => loadSardQueue());
  const students = loadStudents();
  const halaqat = loadHalaqat();
  const scheduled = queue.filter((q) => isSupervisorForceRetryCandidate(q));

  const forceImmediate = (item: typeof scheduled[number], name: string) => {
    const kind = forceRetryKind(item);
    updateSardItem(item.id, buildForceImmediatePatch(item));
    pushNotification({
      message: kind === "review"
        ? `سمح المشرف بإعادة مراجعة فورية — ${name}`
        : `سمح المشرف بإعادة سرد فوري — ${name}`,
      type: "sard",
    });
    toast.success(kind === "review" ? "تم — يمكن للمسمّع إجراء المراجعة فوراً" : "تم — يمكن للمسمّع البدء فوراً");
    setQueue(loadSardQueue());
  };

  return (
    <section className="glass-card rounded-2xl p-6">
      <h2 className="text-lg font-bold text-primary mb-2">إعادة فورية ({scheduled.length})</h2>
      <p className="text-xs text-muted-foreground mb-4">السماح بإعادة السرد أو المراجعة دون انتظار يومين</p>
      {scheduled.length === 0 ? (
        <p className="text-muted-foreground text-center py-8 text-sm">لا يوجد طلاب مجدولون</p>
      ) : (
        <div className="space-y-2">
          {scheduled.map((q) => {
            const s = students.find((x) => x.id === q.studentId);
            const h = halaqat.find((x) => x.id === q.halaqaId);
            if (!s || !h) return null;
            const kind = forceRetryKind(q);
            return (
              <div key={q.id} className="flex items-center justify-between p-4 rounded-lg bg-warning/5 border border-warning/20 flex-wrap gap-2">
                <div>
                  <div className="font-bold">{s.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {h.name} · {weekLabel(q.week)} · {kind === "review" ? "انتظار إعادة المراجعة" : "انتظار إعادة السرد"}
                  </div>
                </div>
                <button onClick={() => forceImmediate(q, s.name)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-warning/20 text-warning border border-warning/30 font-bold text-sm">
                  <Clock className="w-4 h-4" /> {kind === "review" ? "المراجعة الآن" : "الإعادة الآن"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function SupervisorPassedPanel() {
  const students = loadStudents();
  const halaqat = loadHalaqat();
  const [queue] = useState(() => loadSardQueue());
  const passedSard = queue.filter((q) => q.status === "passed");

  return (
    <section className="glass-card rounded-2xl p-6">
      <h2 className="text-lg font-bold text-success mb-4">المجتازون ({passedSard.length})</h2>
      {passedSard.length === 0 ? (
        <p className="text-muted-foreground text-center py-6 text-sm">لا يوجد مجتازون</p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-auto">
          {passedSard.map((q) => {
            const s = students.find((x) => x.id === q.studentId);
            const h = halaqat.find((x) => x.id === q.halaqaId);
            if (!s || !h) return null;
            return (
              <div key={q.id} className="flex items-center justify-between p-3 rounded-lg bg-success/10 border border-success/20">
                <div>
                  <div className="font-bold text-sm">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{h.name} · {weekLabel(q.week)}</div>
                </div>
                <span className="px-2 py-1 rounded bg-success/20 text-success text-xs font-bold">{q.finalPercent}%</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
