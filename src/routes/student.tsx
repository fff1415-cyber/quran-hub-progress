import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  loadHalaqat, loadStudents, loadGrades,
  weekPercentage,
} from "@/lib/mock-data";
import { loginByNationalId } from "@/lib/secure-data.functions";
import { setToken } from "@/lib/cloud-sync";
import { getCalendarDayKey } from "@/lib/operational-date";
import { fetchActiveCalendar, type AcademicCalendar } from "@/lib/academic-context";
import {
  halaqaSemesterAverage,
  halaqaWeekAverage,
  studentReportPercentages,
  studentWeekOverallPercentage,
  formatOverallPercent,
  fallbackWeeklyAverage,
} from "@/lib/semester-grading";
import { StudentPercentSummary } from "@/components/StudentPercentSummary";
import { fetchStudentPlanSheet } from "@/lib/plans-service";
import type { StudentPlanSheetData } from "@/lib/plan-types";
import { StudentAcademicResultsSection } from "@/components/student-profile/StudentAcademicResults";
import { StudentPlanSheet } from "@/components/plans/StudentPlanSheet";
import { AppHeader } from "@/components/AppHeader";
import { Trophy, BookOpen, IdCard, X, CheckCircle2, Clock, AlertCircle, UserCheck, GraduationCap, Loader2 } from "lucide-react";
import { Toaster, toast } from "sonner";

export const Route = createFileRoute("/student")({ component: StudentPage });

