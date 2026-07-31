import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadHalaqat, loadStudents, loadGrades } from "@/lib/mock-data";
import { getCalendarDayKey } from "@/lib/operational-date";
import { fetchActiveCalendar, type AcademicCalendar } from "@/lib/academic-context";
import {
  halaqaWeekAverage,
  studentWeekOverallPercentage,
  studentWeekReportPercentages,
  formatOverallPercent,
} from "@/lib/semester-grading";
import { fetchStudentPlanSheet } from "@/lib/plans-service";
import type { StudentPlanSheetData } from "@/lib/plan-types";
import { AppHeader } from "@/components/AppHeader";
import { StudentPortalLogin } from "@/components/student-portal/StudentPortalLogin";
import { StudentPortalPersonalSection } from "@/components/student-portal/StudentPortalPersonalSection";
import {
  clearPortalSession,
  getPortalStudentId,
  resolveStudentPortalAuth,
  type StudentPortalAuthMode,
} from "@/lib/student-portal-auth";
import { loadStudentPortalVisibility } from "@/lib/student-portal-settings";
import { weekLabel } from "@/lib/arabic-numbers";
import { getSessionName } from "@/lib/session-role";
import { Trophy, BookOpen, Loader2, LogOut } from "lucide-react";
import { Toaster } from "sonner";

export const Route = createFileRoute("/student")({
  validateSearch: (s: Record<string, unknown>) => ({
    s: typeof s.s === "string" ? s.s : undefined,
  }),
  component: StudentPage,
});

