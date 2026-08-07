import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { loadHalaqat, loadStudents, loadGrades, type GradesStore } from "@/lib/mock-data";
import { getCalendarDayKey } from "@/lib/operational-date";
import { fetchActiveCalendar, type AcademicCalendar } from "@/lib/academic-context";
import { syncFromCloud } from "@/lib/cloud-sync";
import {
  halaqaWeekAverage,
  semesterDayCompletionReport,
  studentWeekOverallPercentage,
  formatOverallPercent,
} from "@/lib/semester-grading";
import { fetchStudentPlanSheet } from "@/lib/plans-service";
import type { StudentPlanSheetData } from "@/lib/plan-types";
import { AppHeader } from "@/components/AppHeader";
import { StudentPortalPersonalSection } from "@/components/student-portal/StudentPortalPersonalSection";
import { StudentPortalHalaqaSection } from "@/components/student-portal/StudentPortalHalaqaSection";
import {
  clearPortalSession,
  getPortalStudentId,
  resolveStudentPortalAuth,
  portalViewerRoleLabel,
  type StudentPortalAuthMode,
} from "@/lib/student-portal-auth";
import { loadStudentPortalVisibility } from "@/lib/student-portal-settings";
import { aggregateComplexFaceTotals, aggregateComplexFaceTargets, aggregateDailyComplexAttendance } from "@/lib/student-portal-data";
import { weekLabel } from "@/lib/arabic-numbers";
import { getSessionName, getSessionRole } from "@/lib/session-role";
import { Trophy, Loader2, LogOut } from "lucide-react";
import { Toaster } from "sonner";
import { tenantPath } from "@/lib/tenant";

export function studentValidateSearch(s: Record<string, unknown>) {
  return {
    s: typeof s.s === "string" ? s.s : undefined,
  };
}

export const Route = createFileRoute("/student")({
  validateSearch: studentValidateSearch,
  component: StudentPage,
});

export function StudentPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const halaqat = loadHalaqat();
  const students = loadStudents();
  const [grades, setGrades] = useState<GradesStore>(() => loadGrades());
  const [gradesReady, setGradesReady] = useState(false);
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
    if (resolveStudentPortalAuth() === "login") {
      navigate({ to: tenantPath("/") });
    }
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await syncFromCloud();
      } finally {
        if (!cancelled) {
          setGrades(loadGrades());
          setGradesReady(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

  const handleLogout = () => {
    clearPortalSession();
    setAuthMode("login");
    setStudentId(null);
    setPlanData(null);
    navigate({ to: tenantPath("/") });
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
          pct: studentWeekOverallPercentage(s.id, h.isTalqeen, grades, weekNum, s.levelType),
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 15);
  }, [students, halaqat, grades, calendar, weekNum]);

  const complexFaces = useMemo(() => {
    if (!calendar) return null;
    return aggregateComplexFaceTotals(students, grades, calendar);
  }, [students, grades, calendar]);

  const complexFaceTargets = useMemo(() => {
    if (!calendar) return null;
    return aggregateComplexFaceTargets(students, calendar);
  }, [students, calendar]);

  const dailyAttendance = useMemo(() => {
    if (!calendar) return null;
    return aggregateDailyComplexAttendance(students, grades, calendar);
  }, [students, grades, calendar]);

  const personal = useMemo(() => {
    if (authMode !== "student" || !studentId || !calendar) return null;
    const s = students.find((x) => x.id === studentId);
    if (!s) return null;
    const h = halaqat.find((x) => x.id === s.halaqaId);
    if (!h) return null;

    const completion = semesterDayCompletionReport(
      s.id, h.isTalqeen, grades, calendar,
    );

    const todayKey = getCalendarDayKey();
    let todayStatus = "";
    const weeks = Object.values(grades[s.id] || {});
    for (let i = weeks.length - 1; i >= 0; i--) {
      const att = weeks[i].days[todayKey]?.attendance;
      if (att) { todayStatus = att; break; }
    }

    return {
      s,
      h,
      semesterComponents: completion.components,
      semesterOverall: completion.overall,
      expectedProgress: completion.expectedProgress,
      elapsedDays: completion.elapsedDays,
      totalDays: completion.totalDays,
      completedDays: completion.completedDays,
      todayStatus,
    };
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

  const viewerName = useMemo(() => {
    if (authMode !== "viewer") return null;
    const name = getSessionName("");
    const role = portalViewerRoleLabel(getSessionRole());
    return name ? `${role} — ${name}` : role;
  }, [authMode]);

  if (authMode === "login") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const showGeneral = authMode === "student" || authMode === "viewer";
  const showPersonal = authMode === "student" && personal;

  return (
    <div className="min-h-screen">
      <Toaster position="top-center" richColors />
      <AppHeader title="نتائج الطلاب" subtitle="الطالب وولي الأمر" />
      <main className="max-w-6xl mx-auto px-4 py-8">

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

        {showGeneral && (!calendar || !gradesReady) && (
          <div className="glass-card rounded-2xl p-6 mb-6 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            جاري تحميل التقويم...
          </div>
        )}

        {showGeneral && calendar && gradesReady && (
          <>
            {(visibility.halaqaWeekly || visibility.dailyComplexAttendance || visibility.complexFaceCounts) && (
              <StudentPortalHalaqaSection
                halaqaStats={halaqaStats}
                calendar={calendar}
                weekNum={weekNum}
                dailyAttendance={dailyAttendance}
                complexFaces={complexFaces}
                complexFaceTargets={complexFaceTargets}
                showWeekly={visibility.halaqaWeekly}
                showDailyAttendance={visibility.dailyComplexAttendance}
                showComplexFaces={visibility.complexFaceCounts}
              />
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
                الدخول برقم العضوية — النتائج العامة فقط. لتفاصيل الطالب أدخل رقم الهوية من الصفحة الرئيسية.
              </p>
            )}
          </>
        )}

        {authMode === "student" && !personal && calendar && gradesReady && (
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
            semesterComponents={personal.semesterComponents}
            semesterOverall={personal.semesterOverall}
            expectedProgress={personal.expectedProgress}
            elapsedDays={personal.elapsedDays}
            totalDays={personal.totalDays}
            completedDays={personal.completedDays}
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