function StudentPage() {
  const halaqat = loadHalaqat();
  const students = loadStudents();
  const grades = loadGrades();
  const [nid, setNid] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [planData, setPlanData] = useState<StudentPlanSheetData | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [calendar, setCalendar] = useState<AcademicCalendar | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchActiveCalendar(true)
      .then((cal) => { if (!cancelled) setCalendar(cal); })
      .catch(() => { if (!cancelled) setCalendar(null); });
    return () => { cancelled = true; };
  }, []);

  const halaqaStats = useMemo(() => {
    if (!calendar) return halaqat.map((h) => ({ halaqa: h, pct: 0 }));
    return halaqat.map((h) => {
      const hs = students.filter((s) => s.halaqaId === h.id);
      const pct = halaqaSemesterAverage(hs, h.isTalqeen, grades, calendar);
      return { halaqa: h, pct };
    });
  }, [halaqat, students, grades, calendar]);

  const top15 = useMemo(() => {
    if (!calendar) return [];
    return students
      .map((s) => {
        const h = halaqat.find((x) => x.id === s.halaqaId);
        if (!h) return null;
        return {
          student: s,
          halaqa: h,
          pct: studentWeekOverallPercentage(s.id, h.isTalqeen, grades, calendar.currentWeekNumber),
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 15);
  }, [students, halaqat, grades, calendar]);

  const submit = async () => {
    if (!nid.trim()) { toast.error("أدخل رقم الهوية"); return; }
    try {
      const res = await loginByNationalId({ data: { nationalId: nid.trim() } });
      setToken(res.token);
      setSelectedId(res.studentId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "رقم الهوية غير مسجل");
    }
  };

  const data = useMemo(() => {
    if (!selectedId) return null;
    const s = students.find((x) => x.id === selectedId);
    if (!s) return null;
    const h = halaqat.find((x) => x.id === s.halaqaId)!;
    const halaqaStudents = students.filter((st) => st.halaqaId === h.id);
    const report = calendar
      ? studentReportPercentages(s.id, s.levelType, h.isTalqeen, grades, calendar)
      : null;
    const overall = report?.overall ?? fallbackWeeklyAverage(s.id, h.isTalqeen, grades);
    const weekOverall = report?.weekOverall ?? weekPctFallback(s.id, h.isTalqeen, grades);
    const halaqaPct = calendar
      ? halaqaSemesterAverage(halaqaStudents, h.isTalqeen, grades, calendar)
      : halaqaStudents.length === 0
        ? 0
        : Math.round(
            halaqaStudents.reduce((acc, st) => acc + fallbackWeeklyAverage(st.id, h.isTalqeen, grades), 0)
            / halaqaStudents.length,
          );
    const halaqaWeekPct = calendar
      ? halaqaWeekAverage(halaqaStudents, h.isTalqeen, grades, calendar.currentWeekNumber)
      : halaqaStudents.length === 0
        ? 0
        : Math.round(
            halaqaStudents.reduce((acc, st) => acc + weekPctFallback(st.id, h.isTalqeen, grades), 0)
            / halaqaStudents.length,
          );
    const todayKey = getCalendarDayKey();
    let todayStatus = "";
    const weeks = Object.values(grades[s.id] || {});
    for (let i = weeks.length - 1; i >= 0; i--) {
      const att = weeks[i].days[todayKey]?.attendance;
      if (att) { todayStatus = att; break; }
    }
    return { s, h, report, overall, weekOverall, halaqaPct, halaqaWeekPct, todayStatus };
  }, [selectedId, students, halaqat, grades, calendar]);

  useEffect(() => {
    if (!selectedId) {
      setPlanData(null);
      return;
    }
    let cancelled = false;
    setPlanLoading(true);
    fetchStudentPlanSheet(selectedId)
      .then((d) => { if (!cancelled) setPlanData(d); })
      .catch(() => { if (!cancelled) setPlanData(null); })
      .finally(() => { if (!cancelled) setPlanLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  return (
    <div className="min-h-screen">
      <Toaster position="top-center" richColors />
      <AppHeader title="نتائج الطلاب" subtitle="الطالب وولي الأمر" />
      <main className="max-w-6xl mx-auto px-4 py-8">

        {!calendar && (
          <div className="glass-card rounded-2xl p-6 mb-6 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            جاري تحميل التقويم...
          </div>
        )}

        {calendar && (
          <>
            <section className="glass-card rounded-2xl p-6 mb-6">
              <h2 className="text-xl font-bold text-primary mb-1 flex items-center gap-2">
                <BookOpen className="w-5 h-5" /> متوسط الحلقات — النسبة الكلية للفصل
              </h2>
              <p className="text-xs text-muted-foreground mb-4">
                {calendar.semester?.name ?? "الفصل الحالي"} · منفصلة عن «تقدم الحفظ» في ورقة الخطة
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {halaqaStats.map(({ halaqa, pct }) => (
                  <Donut key={halaqa.id} pct={pct} label={halaqa.name} />
                ))}
              </div>
            </section>

            <section className="glass-card rounded-2xl p-6 mb-6">
              <h2 className="text-xl font-bold text-primary mb-4 flex items-center gap-2">
                <Trophy className="w-5 h-5" /> لوحة الشرف — أفضل 15 طالب (الأسبوع الحالي)
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {top15.map((row, i) => (
                  <div key={row.student.id} className={`flex items-center justify-between p-3 rounded-lg ${i < 3 ? "bg-primary/10 border border-primary/30" : "bg-secondary/50"}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${i < 3 ? "gold-gradient text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                        {i + 1}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{row.student.name}</div>
                        <div className="text-xs text-muted-foreground">{row.halaqa.name}</div>
                      </div>
                    </div>
                    <div className="font-bold gold-text">{formatOverallPercent(row.pct)}</div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        <section className="glass-card rounded-2xl p-6 gold-glow">
          <h2 className="text-xl font-bold text-primary mb-2 flex items-center gap-2">
            <IdCard className="w-5 h-5" /> الاطلاع على نتائج الطالب
          </h2>
          <p className="text-xs text-muted-foreground mb-4">أدخل رقم هوية الطالب لعرض بياناته الخاصة فقط.</p>

          {!data ? (
            <div className="flex gap-2 max-w-md">
              <input
                value={nid}
                onChange={(e) => setNid(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="رقم الهوية"
                inputMode="numeric"
                maxLength={10}
                className="flex-1 px-4 py-3 rounded-xl bg-input border border-border focus:border-primary focus:outline-none text-center text-lg tracking-widest font-bold text-primary"
              />
              <button onClick={submit} className="px-6 py-3 rounded-xl gold-gradient text-primary-foreground font-bold">
                عرض
              </button>
            </div>
          ) : (
            <div className="p-5 rounded-2xl border border-primary/30 bg-primary/5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="display text-2xl gold-text mb-1">{data.s.name}</h3>
                  <p className="text-sm text-muted-foreground">{data.h.name} · مستوى {data.s.level}</p>
                </div>
                <button onClick={() => { setSelectedId(null); setNid(""); }} className="p-2 rounded-lg hover:bg-secondary">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <TodayBadge status={data.todayStatus} />

              {data.report ? (
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground mb-2">نسب الطالب — من بداية الفصل حتى اليوم</p>
                  <StudentPercentSummary report={data.report} isTalqeen={data.h.isTalqeen} />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <Stat label="النسبة الكلية" value={formatOverallPercent(data.overall)} />
                  <Stat label="نسبة الأسبوع" value={formatOverallPercent(data.weekOverall)} />
                </div>
              )}

              <div className="mt-4 p-4 rounded-xl bg-secondary/30 border border-border">
                <p className="text-xs text-muted-foreground mb-3">متوسط الحلقة ({data.h.name})</p>
                <div className="grid grid-cols-2 gap-4">
                  <Donut pct={data.halaqaPct} label="تراكمي — الفصل" />
                  <Donut pct={data.halaqaWeekPct} label="الأسبوع الحالي" />
                </div>
              </div>

              <section className="mt-6 pt-6 border-t border-border">
                <StudentAcademicResultsSection studentId={data.s.id} />
              </section>

              <section className="mt-6 pt-6 border-t border-border">
                <h4 className="text-lg font-bold text-primary mb-1 flex items-center gap-2">
                  <GraduationCap className="w-5 h-5" /> ورقة الإنجاز التراكمية
                </h4>
                <p className="text-xs text-muted-foreground mb-4">
                  «تقدم الحفظ» أدناه = إنجاز الخطة التعليمية فقط — مختلف عن النسبة الكلية أعلاه
                </p>
                <StudentPlanSheet
                  data={planData ?? { assignment: null, plan: null, segments: [], completions: [] }}
                  studentName={data.s.name}
                  readOnly
                  loading={planLoading}
                />
              </section>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function weekPctFallback(studentId: string, isTalqeen: boolean, grades: ReturnType<typeof loadGrades>): number {
  const weeks = grades[studentId];
  if (!weeks) return 0;
  const nums = Object.keys(weeks).map(Number).sort((a, b) => b - a);
  if (nums.length === 0) return 0;
  return weekPercentage(weeks[nums[0]], isTalqeen);
}

function TodayBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; icon: typeof CheckCircle2; cls: string }> = {
    present: { label: "حاضر اليوم", icon: CheckCircle2, cls: "bg-success/15 text-success border-success/30" },
    late: { label: "متأخر اليوم", icon: Clock, cls: "bg-warning/15 text-warning border-warning/30" },
    excused: { label: "مستأذن اليوم", icon: UserCheck, cls: "bg-primary/15 text-primary border-primary/30" },
    absent: { label: "غائب اليوم", icon: AlertCircle, cls: "bg-destructive/15 text-destructive border-destructive/30" },
  };
  const m = map[status] || { label: "لم تُسجَّل حالة اليوم بعد", icon: Clock, cls: "bg-muted text-muted-foreground border-border" };
  const Icon = m.icon;
  return (
    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border font-bold text-sm ${m.cls}`}>
      <Icon className="w-4 h-4" />
      {m.label}
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="p-3 rounded-lg bg-card border border-border">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={small ? "text-sm font-medium" : "text-xl font-bold gold-text"}>{value}</div>
    </div>
  );
}

function Donut({ pct, label }: { pct: number; label: string }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(pct, 100) / 100) * c;
  const display = pct % 1 === 0 ? String(Math.round(pct)) : pct.toFixed(1);
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 100 100" className="-rotate-90 w-full h-full">
          <circle cx="50" cy="50" r={r} fill="none" stroke="oklch(0.22 0.03 250)" strokeWidth="10" />
          <circle cx="50" cy="50" r={r} fill="none" stroke="url(#gold)" strokeWidth="10"
            strokeLinecap="round" strokeDasharray={`${dash} ${c}`} />
          <defs>
            <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="oklch(0.78 0.13 80)" />
              <stop offset="100%" stopColor="oklch(0.88 0.09 85)" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center font-bold gold-text text-sm">{display}%</div>
      </div>
      <div className="text-xs text-center text-muted-foreground mt-2 leading-tight">{label}</div>
    </div>
  );
}
