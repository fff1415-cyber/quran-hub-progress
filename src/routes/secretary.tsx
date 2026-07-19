import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  loadHalaqat, loadStudents, loadGrades, loadSardQueue,
  loadLatePermissions, saveLatePermissions, loadMessageTemplates, formatMessage,
  pushNotification, DAYS,
  type WeekRecord, type Student, type GradesStore,
} from "@/lib/mock-data";
import { weekLabel } from "@/lib/arabic-numbers";
import { getOperationalDayKey } from "@/lib/operational-date";
import { AppHeader } from "@/components/AppHeader";
import { GradesExport } from "@/components/GradesExport";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Clipboard, MessageCircle, UserX, Clock, Mic, Search,
  CheckCircle2, AlertTriangle, Check,
} from "lucide-react";
import { Toaster, toast } from "sonner";

export const Route = createFileRoute("/secretary")({ component: SecretaryPage });

type SecretaryTab = "attendance" | "sard";

function matchesSearch(name: string, query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  return name.includes(q);
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
  const day = todayLabel(dayKey);
  return `السلام عليكم، نُعلمكم بـ ${statusWord} الطالب ${studentName} ليوم ${day}.`;
}

function EmptySearchState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
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

function SecretaryPage() {
  const halaqat = loadHalaqat();
  const students = loadStudents();
  const grades = loadGrades();
  const templates = loadMessageTemplates();
  const [queue] = useState(() => loadSardQueue());
  const [latePermissions, setLatePermissions] = useState(() => loadLatePermissions());
  const [tab, setTab] = useState<SecretaryTab>("attendance");
  const [lateSearch, setLateSearch] = useState("");

  const todayKey = getOperationalDayKey();
  const todayISO = new Date().toISOString().slice(0, 10);
  const me = typeof window !== "undefined" ? sessionStorage.getItem("qs_name") || "السكرتير" : "السكرتير";

  const todayAbsentOrLate = useMemo(() => {
    const currentWeek = 1;
    return students
      .map((s) => {
        const w: WeekRecord | undefined = grades[s.id]?.[currentWeek];
        const status = (w?.days[todayKey]?.attendance || "") as "absent" | "late" | "";
        return { s, status };
      })
      .filter((x): x is { s: Student; status: "absent" | "late" } =>
        x.status === "absent" || x.status === "late",
      );
  }, [students, grades, todayKey]);

  const passedSard = useMemo(() => queue.filter((q) => q.status === "passed"), [queue]);
  const finalFailed = useMemo(() => queue.filter((q) => q.status === "final_failed"), [queue]);

  const filteredLateStudents = useMemo(() => {
    const q = lateSearch.trim();
    if (!q) return [];
    return students.filter((s) => matchesSearch(s.name, q));
  }, [students, lateSearch]);

  const grantLate = (studentId: string) => {
    const s = students.find((x) => x.id === studentId);
    if (!s) return;
    const h = halaqat.find((x) => x.id === s.halaqaId);
    const hasToday = latePermissions.some((p) => p.studentId === studentId && p.date === todayISO);
    if (hasToday) {
      toast.info("تم منح إذن الدخول لهذا الطالب اليوم مسبقاً");
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
      message: `تم منح الطالب ${s.name} إذن الدخول إلى ${h?.name || "الحلقة"} من قِبل ${me}`,
      type: "late",
      targetHalaqaId: s.halaqaId,
      actionTab: "late",
    });
    toast.success("تم تسجيل إذن الدخول وإشعار معلم الحلقة");
  };

  const handleTabChange = (value: string) => {
    setTab(value as SecretaryTab);
    setLateSearch("");
  };

  const attendanceTabCount = todayAbsentOrLate.length;

  return (
    <div className="min-h-screen">
      <Toaster position="top-center" richColors />
      <AppHeader title="لوحة السكرتير" subtitle={me} />
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <Card className="glass-card border-primary/15 shadow-none">
          <CardHeader className="flex flex-row items-center gap-4 pb-2">
            <div className="w-12 h-12 rounded-xl gold-gradient flex items-center justify-center shrink-0">
              <Clipboard className="w-6 h-6 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <CardTitle className="display text-xl gold-text">لوحة السكرتير</CardTitle>
              <CardDescription>
                متابعة الغياب والتأخر والسرد — يتجدد اليوم الساعة 2 ظهراً
              </CardDescription>
              <Link to="/daily-operations" className="inline-block mt-1 text-xs text-primary font-bold hover:underline">
                ← المتابعة اليومية (واجهة سريعة)
              </Link>
            </div>
          </CardHeader>
        </Card>

        <GradesExport />

        <Tabs value={tab} onValueChange={handleTabChange} dir="rtl">
          <TabsList className="w-full h-auto flex gap-1 p-1.5 bg-secondary/50 border border-border rounded-xl">
            <TabsTrigger
              value="attendance"
              className="flex-1 gap-1.5 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
            >
              <UserX className="w-4 h-4" />
              الغياب والتأخير
              <TabBadge count={attendanceTabCount} />
            </TabsTrigger>
            <TabsTrigger
              value="sard"
              className="flex-1 gap-1.5 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
            >
              <Mic className="w-4 h-4" />
              السرد
              <TabBadge count={passedSard.length + finalFailed.length} />
            </TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Attendance & late ── */}
          <TabsContent value="attendance" className="space-y-6 mt-6">
            <Card className="glass-card border-primary/15 shadow-none">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-primary">
                  <UserX className="w-5 h-5" />
                  غياب وتأخر اليوم
                  <TabBadge count={todayAbsentOrLate.length} />
                </CardTitle>
                <CardDescription>
                  طلاب حالتهم اليوم ({todayLabel(todayKey)}) — غائب أو متأخر
                </CardDescription>
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
                            <Badge
                              variant={isAbsent ? "destructive" : "secondary"}
                              className={isAbsent ? "" : "bg-warning/20 text-warning border-warning/30"}
                            >
                              {isAbsent ? "غائب" : "متأخر"}
                            </Badge>
                            <div>
                              <div className="font-medium">{s.name}</div>
                              <div className="text-xs text-muted-foreground">{h?.name}</div>
                            </div>
                          </div>
                          <Button asChild variant="outline" size="sm"
                            className="bg-success/10 text-success border-success/30 hover:bg-success/20 hover:text-success">
                            <a href={`https://wa.me/${s.parentPhone}?text=${msg}`} target="_blank" rel="noreferrer">
                              <MessageCircle className="w-4 h-4" />
                              واتساب ولي الأمر
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
                <CardTitle className="text-lg flex items-center gap-2 text-warning">
                  <Clock className="w-5 h-5" />
                  إذن الدخول والبحث
                </CardTitle>
                <CardDescription>ابحث عن الطالب لمنحه إذن دخول فوراً</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    value={lateSearch}
                    onChange={(e) => setLateSearch(e.target.value)}
                    placeholder="ابحث باسم الطالب..."
                    className="pr-10 py-5"
                  />
                </div>

                {!lateSearch.trim() ? (
                  <EmptySearchState />
                ) : filteredLateStudents.length === 0 ? (
                  <p className="text-center text-muted-foreground py-12 text-sm">
                    لا توجد نتائج لـ «{lateSearch.trim()}»
                  </p>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {filteredLateStudents.map((s) => {
                      const h = halaqat.find((x) => x.id === s.halaqaId);
                      const lateTotal = totalLateCount(s.id, grades);
                      const grantedToday = latePermissions.some((p) => p.studentId === s.id && p.date === todayISO);
                      return (
                        <Card key={s.id} className="border-border bg-secondary/30 shadow-none">
                          <CardContent className="p-4 space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-bold">{s.name}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">{h?.name}</div>
                              </div>
                              <Badge variant="secondary" className="bg-warning/15 text-warning border-warning/30 shrink-0">
                                {lateTotal} تأخر
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              إجمالي مرات التأخر المسجّلة: <span className="font-bold text-warning">{lateTotal}</span>
                            </p>
                            {grantedToday ? (
                              <div className="flex items-center gap-1.5 text-xs text-success font-bold">
                                <CheckCircle2 className="w-4 h-4" />
                                مُمنَح إذن الدخول اليوم
                              </div>
                            ) : (
                              <Button
                                type="button"
                                onClick={() => grantLate(s.id)}
                                className="w-full bg-warning/20 text-warning border border-warning/30 hover:bg-warning/30"
                                variant="outline"
                              >
                                <Check className="w-4 h-4" />
                                منح إذن الدخول الآن
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
          </TabsContent>

          {/* ── Tab 2: Sard results ── */}
          <TabsContent value="sard" className="space-y-6 mt-6">
            <Card className="glass-card border-primary/15 shadow-none">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-success">
                  <CheckCircle2 className="w-5 h-5" />
                  المجتازون
                  <TabBadge count={passedSard.length} />
                </CardTitle>
                <CardDescription>طلاب أنهوا التسميع واجتازوا بنجاح</CardDescription>
              </CardHeader>
              <CardContent>
                {passedSard.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8 text-sm">لا يوجد مجتازون بعد</p>
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
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {h.name} · {weekLabel(q.week)} · {q.finalPercent != null ? `${q.finalPercent}%` : "—"}
                            </div>
                          </div>
                          <Button asChild variant="outline" size="sm"
                            className="bg-success/10 text-success border-success/30 hover:bg-success/20 hover:text-success shrink-0">
                            <a href={`https://wa.me/${s.parentPhone}?text=${msg}`} target="_blank" rel="noreferrer">
                              <MessageCircle className="w-4 h-4" />
                              واتساب
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
                  <AlertTriangle className="w-5 h-5" />
                  الراسبون نهائياً
                  <TabBadge count={finalFailed.length} />
                </CardTitle>
                <CardDescription>طلاب استنفدوا المحاولات — تواصل مع ولي الأمر</CardDescription>
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
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {h.name} · {weekLabel(q.week)} · {q.finalPercent != null ? `${q.finalPercent}%` : "—"}
                            </div>
                          </div>
                          <Button asChild variant="outline" size="sm"
                            className="bg-success/10 text-success border-success/30 hover:bg-success/20 hover:text-success shrink-0">
                            <a href={`https://wa.me/${s.parentPhone}?text=${msg}`} target="_blank" rel="noreferrer">
                              <MessageCircle className="w-4 h-4" />
                              تواصل مع ولي الأمر
                            </a>
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
