import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import React, { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { z } from "zod";
import {
  loadHalaqat, loadStudents, saveStudents, saveGrades, emptyWeek, emptyDayEntry, ensureWeekDays, dayEntryFor, DAYS,
  weekPercentage, loadNotifications, dismissNotification, pushNotification,
  ensureGradesSemester,
  sumWeekCompensationFaces, compensationRemainingForDay,
  type WeekRecord, type DayEntry, type Student,
} from "@/lib/mock-data";
import {
  fetchActiveCalendar,
  getSelectableWeeks,
  formatWeekOptionLabel,
  workingDayKeysFromSemester,
  getWeekDaySlot,
  isWeekDayClosed,
  type AcademicCalendar,
} from "@/lib/academic-context";
import { cn } from "@/lib/utils";
import { getSessionName, getSessionRole } from "@/lib/session-role";
import { halaqaSearchParamSchema } from "@/lib/teacher-halaqa-access";
import { useTeacherHalaqaAccess } from "@/hooks/use-teacher-halaqa-access";
import { useLiveGrades } from "@/hooks/use-live-grades";
import { dispatchPushEvent } from "@/lib/push-notifications";
import { tenantPath } from "@/lib/tenant";
import { AppHeader } from "@/components/AppHeader";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Bell, BookOpen, Check, CheckCircle2, ClipboardCheck, ClipboardList, Loader2, Monitor, Send,
  Smartphone, Sparkles, Users, X,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { applyPlanInput, fetchStudentPlanSheet, syncCompensationToPlan } from "@/lib/plans-service";
import { checkAndHandlePlanCompletion } from "@/lib/plan-completion";
import { processAbsenceThresholdAlerts } from "@/lib/semester-absence";
import { loadComplexFeatures } from "@/lib/complex-features";
import type { StudentPlanSheetData, TapValue } from "@/lib/plan-types";
import { StudentPlanSheet } from "@/components/plans/StudentPlanSheet";
import { PlanAwareTaskCell } from "@/components/plans/PlanAwareTaskCell";
import { AttSelect, CompensationSelect } from "@/components/plans/TeacherGradeInputs";
import { hifzCheckedValue } from "@/lib/mock-data";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  halaqaSemesterAverage,
  formatOverallPercent,
} from "@/lib/semester-grading";
import { TeacherGradesExport } from "@/components/TeacherGradesExport";
import { StaffAttendanceCheckInButton } from "@/components/StaffAttendanceCheckInButton";
import { SemesterBreakdownPopover } from "@/components/teacher/SemesterBreakdownPopover";
import { TeacherMobileDayBoard } from "@/components/teacher/TeacherMobileDayBoard";
import { ensureWeeklyTestsSemester } from "@/lib/weekly-tests";
import { ensureTarbawiSemester } from "@/lib/tarbawi-program";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  desktopCompensationDayKey,
  loadTeacherGradeLayoutMode,
  resolveTeacherGradeLayout,
  saveTeacherGradeLayoutMode,
  type TeacherGradeLayoutMode,
} from "@/lib/teacher-grade-layout";
import {
  ScientificGradesToolbar,
} from "@/components/teacher/ScientificGradesToolbar";
import {
  loadScientificConfig,
  syncScientificScoresFromDayPatch,
  type ScientificGradesConfig,
} from "@/lib/scientific-grades";

const TeacherWeeklyTestsPanel = lazy(() =>
  import("@/components/TeacherWeeklyTestsPanel").then((m) => ({ default: m.TeacherWeeklyTestsPanel })),
);
const TeacherHalaqaProgramsPanel = lazy(() =>
  import("@/components/TeacherHalaqaProgramsPanel").then((m) => ({ default: m.TeacherHalaqaProgramsPanel })),
);
const TeacherTarbawiPanel = lazy(() =>
  import("@/components/tarbawi/TeacherTarbawiPanel").then((m) => ({ default: m.TeacherTarbawiPanel })),
);