function StudentPage() {
  const search = Route.useSearch();
  const halaqat = loadHalaqat();
  const students = loadStudents();
  const grades = loadGrades();
  const [authMode, setAuthMode] = useState<StudentPortalAuthMode>(() => resolveStudentPortalAuth());
  const [studentId, setStudentId] = useState<string | null>(() => {
    if (resolveStudentPortalAuth() !== "student") return null;
    return search.s ?? getPortalStudentId();
  });
  const [planData, setPlanData] = useState<StudentPlanSheetData | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [calendar, setCalendar] = useState<AcademicCalendar | null>(null);
  const visibility = loadStudentPortalVisibility();

  useEffect(() => {
    let cancelled = false;
    fetchActiveCalendar(true)
      .then((cal) => { if (!cancelled) setCalendar(cal); })
      .catch(() => { if (!cancelled) setCalendar(null); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const mode = resolveStudentPortalAuth();
    setAuthMode(mode);
    if (mode === "student") {
      const sid = search.s ?? getPortalStudentId();
      if (sid) {
        setStudentId(sid);
        if (search.s && typeof window !== "undefined") {
          sessionStorage.setItem("qs_student", search.s);
        }
      }
    }
  }, [search.s]);

  const handleAuthenticated = useCallback((mode: "student" | "viewer", sid?: string) => {
    setAuthMode(mode);
    if (mode === "student" && sid) setStudentId(sid);
  }, []);

  const handleLogout = () => {
    clearPortalSession();
    setAuthMode("login");
    setStudentId(null);
    setPlanData(null);
  };

  const weekNum = calendar?.currentWeekNumber ?? 1;

  const halaqaStats = useMemo(() => {
    if (!calendar) return halaqat.map((h) => ({ halaqa: h, pct: 0 }));
    return halaqat.map((h) => {
      const hs = students.filter((s) => s.halaqaId === h.id);
      const pct = halaqaWeekAverage(hs, h.isTalqeen, grades, weekNum);
      return { halaqa: h, pct };
    });
  }, [halaqat, students, grades, calendar, weekNum]);

  const top15 = useMemo(() => {
    if (!calendar) return [];
    return students
      .map((s) => {
        const h = halaqat.find((x) => x.id === s.halaqaId);
        if (!h) return null;
        return {
          student: s,
          halaqa: h,
          pct: studentWeekOverallPercentage(s.id, h.isTalqeen, grades, weekNum),
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 15);
  }, [students, halaqat, grades, calendar, weekNum]);

  const personal = useMemo(() => {
    if (authMode !== "student" || !studentId || !calendar) return null;
    const s = students.find((x) => x.id === studentId);
    if (!s) return null;
    const h = halaqat.find((x) => x.id === s.halaqaId);
    if (!h) return null;

    const weekReport = studentWeekReportPercentages(
      s.id, s.levelType, h.isTalqeen, grades, calendar, weekNum,
    );

    const todayKey = getCalendarDayKey();
    let todayStatus = "";
    const weeks = Object.values(grades[s.id] || {});
    for (let i = weeks.length - 1; i >= 0; i--) {
      const att = weeks[i].days[todayKey]?.attendance;
      if (att) { todayStatus = att; break; }
    }

    return { s, h, weekReport, todayStatus };
  }, [authMode, studentId, students, halaqat, grades, calendar, weekNum]);

  useEffect(() => {
    if (!studentId || authMode !== "student") {
      setPlanData(null);
      return;
    }
    let cancelled = false;
    setPlanLoading(true);
    fetchStudentPlanSheet(studentId)
      .then((d) => { if (!cancelled) setPlanData(d); })
      .catch(() => { if (!cancelled) setPlanData(null); })
      .finally(() => { if (!cancelled) setPlanLoading(false); });
    return () => { cancelled = true; };
  }, [studentId, authMode]);

  const viewerName = authMode === "viewer" ? getSessionName("المعلم") : null;
  const showGeneral = authMode === "student" || authMode === "viewer";
  const showPersonal = authMode === "student" && personal;

  return (
    <div className="min-h-screen">
      <Toaster position="top-center" richColors />
      <AppHeader title="نتائج الطلاب" subtitle="الطالب وولي الأمر" />
      <main className="max-w-6xl mx-auto px-4 py-8">

        {authMode === "login" && (
          <StudentPortalLogin onAuthenticated={handleAuthenticated} />
        )}

        {authMode !== "login" && (
          <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
            <p className="text-sm text-muted-foreground">
              {authMode === "viewer"
                ? `اطلاع عام — ${viewerName}`
                : personal
                  ? `مرحباً ${personal.s.name}`
                  : "مرحباً"}
            </p>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm border border-border hover:bg-destructive/10 text-destructive"
            >
              <LogOut className="w-4 h-4" /> خروج
            </button>
          </div>
        )}

        {showGeneral && !calendar && (
          <div className="glass-card rounded-2xl p-6 mb-6 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            جاري تحميل التقويم...
          </div>
        )}

        {showGeneral && calendar && (
          <>
            {visibility.halaqaWeekly && (
              <section className="glass-card rounded-2xl p-6 mb-6">
                <h2 className="text-xl font-bold text-primary mb-1 flex items-center gap-2">
                  <BookOpen className="w-5 h-5" /> متوسط الحلقات — {weekLabel(weekNum)}
                </h2>
                <p className="text-xs text-muted-foreground mb-4">
                  نتائج هذا الأسبوع فقط · {calendar.semester?.name ?? "الفصل الحالي"}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {halaqaStats.map(({ halaqa, pct }) => (
                    <Donut key={halaqa.id} pct={pct} label={halaqa.name} />
                  ))}
                </div>
              </section>
            )}

            {visibility.honorBoard && (
              <section className="glass-card rounded-2xl p-6 mb-6">
                <h2 className="text-xl font-bold text-primary mb-1 flex items-center gap-2">
                  <Trophy className="w-5 h-5" /> الأوائل في {weekLabel(weekNum)}
                </h2>
                <p className="text-xs text-muted-foreground mb-4">أفضل 15 طالباً — نسب هذا الأسبوع</p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {top15.map((row, i) => (
                    <div
                      key={row.student.id}
                      className={`flex items-center justify-between p-3 rounded-lg ${
                        i < 3 ? "bg-primary/10 border border-primary/30" : "bg-secondary/50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                          i < 3 ? "gold-gradient text-primary-foreground" : "bg-secondary text-muted-foreground"
                        }`}>
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
            )}

            {authMode === "viewer" && (
              <p className="text-center text-sm text-muted-foreground py-4 glass-card rounded-xl">
                الدخول بعضوية المعلم — البيانات العامة فقط. لتفاصيل الطالب استخدم رقم الهوية.
              </p>
            )}
          </>
        )}

        {authMode === "student" && !personal && calendar && (
          <div className="glass-card rounded-2xl p-6 mt-6 text-center text-muted-foreground">
            <p>تعذّر تحميل بيانات الطالب. جرّب تسجيل الخروج والدخول مرة أخرى.</p>
          </div>
        )}

        {showPersonal && personal && (
          <StudentPortalPersonalSection
            student={personal.s}
            halaqa={personal.h}
            calendar={calendar!}
            grades={grades}
            weekReport={personal.weekReport}
            todayStatus={personal.todayStatus}
            planData={planData}
            planLoading={planLoading}
            visibility={visibility}
          />
        )}
      </main>
    </div>
  );
}

function Donut({ pct, label }: { pct: number; label: string }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(pct, 100) / 100) * c;
  const display = pct % 1 === 0 ? String(Math.round(pct)) : pct.toFixed(1);
  const gradId = `gold-${label.replace(/\s/g, "")}`;
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 100 100" className="-rotate-90 w-full h-full">
          <circle cx="50" cy="50" r={r} fill="none" stroke="oklch(0.22 0.03 250)" strokeWidth="10" />
          <circle
            cx="50" cy="50" r={r} fill="none"
            stroke={`url(#${gradId})`} strokeWidth="10"
            strokeLinecap="round" strokeDasharray={`${dash} ${c}`}
          />
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
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