function TabPanelFallback() {
  return (
    <div className="glass-card rounded-2xl p-12 flex justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

export const teacherSearchSchema = z.object({
  h: halaqaSearchParamSchema,
  w: z.coerce.number().optional(),
  view: z.enum(["grades", "tests", "programs", "tarbawi"]).optional(),
});

export const Route = createFileRoute("/teacher")({
  validateSearch: teacherSearchSchema,
  component: TeacherPage,
});

export function TeacherPage() {
  const { h, w, view: viewParam } = useSearch({ strict: false }) as z.infer<typeof teacherSearchSchema>;
  const view = viewParam ?? "grades";
  const navigate = useNavigate();
  const access = useTeacherHalaqaAccess(h);
  const [role, setRole] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [calendar, setCalendar] = useState<AcademicCalendar | null>(null);
  const [loadingCal, setLoadingCal] = useState(true);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  useEffect(() => {
    setRole(getSessionRole());
    setName(getSessionName());
  }, []);

  useEffect(() => {
    if (access.phase !== "redirect") return;
    navigate({
      to: tenantPath("/teacher"),
      search: { h: access.halaqaId, w, view },
      replace: true,
    });
  }, [access, w, view, navigate]);

  useEffect(() => {
    let cancelled = false;
    setLoadingCal(true);
    fetchActiveCalendar(false)
      .then((cal) => {
        if (cancelled) return;
        const reset = ensureGradesSemester(cal.semester?.id ?? null);
        const testsReset = ensureWeeklyTestsSemester(cal.semester?.id ?? null);
        const tarbawiReset = ensureTarbawiSemester(cal.semester?.id ?? null);
        if (reset) toast.info("بدء فصل دراسي جديد — تم تصفير سجل التحضير");
        if (testsReset) toast.info("بدء فصل دراسي جديد — تم تصفير الاختبارات الأسبوعية");
        if (tarbawiReset) toast.info("بدء فصل دراسي جديد — تم تصفير البرنامج التربوي");
        setCalendar(cal);
        const selectable = cal.weeks.filter((wk) => wk.week_number <= cal.currentWeekNumber);
        const fromUrl = w && selectable.some((wk) => wk.week_number === w) ? w : null;
        const nextWeek = fromUrl ?? cal.currentWeekNumber;
        setSelectedWeek(nextWeek);
        if (h && w && w !== nextWeek) {
          navigate({
            to: tenantPath("/teacher"),
            search: { h, w: nextWeek, view },
            replace: true,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCal(false);
      });
    return () => { cancelled = true; };
  }, [w, h, view, navigate]);

  const isAssistant = role === "assistant";
  const isManager = role === "manager";
  const elevated = isManager || role === "secretary" || role === "supervisor";
  const roleLabel = isAssistant ? "مساعد" : isManager ? "مدير" : elevated ? "مشرف" : "معلم";

  if (access.phase === "loading" || access.phase === "redirect") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (access.phase === "missing") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-card p-8 rounded-2xl text-center max-w-md w-full">
          <p className="font-bold text-lg">الحلقة غير موجودة</p>
          {access.error && (
            <p className="text-sm text-muted-foreground mt-2">{access.error}</p>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            إن كنت معلماً، أعد تسجيل الدخول أو حدّث الصفحة بعد اكتمال تحميل بيانات المجمع.
          </p>
          <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-center">
            <button
              type="button"
              onClick={() => access.retry()}
              className="px-4 py-2 rounded-lg border border-primary/30 text-primary font-bold"
            >
              إعادة المحاولة
            </button>
            <button
              type="button"
              onClick={() => navigate({ to: tenantPath("/") })}
              className="px-4 py-2 rounded-lg gold-gradient text-primary-foreground font-bold"
            >
              العودة
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { halaqa } = access;

  const handleWeekChange = (weekNum: number) => {
    setSelectedWeek(weekNum);
    if (halaqa) {
      navigate({ to: tenantPath("/teacher"), search: { h: halaqa.id, w: weekNum, view } });
    }
  };

  const setView = (next: "grades" | "tests" | "programs" | "tarbawi") => {
    if (halaqa) {
      navigate({ to: tenantPath("/teacher"), search: { h: halaqa.id, w: selectedWeek ?? undefined, view: next } });
    }
  };

  const canManagePrograms = role === "teacher";
  const programsReadOnly = role === "manager";

  return (
    <div className="min-h-screen">
      <Toaster position="top-center" richColors />
      <AppHeader title={halaqa.name} subtitle={roleLabel} />
      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="glass-card rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="min-w-0">
              <div className="text-xl sm:text-2xl display gold-text truncate">مرحباً {name || ""}</div>
              <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-bold">
                  {isManager ? "صلاحيات معلم كاملة" : isAssistant ? "مساعد" : elevated ? "صلاحية كاملة" : "معلم"}
                </span>
                <span className="truncate">{halaqa.name}</span>
                {calendar?.semester && (
                  <span className="text-xs text-muted-foreground">· {calendar.semester.name}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap shrink-0 w-full sm:w-auto">
              {name && role && (
                <StaffAttendanceCheckInButton
                  role={role}
                  name={name}
                  halaqaId={halaqa.id}
                />
              )}
              {!loadingCal && calendar && (
                <TeacherGradesExport
                  halaqaId={halaqa.id}
                  halaqaName={halaqa.name}
                  isTalqeen={halaqa.isTalqeen}
                  calendar={calendar}
                  viewerRole={isAssistant ? "assistant" : "teacher"}
                />
              )}
              {elevated && <HalaqaSwitcher current={halaqa.id} />}
            </div>
          </div>
        </div>

        <HalaqaNotifications halaqaId={halaqa.id} />

        {loadingCal || !calendar || selectedWeek === null ? (
          <div className="glass-card rounded-2xl p-12 flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm">جاري تحميل التقويم الدراسي...</p>
          </div>
        ) : (
          <Tabs value={view} onValueChange={(v) => setView(v as "grades" | "tests" | "programs" | "tarbawi")} dir="rtl">
            <TabsList className="w-full h-auto flex gap-1 p-1 mb-4 bg-secondary/50 border border-border rounded-xl overflow-x-auto scrollbar-none">
              <TabsTrigger value="grades" className="gap-1.5 shrink-0 flex-1 sm:flex-none data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm px-2.5 sm:px-3">
                <ClipboardList className="w-4 h-4" />
                <span className="truncate">التحضير</span>
              </TabsTrigger>
              <TabsTrigger value="programs" className="gap-1.5 shrink-0 flex-1 sm:flex-none data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm px-2.5 sm:px-3">
                <BookOpen className="w-4 h-4" />
                <span className="truncate">البرامج</span>
              </TabsTrigger>
              <TabsTrigger value="tarbawi" className="gap-1.5 shrink-0 flex-1 sm:flex-none data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm px-2.5 sm:px-3">
                <Sparkles className="w-4 h-4" />
                <span className="truncate">التربوي</span>
              </TabsTrigger>
              <TabsTrigger value="tests" className="gap-1.5 shrink-0 flex-1 sm:flex-none data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm px-2.5 sm:px-3">
                <ClipboardCheck className="w-4 h-4" />
                <span className="truncate">الاختبارات</span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="grades" className="mt-0 space-y-4">
              <WeekTable
                halaqaId={halaqa.id}
                weekNum={selectedWeek}
                calendar={calendar}
                onWeekChange={handleWeekChange}
                isTalqeen={halaqa.isTalqeen}
                viewerRole={isAssistant ? "assistant" : "teacher"}
                canAssign={!isAssistant}
              />
            </TabsContent>
            <TabsContent value="programs" className="mt-0">
              {view === "programs" && (
                <Suspense fallback={<TabPanelFallback />}>
                  <TeacherHalaqaProgramsPanel
                    halaqaId={halaqa.id}
                    halaqaName={halaqa.name}
                    calendar={calendar}
                    weekNum={selectedWeek}
                    onWeekChange={handleWeekChange}
                    viewerRole={isAssistant ? "assistant" : isManager ? "manager" : "teacher"}
                    canManagePrograms={canManagePrograms}
                    readOnly={programsReadOnly}
                  />
                </Suspense>
              )}
            </TabsContent>
            <TabsContent value="tarbawi" className="mt-0">
              {view === "tarbawi" && (
                <Suspense fallback={<TabPanelFallback />}>
                  <TeacherTarbawiPanel
                    key={`tarbawi-${halaqa.id}-${calendar.semester?.id ?? "default"}`}
                    halaqaId={halaqa.id}
                    halaqaName={halaqa.name}
                    calendar={calendar}
                    weekNum={selectedWeek}
                    onWeekChange={handleWeekChange}
                    readOnly={isAssistant || programsReadOnly}
                  />
                </Suspense>
              )}
            </TabsContent>
            <TabsContent value="tests" className="mt-0">
              {view === "tests" && (
                <Suspense fallback={<TabPanelFallback />}>
                  <TeacherWeeklyTestsPanel
                    halaqaId={halaqa.id}
                    halaqaName={halaqa.name}
                    isTalqeen={halaqa.isTalqeen}
                    calendar={calendar}
                    weekNum={selectedWeek}
                    onWeekChange={handleWeekChange}
                viewerRole={isAssistant ? "assistant" : "teacher"}
                  />
                </Suspense>
              )}
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}

function HalaqaSwitcher({ current }: { current: number }) {
  const navigate = useNavigate();
  const halaqat = loadHalaqat();
  return (
    <select
      value={current}
      onChange={(e) => navigate({ to: tenantPath("/teacher"), search: { h: Number(e.target.value) } })}
      className="px-3 py-2 rounded-lg bg-input border border-border text-sm"
    >
      {halaqat.map((hl) => <option key={hl.id} value={hl.id}>{hl.name}</option>)}
    </select>
  );
}

function AssignmentDialog({ halaqaId, onClose }: { halaqaId: number; onClose: () => void }) {
  const [students, setStudents] = useState<Student[]>(() => loadStudents().filter((s) => s.halaqaId === halaqaId));
  const setAssign = (id: string, to: "teacher" | "assistant" | undefined) => {
    const all = loadStudents();
    const next = all.map((s) => s.id === id ? { ...s, assignedTo: to } : s);
    saveStudents(next);
    void import("@/lib/cloud-sync").then((m) => m.patchStudent(id, { assignedTo: to }));
    setStudents(next.filter((s) => s.halaqaId === halaqaId));
  };
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass-card rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h3 className="text-lg font-bold text-primary">تقسيم الطلاب</h3>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          <p className="text-xs text-muted-foreground mb-2">الأصل: كل الطلاب يظهرون عند المعلم وعند المساعد. عيّن طالباً لجهة معينة لإخفائه عن الجهة الأخرى.</p>
          {students.map((s) => (
            <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
              <span className="font-medium">{s.name}</span>
              <div className="flex gap-2">
                <button onClick={() => setAssign(s.id, undefined)}
                  className={`px-3 py-1 rounded text-xs font-bold ${!s.assignedTo ? "gold-gradient text-primary-foreground" : "border border-border text-muted-foreground"}`}>
                  كلاهما
                </button>
                <button onClick={() => setAssign(s.id, "teacher")}
                  className={`px-3 py-1 rounded text-xs font-bold ${s.assignedTo === "teacher" ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>
                  معي فقط
                </button>
                <button onClick={() => setAssign(s.id, "assistant")}
                  className={`px-3 py-1 rounded text-xs font-bold ${s.assignedTo === "assistant" ? "bg-primary/20 text-primary border border-primary" : "border border-border text-muted-foreground"}`}>
                  المساعد فقط
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface WeekTableProps {
  halaqaId: number;
  weekNum: number;
  calendar: AcademicCalendar;
  onWeekChange: (n: number) => void;
  isTalqeen: boolean;
  viewerRole: "teacher" | "assistant";
  canAssign: boolean;
}

const GRADE_COL = {
  student: 156,
  attendance: 72,
  hifz: 48,
  passFail: 56,
  wajib: 44,
  weekPct: 72,
  semesterPct: 80,
  compensation: 56,
  scientific: 48,
} as const;

const GRADE_CELL_W = {
  att: "w-[72px] max-w-[72px]",
  hifz: "w-12 max-w-12",
  pf: "w-14 max-w-14",
  wajib: "w-11 max-w-11",
  weekPct: "w-[72px] max-w-[72px]",
  semesterPct: "w-20 max-w-20",
  compensation: "w-14 max-w-14",
  scientific: "w-12 max-w-12",
  student: "w-[156px] max-w-[156px]",
} as const;

/** Sticky header — row 1 sits at top; row 2 sits below row 1 (~3rem). */
const GRADE_HEAD_ROW1_TOP = "top-0";
const GRADE_HEAD_ROW2_TOP = "top-14";

const STICKY_HEAD = "sticky z-20 bg-secondary shadow-[0_1px_0_var(--border)]";
const STICKY_HEAD_CORNER = "sticky z-40 bg-secondary shadow-[0_1px_0_var(--border)]";
const STICKY_NAME =
  "sticky right-0 z-10 bg-card shadow-[-8px_0_12px_-6px_rgba(0,0,0,0.12)] group-hover:bg-accent/30 transition-colors";

function dayColumnCount(isTalqeen: boolean, compensationPerDay: boolean): number {
  if (isTalqeen) return 2;
  return compensationPerDay ? 5 : 4;
}

function gradeTableWidthPx(
  dayCount: number,
  isTalqeen: boolean,
  compensationPerDay: boolean,
): number {
  const perDay = isTalqeen
    ? GRADE_COL.attendance + GRADE_COL.wajib
    : GRADE_COL.attendance + GRADE_COL.hifz + GRADE_COL.passFail * 2
      + (compensationPerDay ? GRADE_COL.compensation : 0);
  const consolidatedComp = !isTalqeen && !compensationPerDay ? GRADE_COL.compensation : 0;
  return (
    GRADE_COL.student
    + dayCount * perDay
    + consolidatedComp
    + GRADE_COL.weekPct
    + GRADE_COL.semesterPct
  );
}

function buildDayColWidths(isTalqeen: boolean, compensationPerDay: boolean): number[] {
  if (isTalqeen) {
    return [GRADE_COL.attendance, GRADE_COL.wajib];
  }
  const out: number[] = [GRADE_COL.attendance, GRADE_COL.hifz, GRADE_COL.passFail, GRADE_COL.passFail];
  if (compensationPerDay) out.push(GRADE_COL.compensation);
  return out;
}

function GradeTableColGroup({
  dayCount,
  isTalqeen,
  compensationPerDay,
}: {
  dayCount: number;
  isTalqeen: boolean;
  compensationPerDay: boolean;
}) {
  const dayWidths = buildDayColWidths(isTalqeen, compensationPerDay);

  return (
    <colgroup>
      <col style={{ width: GRADE_COL.student }} />
      {Array.from({ length: dayCount }, (_, dayIdx) =>
        dayWidths.map((w, colIdx) => (
          <col key={`d${dayIdx}-c${colIdx}`} style={{ width: w }} />
        )),
      )}
      {!isTalqeen && !compensationPerDay && <col style={{ width: GRADE_COL.compensation }} />}
      <col style={{ width: GRADE_COL.weekPct }} />
      <col style={{ width: GRADE_COL.semesterPct }} />
    </colgroup>
  );
}

function StudentNameCell({
  index,
  name,
  children,
}: {
  index: number;
  name: string;
  children?: React.ReactNode;
}) {
  return (
    <td className={cn("p-2 font-medium", STICKY_NAME, GRADE_CELL_W.student)}>
      <div className="flex items-stretch gap-0 min-h-[2rem]">
        <span
          className="flex items-center justify-center w-7 shrink-0 text-xs font-bold text-muted-foreground tabular-nums"
          aria-hidden
        >
          {index + 1}
        </span>
        <div
          className="w-px shrink-0 self-stretch bg-gradient-to-b from-border/20 via-border to-border/20 my-0.5 mx-2"
          aria-hidden
        />
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <span className="leading-snug">{name}</span>
          {children}
        </div>
      </div>
    </td>
  );
}

function WeekTable({ halaqaId, weekNum, calendar, onWeekChange, isTalqeen, viewerRole, canAssign }: WeekTableProps) {
  const tableRef = useRef<HTMLDivElement>(null);
  const allStudents = useMemo(() => loadStudents().filter((s) => s.halaqaId === halaqaId), [halaqaId]);
  /** Teacher and assistant both see the full halaqa roster so attendance stays live for everyone. */
  const students = allStudents;
  const studentIdsKey = useMemo(
    () => students.map((s) => s.id).sort().join(","),
    [students],
  );
  const [grades, setGrades] = useLiveGrades();
  const [sciConfig, setSciConfig] = useState<ScientificGradesConfig>(() => loadScientificConfig(halaqaId));
  const deviceMobile = useIsMobile();
  const [layoutMode, setLayoutMode] = useState<TeacherGradeLayoutMode>(() => loadTeacherGradeLayoutMode());
  const { useMobileBoard, compensationPerDay } = useMemo(
    () => resolveTeacherGradeLayout(layoutMode, deviceMobile),
    [layoutMode, deviceMobile],
  );
  const dayColSpan = dayColumnCount(isTalqeen, compensationPerDay);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferStudentId, setTransferStudentId] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [showAssign, setShowAssign] = useState(false);
  const [planStudentIds, setPlanStudentIds] = useState<Set<string>>(new Set());
  const [frozenPlanStudentIds, setFrozenPlanStudentIds] = useState<Set<string>>(new Set());
  const [planLinkedIds, setPlanLinkedIds] = useState<Set<string>>(new Set());
  const [planSheetStudent, setPlanSheetStudent] = useState<Student | null>(null);
  const [planSheetData, setPlanSheetData] = useState<StudentPlanSheetData | null>(null);
  const [planSheetError, setPlanSheetError] = useState<string | null>(null);
  const [planSheetLoading, setPlanSheetLoading] = useState(false);
  const senderName = getSessionName("المعلم");
  const showTransferButton = loadComplexFeatures().showTeacherTransferButton;

  const halaqaSemesterPct = useMemo(
    () => halaqaSemesterAverage(students, isTalqeen, grades, calendar),
    [students, isTalqeen, grades, calendar],
  );

  const selectableWeeks = useMemo(() => getSelectableWeeks(calendar), [calendar]);
  const workingKeys = useMemo(
    () => workingDayKeysFromSemester(calendar.semester?.working_days),
    [calendar.semester?.working_days],
  );
  const visibleDays = useMemo(
    () => DAYS.filter((d) => workingKeys.has(d.key)),
    [workingKeys],
  );
  const workingKeysList = useMemo(() => [...workingKeys], [workingKeys]);
  const closedDayKeys = useMemo(() => {
    const closed = new Set<string>();
    for (const d of visibleDays) {
      if (isWeekDayClosed(calendar, weekNum, d.key)) closed.add(d.key);
    }
    return closed;
  }, [calendar, weekNum, visibleDays]);
  const isCurrentWeek = weekNum === calendar.currentWeekNumber;
  const todayKey = calendar.currentDayKey;
  const [activeDayKey, setActiveDayKey] = useState(todayKey);
  const compensationDayKey = useMemo(
    () => desktopCompensationDayKey(visibleDays.map((d) => d.key)),
    [visibleDays],
  );

  const setGradeLayoutMode = (mode: TeacherGradeLayoutMode) => {
    setLayoutMode(mode);
    saveTeacherGradeLayoutMode(mode);
  };

  const highlightDay = (dayKey: string) => isCurrentWeek && dayKey === todayKey;

  useEffect(() => {
    if (visibleDays.length === 0) return;
    const preferred =
      isCurrentWeek && visibleDays.some((d) => d.key === todayKey)
        ? todayKey
        : visibleDays[0]!.key;
    setActiveDayKey(preferred);
  }, [weekNum, visibleDays, isCurrentWeek, todayKey]);

  useEffect(() => {
    if (!isCurrentWeek || !tableRef.current || useMobileBoard) return;
    const col = tableRef.current.querySelector(`[data-day-col="${todayKey}"]`);
    col?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [isCurrentWeek, todayKey, weekNum, useMobileBoard]);

  const submitTransfer = () => {
    const student = students.find((s) => s.id === transferStudentId);
    if (!student) { toast.error("اختر الطالب"); return; }
    const reason = transferReason.trim();
    if (!reason) { toast.error("اكتب سبب التحويل"); return; }
    pushNotification({
      message: `تحويل من ${senderName}: الطالب ${student.name} — ${reason}`,
      type: "transfer",
      actionTab: "transfers",
      transferData: {
        studentId: student.id,
        halaqaId: student.halaqaId,
        week: weekNum,
        reason,
        fromName: senderName,
      },
      transferStatus: "pending",
    });
    void dispatchPushEvent({
      event: "teacher_transfer",
      title: "طلب تحويل طالب",
      body: `${senderName}: ${student.name} — ${reason}`,
      url: tenantPath("/manager"),
      targets: { roles: ["manager"] },
    });
    toast.success("تم إرسال الطالب للإدارة");
    setTransferOpen(false);
    setTransferStudentId("");
    setTransferReason("");
  };

  const handleTransferOpenChange = (open: boolean) => {
    setTransferOpen(open);
    if (open) {
      setTransferStudentId(students[0]?.id ?? "");
      setTransferReason("");
    }
  };

  useEffect(() => {
    let changed = false;
    const g = { ...grades };
    students.forEach((s) => {
      if (!g[s.id]) g[s.id] = {};
      if (!g[s.id][weekNum]) {
        g[s.id][weekNum] = emptyWeek(workingKeysList);
        changed = true;
      } else {
        const normalized = ensureWeekDays(g[s.id][weekNum], workingKeysList);
        if (normalized !== g[s.id][weekNum]) {
          g[s.id][weekNum] = normalized;
          changed = true;
        }
      }
    });
    if (changed) { setGrades(g); saveGrades(g); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekNum, halaqaId, workingKeysList]);

  useEffect(() => {
    if (!studentIdsKey) {
      setPlanStudentIds(new Set());
      setFrozenPlanStudentIds(new Set());
      setPlanLinkedIds(new Set());
      return;
    }
    let cancelled = false;
    void (async () => {
      const active = new Set<string>();
      const frozen = new Set<string>();
      const linked = new Set<string>();
      const batchSize = 5;
      for (let i = 0; i < students.length; i += batchSize) {
        if (cancelled) return;
        const chunk = students.slice(i, i + batchSize);
        await Promise.all(
          chunk.map(async (s) => {
            try {
              const sheet = await fetchStudentPlanSheet(s.id);
              if (!sheet.assignment) return;
              if (sheet.assignment.status === "active") {
                active.add(s.id);
                linked.add(s.id);
              } else if (sheet.assignment.status === "frozen") {
                frozen.add(s.id);
                linked.add(s.id);
              }
            } catch {
              /* ignore — plan status is optional UI hint */
            }
          }),
        );
      }
      if (!cancelled) {
        setPlanStudentIds(active);
        setFrozenPlanStudentIds(frozen);
        setPlanLinkedIds(linked);
      }
    })();
    return () => { cancelled = true; };
    // studentIdsKey is stable; students is memoized — avoids infinite refetch loop
  }, [studentIdsKey, students]);

  const openPlanSheet = async (s: Student) => {
    setPlanSheetStudent(s);
    setPlanSheetData(null);
    setPlanSheetError(null);
    setPlanSheetLoading(true);
    try {
      setPlanSheetData(await fetchStudentPlanSheet(s.id));
    } catch (e) {
      const message = e instanceof Error ? e.message : "فشل تحميل الخطة";
      setPlanSheetError(message);
      toast.error(message);
    } finally {
      setPlanSheetLoading(false);
    }
  };

  const handlePlanHifz = async (s: Student, dayKey: string) => {
    const gradeVal = hifzCheckedValue(s.levelType);
    const tap: TapValue = s.levelType === "gold" ? "one" : "half";
    updateDay(s.id, dayKey, { hifz: gradeVal });
    try {
      const segs = await applyPlanInput(s.id, "hifz", tap, senderName);
      toast.success(`تم تسجيل ${segs.length} مقطع — حفظ`);
      if (planSheetStudent?.id === s.id) {
        setPlanSheetData(await fetchStudentPlanSheet(s.id));
      }
      if (await checkAndHandlePlanCompletion(s, weekNum)) {
        toast.info(`${s.name} أنهى الخطة — بانتظار تحويل المشرف للسرد`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل تحديث الخطة");
    }
  };

  const handlePlanPassFail = async (
    s: Student,
    dayKey: string,
    task: "rabt" | "muraja",
    value: "pass" | "fail" | "",
  ) => {
    updateDay(s.id, dayKey, { [task]: value });
    if (value !== "pass") return;
    const tap: TapValue = s.levelType === "gold" ? "one" : "half";
    try {
      const segs = await applyPlanInput(s.id, task, tap, senderName);
      toast.success(`تم تسجيل ${segs.length} مقطع — ${task === "rabt" ? "ربط" : "مراجعة"}`);
      if (planSheetStudent?.id === s.id) {
        setPlanSheetData(await fetchStudentPlanSheet(s.id));
      }
      if (await checkAndHandlePlanCompletion(s, weekNum)) {
        toast.info(`${s.name} أنهى الخطة — بانتظار تحويل المشرف للسرد`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل تحديث الخطة");
    }
  };

  const update = (studentId: string, fn: (w: WeekRecord) => WeekRecord, sync?: boolean | "immediate") => {
    const g = { ...grades };
    if (!g[studentId]) g[studentId] = {};
    if (!g[studentId][weekNum]) g[studentId][weekNum] = emptyWeek(workingKeysList);
    g[studentId][weekNum] = fn(g[studentId][weekNum]);
    setGrades(g);
    saveGrades(g, sync === undefined ? undefined : { sync });
  };

  const handleDayCompensationChange = async (s: Student, dayKey: string, faces: number) => {
    if (closedDayKeys.has(dayKey)) return;
    const w = ensureWeekDays(grades[s.id]?.[weekNum] ?? emptyWeek(workingKeysList), workingKeysList);
    const max = compensationRemainingForDay(w, dayKey, workingKeysList);
    if (faces > max + 0.001) {
      toast.error(`المتبقي للتعويض هذا الأسبوع: ${max}`);
      return;
    }
    const days = { ...w.days };
    days[dayKey] = { ...dayEntryFor(w, dayKey, workingKeysList), compensationFaces: faces, touchedAt: Date.now() };
    let nextWeek: WeekRecord = { ...w, days };
    const total = sumWeekCompensationFaces(nextWeek, workingKeysList);
    nextWeek = { ...nextWeek, compensationFaces: total };
    const tracked = w.compensationPlanSegments ?? [];
    try {
      let newTracked = tracked;
      if (planStudentIds.has(s.id)) {
        newTracked = await syncCompensationToPlan(s, total, tracked, senderName);
      }
      update(s.id, () => ({ ...nextWeek, compensationPlanSegments: newTracked }));
      if (planSheetStudent?.id === s.id) {
        setPlanSheetData(await fetchStudentPlanSheet(s.id));
      }
      if (planStudentIds.has(s.id) && (await checkAndHandlePlanCompletion(s, weekNum))) {
        toast.info(`${s.name} أنهى الخطة — بانتظار تحويل المشرف للسرد`);
      }
      if (faces > 0) {
        toast.success(`تعويض ${faces} — متبقي ${compensationRemainingForDay(nextWeek, dayKey, workingKeysList)}`);
      } else if (tracked.length > 0) {
        toast.success("تم إلغاء التعويض وتراجع المقاطع");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل تحديث التعويض");
    }
  };

  const updateDay = (studentId: string, dayKey: string, patch: Partial<DayEntry>) => {
    if (closedDayKeys.has(dayKey)) return;
    const prevWeek = ensureWeekDays(
      grades[studentId]?.[weekNum] ?? emptyWeek(workingKeysList),
      workingKeysList,
    );
    const mergedEntry = {
      ...dayEntryFor(prevWeek, dayKey, workingKeysList),
      ...patch,
      touchedAt: Date.now(),
    };

    update(studentId, (w) => {
      const base = ensureWeekDays(w, workingKeysList);
      return {
        ...base,
        days: {
          ...base.days,
          [dayKey]: mergedEntry,
        },
      };
    }, patch.attendance !== undefined || patch.hifz !== undefined || patch.rabt !== undefined || patch.muraja !== undefined ? "immediate" : undefined);

    syncScientificScoresFromDayPatch(
      halaqaId,
      studentId,
      weekNum,
      dayKey,
      sciConfig,
      patch,
      mergedEntry,
    );

    if (patch.attendance === "absent") {
      void fetchActiveCalendar(false).then(processAbsenceThresholdAlerts).catch(() => {});
      const student = students.find((s) => s.id === studentId);
      if (student) {
        void dispatchPushEvent({
          event: "student_absent",
          title: "غياب الطالب",
          body: `غاب ${student.name} عن الحلقة اليوم`,
          url: tenantPath("/student") + `?s=${encodeURIComponent(studentId)}`,
          targets: { studentIds: [studentId] },
        });
      }
    }
    if (patch.attendance === "late") {
      const student = students.find((s) => s.id === studentId);
      if (student) {
        void dispatchPushEvent({
          event: "student_late",
          title: "تأخر الطالب",
          body: `تأخر ${student.name} عن الحلقة اليوم`,
          url: tenantPath("/student") + `?s=${encodeURIComponent(studentId)}`,
          targets: { studentIds: [studentId] },
        });
      }
    }
  };

  const markAllPresentForDay = (dayKey: string) => {
    if (closedDayKeys.has(dayKey)) {
      toast.info("هذا اليوم إجازة أو خارج أيام العمل — لم يُعدَّل التسجيل");
      return;
    }
    const g = { ...grades };
    let updated = 0;
    students.forEach((s) => {
      if (!g[s.id]) g[s.id] = {};
      if (!g[s.id][weekNum]) g[s.id][weekNum] = emptyWeek(workingKeysList);
      const week = g[s.id][weekNum];
      const prev = week.days[dayKey] ?? emptyDayEntry();
      if (prev.attendance === "present") return;
      const merged = { ...prev, attendance: "present" as const, touchedAt: Date.now() };
      g[s.id][weekNum] = {
        ...week,
        days: { ...week.days, [dayKey]: merged },
      };
      syncScientificScoresFromDayPatch(
        halaqaId,
        s.id,
        weekNum,
        dayKey,
        sciConfig,
        { attendance: "present" },
        merged,
      );
      updated++;
    });
    setGrades(g);
    saveGrades(g, { sync: "immediate" });
    const dayLabel = DAYS.find((d) => d.key === dayKey)?.label ?? dayKey;
    toast.success(
      updated > 0
        ? `حُضّر ${updated} طالب — ${dayLabel}`
        : `جميع الطلاب مسجّلون حاضرين — ${dayLabel}`,
    );
  };

  const bulkPresentBtn = (dayKey: string) => (
    closedDayKeys.has(dayKey) ? (
      <span className="block mb-1 text-[10px] font-bold text-warning">إجازة</span>
    ) : (
    <button
      type="button"
      onClick={() => markAllPresentForDay(dayKey)}
      className="w-full mb-1 px-1 py-0.5 rounded bg-success/15 text-success border border-success/30 text-[10px] font-bold hover:bg-success/25 leading-tight"
      title="تحضير حضور جميع الطلاب"
    >
      حضّر الكل
    </button>
    )
  );

  const tableWidthPx = useMemo(
    () => gradeTableWidthPx(visibleDays.length, isTalqeen, compensationPerDay),
    [visibleDays.length, isTalqeen, compensationPerDay],
  );

  const dayHeaderClass = (dayKey: string) =>
    cn(
      "p-2 border-r border-border text-primary",
      highlightDay(dayKey) && "bg-muted/90 ring-1 ring-primary/25 font-bold",
    );

  const dayCellClass = (dayKey: string, widthClass?: string) =>
    cn(
      "p-1 border-r border-border/30",
      widthClass,
      highlightDay(dayKey) && "bg-muted/60",
      closedDayKeys.has(dayKey) && "pointer-events-none bg-warning/5",
    );

  const subHeaderClass = (dayKey: string, widthClass?: string) =>
    cn(
      "p-1 border-r border-border",
      widthClass,
      highlightDay(dayKey) && "bg-muted/50",
    );

  const layoutToggle = (
    <div
      className="inline-flex items-center rounded-lg border border-border bg-secondary/40 p-0.5"
      role="group"
      aria-label="طريقة عرض التحضير"
    >
      {([
        { mode: "auto" as const, label: "تلقائي", icon: null },
        { mode: "mobile" as const, label: "جوال", icon: Smartphone },
        { mode: "desktop" as const, label: "جدول", icon: Monitor },
      ]).map(({ mode, label, icon: Icon }) => (
        <button
          key={mode}
          type="button"
          onClick={() => setGradeLayoutMode(mode)}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold transition-colors",
            layoutMode === mode
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary",
          )}
        >
          {Icon && <Icon className="w-3.5 h-3.5" />}
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className={cn(useMobileBoard ? "space-y-0" : "glass-card rounded-2xl p-4")}>
      <div className={cn("flex justify-end px-2", useMobileBoard ? "pb-2" : "mb-3")}>
        {layoutToggle}
      </div>
      {useMobileBoard ? (
        <TeacherMobileDayBoard
          weekNum={weekNum}
          calendar={calendar}
          onWeekChange={onWeekChange}
          isTalqeen={isTalqeen}
          viewerRole={viewerRole}
          canAssign={canAssign}
          students={students}
          grades={grades}
          workingKeysList={workingKeysList}
          visibleDays={visibleDays}
          activeDayKey={activeDayKey || visibleDays[0]?.key || todayKey}
          onActiveDayChange={setActiveDayKey}
          isCurrentWeek={isCurrentWeek}
          todayKey={todayKey}
          onSciConfigChange={setSciConfig}
          halaqaId={halaqaId}
          halaqaSemesterPct={halaqaSemesterPct}
          showTransferButton={showTransferButton}
          transferOpen={transferOpen}
          onTransferOpenChange={handleTransferOpenChange}
          transferStudentId={transferStudentId}
          onTransferStudentIdChange={setTransferStudentId}
          transferReason={transferReason}
          onTransferReasonChange={setTransferReason}
          onSubmitTransfer={submitTransfer}
          planStudentIds={planStudentIds}
          frozenPlanStudentIds={frozenPlanStudentIds}
          planLinkedIds={planLinkedIds}
          onOpenPlanSheet={(s) => void openPlanSheet(s)}
          onShowAssign={() => setShowAssign(true)}
          onUpdateDay={updateDay}
          onPlanHifz={(s, dayKey) => void handlePlanHifz(s, dayKey)}
          onPlanPassFail={(s, dayKey, task, value) => void handlePlanPassFail(s, dayKey, task, value)}
          onCompensationChange={(s, dayKey, faces) => void handleDayCompensationChange(s, dayKey, faces)}
          onMarkAllPresent={markAllPresentForDay}
        />
      ) : (
        <>
      <div className="mb-4 px-2 grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex items-center gap-3 flex-wrap min-w-0 sm:justify-self-start">
          <Select value={String(weekNum)} onValueChange={(v) => onWeekChange(Number(v))}>
            <SelectTrigger className="w-[min(100%,320px)] font-bold">
              <SelectValue placeholder="اختر الأسبوع" />
            </SelectTrigger>
            <SelectContent>
              {selectableWeeks.map((wk) => (
                <SelectItem key={wk.week_number} value={String(wk.week_number)}>
                  {formatWeekOptionLabel(wk, wk.week_number === calendar.currentWeekNumber)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isCurrentWeek && (
            <span className="text-xs text-primary font-bold px-2 py-1 rounded-md bg-primary/10 whitespace-nowrap">
              اليوم: {DAYS.find((d) => d.key === todayKey)?.label ?? todayKey}
            </span>
          )}
        </div>

        {!isTalqeen && students.length > 0 && showTransferButton ? (
          <Popover open={transferOpen} onOpenChange={handleTransferOpenChange}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-warning/15 text-warning border border-warning/40 text-sm font-bold hover:bg-warning/25 shadow-sm sm:justify-self-center w-full sm:w-auto"
              >
                <Send className="w-4 h-4 shrink-0" />
                إرسال المتعثرين للإدارة
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="center"
              sideOffset={8}
              className="w-[min(100vw-2rem,22rem)] p-0 overflow-hidden shadow-lg border-warning/30"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border bg-warning/10">
                <h3 className="text-sm font-bold text-warning flex items-center gap-1.5">
                  <Send className="w-4 h-4 shrink-0" />
                  إرسال متعثر للإدارة
                </h3>
                <button
                  type="button"
                  onClick={() => setTransferOpen(false)}
                  className="p-1 rounded-md hover:bg-secondary text-muted-foreground"
                  aria-label="إغلاق"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-3 space-y-3">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  اختر الطالب واكتب سبب التحويل. يُرفق تقرير أدائه تلقائياً.
                </p>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">الطالب</label>
                  <select
                    value={transferStudentId}
                    onChange={(e) => setTransferStudentId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm"
                  >
                    <option value="">— اختر —</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">السبب</label>
                  <textarea
                    value={transferReason}
                    onChange={(e) => setTransferReason(e.target.value)}
                    rows={3}
                    placeholder="اكتب سبب التحويل..."
                    className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm resize-none"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={submitTransfer}
                    className="flex-1 px-3 py-2 rounded-lg gold-gradient text-primary-foreground font-bold text-sm"
                  >
                    إرسال
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransferOpen(false)}
                    className="px-3 py-2 rounded-lg border border-border text-sm hover:bg-secondary"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <span className="hidden sm:block" aria-hidden />
        )}

        <div className="flex items-center gap-2 flex-wrap sm:justify-self-end justify-center">
          {!isTalqeen && (
            <ScientificGradesToolbar
              halaqaId={halaqaId}
              onConfigChange={setSciConfig}
            />
          )}
          {canAssign && (
            <button
              type="button"
              onClick={() => setShowAssign(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-primary/30 text-primary text-sm hover:bg-primary/10"
            >
              <Users className="w-4 h-4" />
              تقسيم الطلاب
            </button>
          )}
          <span className="flex items-center gap-2 text-sm text-success whitespace-nowrap">
            <CheckCircle2 className="w-4 h-4" /> حفظ تلقائي
          </span>
          <span className="flex items-center gap-1.5 text-xs text-primary whitespace-nowrap" title="شاشة المعلم والمساعد تُحدَّث معاً">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/50" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            مباشر — المعلم والمساعد
          </span>
        </div>
      </div>

      {!calendar.semester && (
        <p className="text-xs text-warning mb-3 px-2">
          لم يُعرَّف فصل دراسي بعد — يعرض النظام {calendar.weeks.length} أسبوعاً افتراضياً. يُنشئ المدير الفصل من لوحة المدير.
        </p>
      )}

      {students.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground text-sm">
          {viewerRole === "assistant" ? "لم يُعيّن لك أي طالب بعد" : "لا يوجد طلاب"}
        </p>
      ) : (
      <div
        ref={tableRef}
        className="overflow-auto max-h-[min(72vh,calc(100dvh-14rem))] rounded-xl border border-border/50"
      >
      <table
        className="text-sm border-separate border-spacing-0 table-fixed"
        style={{ width: tableWidthPx, minWidth: tableWidthPx }}
      >
        <GradeTableColGroup
          dayCount={visibleDays.length}
          isTalqeen={isTalqeen}
          compensationPerDay={compensationPerDay}
        />
        <thead>
          <tr className="bg-secondary/50">
            <th className={cn("p-2 text-right min-h-14", STICKY_HEAD_CORNER, GRADE_HEAD_ROW1_TOP, "right-0", GRADE_CELL_W.student)}>
              <span className="font-bold">الطالب</span>
            </th>
            {visibleDays.map((d) => (
              <th key={d.key} data-day-col={d.key} colSpan={dayColSpan} className={cn(STICKY_HEAD, GRADE_HEAD_ROW1_TOP, dayHeaderClass(d.key), closedDayKeys.has(d.key) && "bg-warning/10")}>
                {d.label}
                {closedDayKeys.has(d.key) && (
                  <span className="block text-[10px] text-warning font-bold">
                    {getWeekDaySlot(calendar, weekNum, d.key)?.isHoliday ? "إجازة" : "—"}
                  </span>
                )}
                {highlightDay(d.key) && !closedDayKeys.has(d.key) && <span className="block text-[10px] text-primary font-normal">اليوم</span>}
              </th>
            ))}
            {!isTalqeen && !compensationPerDay && (
              <th
                rowSpan={2}
                className={cn(
                  "p-2 border-r border-border text-success font-bold align-middle",
                  STICKY_HEAD,
                  GRADE_HEAD_ROW1_TOP,
                  GRADE_CELL_W.compensation,
                )}
              >
                تعويض
              </th>
            )}
            <th className={cn("p-2 border-r border-border text-muted-foreground", STICKY_HEAD, GRADE_HEAD_ROW1_TOP, GRADE_CELL_W.weekPct)}>نسبة الأسبوع</th>
            <th className={cn("p-2 border-r border-border text-primary font-bold", STICKY_HEAD, GRADE_HEAD_ROW1_TOP, GRADE_CELL_W.semesterPct)}>النسبة الكلية</th>
          </tr>
          <tr className="bg-secondary/30 text-xs text-muted-foreground">
            <th className={cn(STICKY_HEAD_CORNER, GRADE_HEAD_ROW2_TOP, "right-0", GRADE_CELL_W.student)} />
            {visibleDays.map((d) =>
              isTalqeen ? (
                <React.Fragment key={d.key}>
                  <th className={cn(STICKY_HEAD, GRADE_HEAD_ROW2_TOP, subHeaderClass(d.key, GRADE_CELL_W.att))}>
                    {bulkPresentBtn(d.key)}
                    <span className="block">حاضر</span>
                  </th>
                  <th className={cn(STICKY_HEAD, GRADE_HEAD_ROW2_TOP, subHeaderClass(d.key, GRADE_CELL_W.wajib))}>واجب</th>
                </React.Fragment>
              ) : (
                <React.Fragment key={d.key}>
                  <th className={cn(STICKY_HEAD, GRADE_HEAD_ROW2_TOP, subHeaderClass(d.key, GRADE_CELL_W.att))}>
                    {bulkPresentBtn(d.key)}
                    <span className="block">الحضور</span>
                  </th>
                  <th className={cn(STICKY_HEAD, GRADE_HEAD_ROW2_TOP, subHeaderClass(d.key, GRADE_CELL_W.hifz))}>حفظ</th>
                  <th className={cn(STICKY_HEAD, GRADE_HEAD_ROW2_TOP, subHeaderClass(d.key, GRADE_CELL_W.pf))}>ربط</th>
                  <th className={cn(STICKY_HEAD, GRADE_HEAD_ROW2_TOP, subHeaderClass(d.key, GRADE_CELL_W.pf))}>مراجعة</th>
                  {compensationPerDay && (
                    <th className={cn(STICKY_HEAD, GRADE_HEAD_ROW2_TOP, subHeaderClass(d.key, GRADE_CELL_W.compensation), "text-success text-[10px]")}>
                      تع
                    </th>
                  )}
                </React.Fragment>
              )
            )}
            <th className={cn(STICKY_HEAD, GRADE_HEAD_ROW2_TOP, GRADE_CELL_W.weekPct)} />
            <th className={cn(STICKY_HEAD, GRADE_HEAD_ROW2_TOP, GRADE_CELL_W.semesterPct)} />
          </tr>
        </thead>
        <tbody>
          {students.map((s, studentIndex) => {
            const w = ensureWeekDays(grades[s.id]?.[weekNum] ?? emptyWeek(workingKeysList), workingKeysList);
            const weekPct = weekPercentage(w, isTalqeen, s.levelType);
            return (
              <tr key={s.id} className="group border-b border-border/50 hover:bg-accent/30">
                <StudentNameCell index={studentIndex} name={s.name}>
                  {s.assignedTo === "assistant" && viewerRole === "teacher" && (
                    <span className="text-[10px] text-muted-foreground">مع المساعد</span>
                  )}
                  {frozenPlanStudentIds.has(s.id) && (
                    <span className="text-[10px] text-warning">الخطة مجمّدة</span>
                  )}
                  {planLinkedIds.has(s.id) && (
                  <button
                    type="button"
                    onClick={() => void openPlanSheet(s)}
                    className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline w-fit"
                  >
                    <ClipboardList className="w-3 h-3" />
                    {planStudentIds.has(s.id) ? "الخطة" : frozenPlanStudentIds.has(s.id) ? "عرض (مجمّدة)" : "عرض الخطة"}
                  </button>
                  )}
                </StudentNameCell>
                {visibleDays.map((d) => {
                  const e = dayEntryFor(w, d.key, workingKeysList);
                  const dayClosed = closedDayKeys.has(d.key);
                  return isTalqeen ? (
                    <React.Fragment key={d.key}>
                      <td className={cn(dayCellClass(d.key, GRADE_CELL_W.att), "!p-0.5")}>
                        <AttSelect value={e.attendance} talqeen onChange={(v) => updateDay(s.id, d.key, { attendance: v })} />
                      </td>
                      <td className={cn("p-1 text-center", GRADE_CELL_W.wajib, highlightDay(d.key) && "bg-muted/60", dayClosed && "pointer-events-none bg-warning/5")}>
                        <Cbx checked={!!e.wajib} onChange={(v) => updateDay(s.id, d.key, { wajib: v })} />
                      </td>
                    </React.Fragment>
                  ) : (
                    <React.Fragment key={d.key}>
                      <td className={cn(dayCellClass(d.key, GRADE_CELL_W.att), "!p-0.5")}>
                        <AttSelect value={e.attendance} onChange={(v) => updateDay(s.id, d.key, { attendance: v })} />
                      </td>
                      <td className={dayCellClass(d.key, GRADE_CELL_W.hifz)}>
                        <PlanAwareTaskCell
                          student={s}
                          task="hifz"
                          hasPlan={planStudentIds.has(s.id)}
                          hifzValue={e.hifz}
                          passFailValue=""
                          onHifzChange={(v) => updateDay(s.id, d.key, { hifz: v })}
                          onPassFailChange={() => {}}
                          onPlanHifzChange={() => void handlePlanHifz(s, d.key)}
                        />
                      </td>
                      <td className={dayCellClass(d.key, GRADE_CELL_W.pf)}>
                        <PlanAwareTaskCell
                          student={s}
                          task="rabt"
                          hasPlan={planStudentIds.has(s.id)}
                          hifzValue=""
                          passFailValue={e.rabt}
                          onHifzChange={() => {}}
                          onPassFailChange={(v) => updateDay(s.id, d.key, { rabt: v })}
                          onPlanPassFailChange={(v) => void handlePlanPassFail(s, d.key, "rabt", v)}
                        />
                      </td>
                      <td className={dayCellClass(d.key, GRADE_CELL_W.pf)}>
                        <PlanAwareTaskCell
                          student={s}
                          task="muraja"
                          hasPlan={planStudentIds.has(s.id)}
                          hifzValue=""
                          passFailValue={e.muraja}
                          onHifzChange={() => {}}
                          onPassFailChange={(v) => updateDay(s.id, d.key, { muraja: v })}
                          onPlanPassFailChange={(v) => void handlePlanPassFail(s, d.key, "muraja", v)}
                        />
                      </td>
                      {compensationPerDay && (
                        <td className={dayCellClass(d.key, GRADE_CELL_W.compensation)}>
                          <CompensationSelect
                            value={e.compensationFaces ?? 0}
                            maxFaces={compensationRemainingForDay(w, d.key, workingKeysList)}
                            onChange={(v) => void handleDayCompensationChange(s, d.key, v)}
                          />
                        </td>
                      )}
                    </React.Fragment>
                  );
                })}
                {!isTalqeen && !compensationPerDay && (() => {
                  const compEntry = dayEntryFor(w, compensationDayKey, workingKeysList);
                  return (
                    <td className={cn("p-1 border-r border-border/30", GRADE_CELL_W.compensation)}>
                      <CompensationSelect
                        value={compEntry.compensationFaces ?? 0}
                        maxFaces={compensationRemainingForDay(w, compensationDayKey, workingKeysList)}
                        onChange={(v) => void handleDayCompensationChange(s, compensationDayKey, v)}
                      />
                    </td>
                  );
                })()}
                <td className={cn("p-2 text-center font-bold border-r border-border/30", GRADE_CELL_W.weekPct)}>
                  <span className={weekPct >= 80 ? "text-success" : weekPct >= 50 ? "text-warning" : "text-muted-foreground"}>
                    {weekPct}%
                  </span>
                </td>
                <td className={cn("p-2 text-center border-r border-border/30", GRADE_CELL_W.semesterPct)}>
                  <SemesterBreakdownPopover
                    studentId={s.id}
                    isTalqeen={isTalqeen}
                    grades={grades}
                    calendar={calendar}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      )}

      {students.length > 0 && (
        <div className="mt-4 px-2 py-3 rounded-xl border border-primary/25 bg-primary/5 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            النسبة الكلية للحلقة (من بداية الفصل)
            {calendar.semester && ` · ${calendar.semester.name}`}
          </span>
          <span className="text-xl font-bold gold-text">{formatOverallPercent(halaqaSemesterPct)}</span>
        </div>
      )}
        </>
      )}

      {showAssign && <AssignmentDialog halaqaId={halaqaId} onClose={() => setShowAssign(false)} />}

      <Dialog
        open={!!planSheetStudent}
        onOpenChange={(o) => {
          if (!o) {
            setPlanSheetStudent(null);
            setPlanSheetData(null);
            setPlanSheetError(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ورقة الإنجاز التراكمية</DialogTitle>
          </DialogHeader>
          {planSheetStudent && (
            <StudentPlanSheet
              data={planSheetData ?? { assignment: null, plan: null, segments: [], completions: [] }}
              studentName={planSheetStudent.name}
              readOnly
              loading={planSheetLoading}
              error={planSheetError}
            />
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}

function Cbx({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${
        checked ? "bg-primary border-primary" : "border-border bg-input hover:border-primary/50"
      }`}
    >
      {checked && <Check className="w-4 h-4 text-primary-foreground" />}
    </button>
  );
}

function HalaqaNotifications({ halaqaId }: { halaqaId: number }) {
  const [items, setItems] = useState(() =>
    loadNotifications().filter((n) => !n.read && n.targetHalaqaId === halaqaId)
  );
  if (items.length === 0) return null;
  const dismiss = (id: string) => {
    dismissNotification(id);
    setItems(loadNotifications().filter((n) => !n.read && n.targetHalaqaId === halaqaId));
  };
  return (
    <div className="glass-card rounded-2xl p-4 mb-6 border border-warning/30">
      <div className="flex items-center gap-2 mb-3 text-warning font-bold">
        <Bell className="w-4 h-4" />
        إشعارات الحلقة ({items.length})
      </div>
      <div className="space-y-2">
        {items.map((n) => (
          <div key={n.id} className="flex items-start gap-2 p-2 rounded-lg bg-warning/10">
            <div className="flex-1 text-sm">{n.message}</div>
            <button
              onClick={() => dismiss(n.id)}
              aria-label="تم"
              className="p-1.5 rounded-md bg-success/15 text-success border border-success/30"
            >
              <Check className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
