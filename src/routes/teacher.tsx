import { createFileRoute, useNavigate } from "@tanstack/react-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import {
  loadHalaqat, loadStudents, saveStudents, loadGrades, saveGrades, emptyWeek, DAYS,
  weekPercentage, enqueueSard, loadNotifications, dismissNotification, pushNotification,
  ensureGradesSemester,
  type WeekRecord, type DayEntry, type Student,
} from "@/lib/mock-data";
import {
  fetchActiveCalendar,
  getSelectableWeeks,
  formatWeekOptionLabel,
  workingDayKeysFromSemester,
  type AcademicCalendar,
} from "@/lib/academic-context";
import { weekLabel } from "@/lib/arabic-numbers";
import { cn } from "@/lib/utils";
import { AppHeader } from "@/components/AppHeader";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Bell, Check, CheckCircle2, ClipboardList, ClipboardCheck, Loader2, Send, Users, X } from "lucide-react";
import { Toaster, toast } from "sonner";
import { applyPlanInput, fetchStudentPlanSheet } from "@/lib/plans-service";
import type { StudentPlanSheetData, TapValue } from "@/lib/plan-types";
import { StudentPlanSheet } from "@/components/plans/StudentPlanSheet";
import { PlanAwareTaskCell } from "@/components/plans/PlanAwareTaskCell";
import { AttSelect, CustomFieldSelect } from "@/components/plans/TeacherGradeInputs";
import { loadHalaqaCustomFields } from "@/lib/halaqa-custom-fields";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  semesterOverallPercentage,
  halaqaSemesterAverage,
  formatOverallPercent,
  overallPercentColorClass,
} from "@/lib/semester-grading";
import { TeacherGradesExport } from "@/components/TeacherGradesExport";
import { StaffAttendanceCheckInButton } from "@/components/StaffAttendanceCheckInButton";
import { TeacherWeeklyTestsPanel } from "@/components/TeacherWeeklyTestsPanel";
import { ensureWeeklyTestsSemester } from "@/lib/weekly-tests";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/teacher")({
  validateSearch: z.object({
    h: z.number().optional(),
    w: z.number().optional(),
    view: z.enum(["grades", "tests"]).optional(),
  }),
  component: TeacherPage,
});

function TeacherPage() {
  const { h, w, view: viewParam } = Route.useSearch();
  const view = viewParam ?? "grades";
  const navigate = useNavigate();
  const halaqat = loadHalaqat();
  const halaqa = halaqat.find((x) => x.id === h);
  const [role, setRole] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [calendar, setCalendar] = useState<AcademicCalendar | null>(null);
  const [loadingCal, setLoadingCal] = useState(true);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  useEffect(() => {
    setRole(sessionStorage.getItem("qs_role"));
    setName(sessionStorage.getItem("qs_name"));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingCal(true);
    fetchActiveCalendar(true)
      .then((cal) => {
        if (cancelled) return;
        const reset = ensureGradesSemester(cal.semester?.id ?? null);
        const testsReset = ensureWeeklyTestsSemester(cal.semester?.id ?? null);
        if (reset) toast.info("بدء فصل دراسي جديد — تم تصفير سجل التحضير");
        if (testsReset) toast.info("بدء فصل دراسي جديد — تم تصفير الاختبارات الأسبوعية");
        setCalendar(cal);
        const selectable = cal.weeks.filter((wk) => wk.week_number <= cal.currentWeekNumber);
        const fromUrl = w && selectable.some((wk) => wk.week_number === w) ? w : null;
        setSelectedWeek(fromUrl ?? cal.currentWeekNumber);
      })
      .finally(() => {
        if (!cancelled) setLoadingCal(false);
      });
    return () => { cancelled = true; };
  }, [w]);

  const isAssistant = role === "assistant";
  const isManager = role === "manager";
  const elevated = isManager || role === "secretary" || role === "supervisor";
  const roleLabel = isAssistant ? "مساعد" : isManager ? "مدير" : elevated ? "مشرف" : "معلم";

  const handleWeekChange = (weekNum: number) => {
    setSelectedWeek(weekNum);
    if (halaqa) {
      navigate({ to: "/teacher", search: { h: halaqa.id, w: weekNum, view } });
    }
  };

  const setView = (next: "grades" | "tests") => {
    if (halaqa) {
      navigate({ to: "/teacher", search: { h: halaqa.id, w: selectedWeek ?? undefined, view: next } });
    }
  };

  if (!halaqa) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass-card p-8 rounded-2xl text-center">
          <p>الحلقة غير موجودة</p>
          <button onClick={() => navigate({ to: "/" })} className="mt-4 px-4 py-2 rounded-lg gold-gradient text-primary-foreground">العودة</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Toaster position="top-center" richColors />
      <AppHeader title={halaqa.name} subtitle={roleLabel} />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="glass-card rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-2xl display gold-text">مرحباً {name || ""}</div>
              <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-bold">
                  {isManager ? "صلاحيات معلم كاملة" : isAssistant ? "مساعد" : elevated ? "صلاحية كاملة" : "معلم"}
                </span>
                {halaqa.name}
                {calendar?.semester && (
                  <span className="text-xs text-muted-foreground">· {calendar.semester.name}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap shrink-0">
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
          <Tabs value={view} onValueChange={(v) => setView(v as "grades" | "tests")} dir="rtl">
            <TabsList className="w-full sm:w-auto h-auto flex gap-1 p-1 mb-4 bg-secondary/50 border border-border rounded-xl">
              <TabsTrigger value="grades" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <ClipboardList className="w-4 h-4" /> التحضير والدرجات
              </TabsTrigger>
              <TabsTrigger value="tests" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <ClipboardCheck className="w-4 h-4" /> الاختبارات الأسبوعية
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
            <TabsContent value="tests" className="mt-0">
              <TeacherWeeklyTestsPanel
                halaqaId={halaqa.id}
                halaqaName={halaqa.name}
                isTalqeen={halaqa.isTalqeen}
                calendar={calendar}
                weekNum={selectedWeek}
                onWeekChange={handleWeekChange}
                viewerRole={isAssistant ? "assistant" : "teacher"}
              />
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
      onChange={(e) => navigate({ to: "/teacher", search: { h: Number(e.target.value) } })}
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

function WeekTable({ halaqaId, weekNum, calendar, onWeekChange, isTalqeen, viewerRole, canAssign }: WeekTableProps) {
  const tableRef = useRef<HTMLDivElement>(null);
  const allStudents = useMemo(() => loadStudents().filter((s) => s.halaqaId === halaqaId), [halaqaId]);
  const students = viewerRole === "assistant"
    ? allStudents.filter((s) => s.assignedTo !== "teacher")
    : allStudents.filter((s) => s.assignedTo !== "assistant");
  const [grades, setGrades] = useState(() => loadGrades());
  const customFields = useMemo(() => loadHalaqaCustomFields(halaqaId), [halaqaId]);
  const baseDayCols = isTalqeen ? 2 : 4;
  const dayColSpan = baseDayCols + customFields.length;
  const [transferFor, setTransferFor] = useState<Student | null>(null);
  const [transferReason, setTransferReason] = useState("");
  const [showAssign, setShowAssign] = useState(false);
  const [planStudentIds, setPlanStudentIds] = useState<Set<string>>(new Set());
  const [planSheetStudent, setPlanSheetStudent] = useState<Student | null>(null);
  const [planSheetData, setPlanSheetData] = useState<StudentPlanSheetData | null>(null);
  const [planSheetLoading, setPlanSheetLoading] = useState(false);
  const senderName = typeof window !== "undefined" ? (sessionStorage.getItem("qs_name") || "المعلم") : "المعلم";

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
  const isCurrentWeek = weekNum === calendar.currentWeekNumber;
  const todayKey = calendar.currentDayKey;

  const highlightDay = (dayKey: string) => isCurrentWeek && dayKey === todayKey;

  useEffect(() => {
    if (!isCurrentWeek || !tableRef.current) return;
    const col = tableRef.current.querySelector(`[data-day-col="${todayKey}"]`);
    col?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [isCurrentWeek, todayKey, weekNum]);

  const submitTransfer = () => {
    if (!transferFor) return;
    const reason = transferReason.trim();
    if (!reason) { toast.error("اكتب سبب التحويل"); return; }
    pushNotification({
      message: `تحويل من ${senderName}: الطالب ${transferFor.name} — ${reason}`,
      type: "transfer",
      actionTab: "transfers",
      transferData: {
        studentId: transferFor.id,
        halaqaId: transferFor.halaqaId,
        week: weekNum,
        reason,
        fromName: senderName,
      },
      transferStatus: "pending",
    });
    toast.success("تم إرسال الطالب للإدارة");
    setTransferFor(null);
    setTransferReason("");
  };

  useEffect(() => {
    let changed = false;
    const g = { ...grades };
    students.forEach((s) => {
      if (!g[s.id]) g[s.id] = {};
      if (!g[s.id][weekNum]) { g[s.id][weekNum] = emptyWeek(); changed = true; }
    });
    if (changed) { setGrades(g); saveGrades(g); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekNum, halaqaId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const withPlan = new Set<string>();
      await Promise.all(
        students.map(async (s) => {
          try {
            const sheet = await fetchStudentPlanSheet(s.id);
            if (sheet.assignment?.status === "active") withPlan.add(s.id);
          } catch {
            /* ignore */
          }
        }),
      );
      if (!cancelled) setPlanStudentIds(withPlan);
    })();
    return () => { cancelled = true; };
  }, [students]);

  const openPlanSheet = async (s: Student) => {
    setPlanSheetStudent(s);
    setPlanSheetLoading(true);
    try {
      setPlanSheetData(await fetchStudentPlanSheet(s.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل تحميل الخطة");
    } finally {
      setPlanSheetLoading(false);
    }
  };

  const handlePlanHifz = async (s: Student, dayKey: string, tap: TapValue) => {
    if (!tap) return;
    updateDay(s.id, dayKey, { hifz: tap });
    try {
      const segs = await applyPlanInput(s.id, "hifz", tap, senderName);
      toast.success(`تم تسجيل ${segs.length} مقطع — حفظ`);
      if (planSheetStudent?.id === s.id) {
        setPlanSheetData(await fetchStudentPlanSheet(s.id));
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل تحديث الخطة");
    }
  };

  const update = (studentId: string, fn: (w: WeekRecord) => WeekRecord) => {
    const g = { ...grades };
    if (!g[studentId]) g[studentId] = {};
    if (!g[studentId][weekNum]) g[studentId][weekNum] = emptyWeek();
    g[studentId][weekNum] = fn(g[studentId][weekNum]);
    setGrades(g);
    saveGrades(g);
  };

  const updateDay = (studentId: string, dayKey: string, patch: Partial<DayEntry>) => {
    update(studentId, (w) => ({ ...w, days: { ...w.days, [dayKey]: { ...w.days[dayKey], ...patch } } }));
  };

  const markAllPresentForDay = (dayKey: string) => {
    const g = { ...grades };
    let updated = 0;
    students.forEach((s) => {
      if (!g[s.id]) g[s.id] = {};
      if (!g[s.id][weekNum]) g[s.id][weekNum] = emptyWeek();
      const week = g[s.id][weekNum];
      const prev = week.days[dayKey] ?? emptyWeek().days[dayKey];
      if (prev.attendance === "present") return;
      g[s.id][weekNum] = {
        ...week,
        days: { ...week.days, [dayKey]: { ...prev, attendance: "present" } },
      };
      updated++;
    });
    setGrades(g);
    saveGrades(g);
    const dayLabel = DAYS.find((d) => d.key === dayKey)?.label ?? dayKey;
    toast.success(
      updated > 0
        ? `حُضّر ${updated} طالب — ${dayLabel}`
        : `جميع الطلاب مسجّلون حاضرين — ${dayLabel}`,
    );
  };

  const bulkPresentBtn = (dayKey: string) => (
    <button
      type="button"
      onClick={() => markAllPresentForDay(dayKey)}
      className="w-full mb-1 px-1 py-0.5 rounded bg-success/15 text-success border border-success/30 text-[10px] font-bold hover:bg-success/25 leading-tight"
      title="تحضير حضور جميع الطلاب"
    >
      حضّر الكل
    </button>
  );

  const updateCustomField = (studentId: string, dayKey: string, fieldId: string, value: string) => {
    update(studentId, (w) => {
      const prev = w.days[dayKey] ?? emptyWeek().days[dayKey];
      const custom = { ...(prev.custom ?? {}) };
      if (value) custom[fieldId] = value;
      else delete custom[fieldId];
      return {
        ...w,
        days: {
          ...w.days,
          [dayKey]: {
            ...prev,
            custom: Object.keys(custom).length > 0 ? custom : undefined,
          },
        },
      };
    });
  };

  const renderCustomCells = (s: Student, dayKey: string, entry: DayEntry) =>
    customFields.map((f) => (
      <td key={f.id} className={dayCellClass(dayKey)}>
        <CustomFieldSelect
          value={entry.custom?.[f.id] ?? ""}
          options={f.options}
          onChange={(v) => updateCustomField(s.id, dayKey, f.id, v)}
        />
      </td>
    ));

  const toggleSard = (s: Student, on: boolean) => {
    update(s.id, (w) => ({ ...w, sard: on }));
    if (on) {
      enqueueSard(s.id, s.halaqaId, weekNum);
      toast.success(`تم إحالة الطالب ${s.name} للمسمّع`);
    }
  };

  const dayHeaderClass = (dayKey: string) =>
    cn(
      "p-2 border-r border-border text-primary",
      highlightDay(dayKey) && "bg-muted/90 ring-1 ring-primary/25 font-bold",
    );

  const dayCellClass = (dayKey: string) =>
    cn(
      "p-1 border-r border-border/30",
      highlightDay(dayKey) && "bg-muted/60",
    );

  return (
    <div className="glass-card rounded-2xl p-4 overflow-x-auto" ref={tableRef}>
      <div className="flex items-center justify-between mb-4 px-2 gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap min-w-0">
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
            <span className="text-xs text-primary font-bold px-2 py-1 rounded-md bg-primary/10">
              اليوم: {DAYS.find((d) => d.key === todayKey)?.label ?? todayKey}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
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
          <span className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="w-4 h-4" /> حفظ تلقائي
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
      <table className="w-full text-sm border-collapse min-w-[900px]">
        <thead>
          <tr className="bg-secondary/50">
            <th className="p-2 text-right sticky right-0 bg-secondary z-10 min-w-[140px]">الطالب</th>
            {visibleDays.map((d) => (
              <th key={d.key} data-day-col={d.key} colSpan={dayColSpan} className={dayHeaderClass(d.key)}>
                {d.label}
                {highlightDay(d.key) && <span className="block text-[10px] text-primary font-normal">اليوم</span>}
              </th>
            ))}
            <th className="p-2 border-r border-border">السرد</th>
            <th className="p-2 border-r border-border text-muted-foreground">نسبة الأسبوع</th>
            <th className="p-2 border-r border-border text-primary font-bold">النسبة الكلية</th>
            <th className="p-2 border-r border-border text-warning">إرسال للإدارة</th>
          </tr>
          <tr className="bg-secondary/30 text-xs text-muted-foreground">
            <th className="sticky right-0 bg-secondary"></th>
            {visibleDays.map((d) =>
              isTalqeen ? (
                <React.Fragment key={d.key}>
                  <th className={cn("p-1 border-r border-border", highlightDay(d.key) && "bg-muted/50")}>
                    {bulkPresentBtn(d.key)}
                    <span className="block">حاضر</span>
                  </th>
                  <th className={cn("p-1", highlightDay(d.key) && "bg-muted/50")}>واجب</th>
                  {customFields.map((f) => (
                    <th key={f.id} className={cn("p-1 border-r border-border text-primary/80", highlightDay(d.key) && "bg-muted/50")}>
                      {f.label}
                    </th>
                  ))}
                </React.Fragment>
              ) : (
                <React.Fragment key={d.key}>
                  <th className={cn("p-1 border-r border-border", highlightDay(d.key) && "bg-muted/50")}>
                    {bulkPresentBtn(d.key)}
                    <span className="block">الحضور</span>
                  </th>
                  <th className={cn("p-1", highlightDay(d.key) && "bg-muted/50")}>حفظ</th>
                  <th className={cn("p-1", highlightDay(d.key) && "bg-muted/50")}>ربط</th>
                  <th className={cn("p-1", highlightDay(d.key) && "bg-muted/50")}>مراجعة</th>
                  {customFields.map((f) => (
                    <th key={f.id} className={cn("p-1 border-r border-border text-primary/80", highlightDay(d.key) && "bg-muted/50")}>
                      {f.label}
                    </th>
                  ))}
                </React.Fragment>
              )
            )}
            <th></th>
            <th></th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => {
            const w = grades[s.id]?.[weekNum] || emptyWeek();
            const weekPct = weekPercentage(w, isTalqeen);
            const semesterPct = semesterOverallPercentage(s.id, s.levelType, isTalqeen, grades, calendar);
            return (
              <tr key={s.id} className="border-b border-border/50 hover:bg-accent/30">
                <td className="p-2 sticky right-0 bg-card font-medium">
                  <div className="flex flex-col gap-1">
                    <span>{s.name}</span>
                    {s.assignedTo === "assistant" && viewerRole === "teacher" && (
                      <span className="text-[10px] text-muted-foreground">مع المساعد</span>
                    )}
                    <button
                      type="button"
                      onClick={() => void openPlanSheet(s)}
                      className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline w-fit"
                    >
                      <ClipboardList className="w-3 h-3" />
                      {planStudentIds.has(s.id) ? "الخطة" : "عرض الخطة"}
                    </button>
                  </div>
                </td>
                {visibleDays.map((d) => {
                  const e = w.days[d.key];
                  return isTalqeen ? (
                    <React.Fragment key={d.key}>
                      <td className={dayCellClass(d.key)}>
                        <AttSelect value={e.attendance} talqeen onChange={(v) => updateDay(s.id, d.key, { attendance: v })} />
                      </td>
                      <td className={cn("p-1 text-center", highlightDay(d.key) && "bg-muted/60")}>
                        <Cbx checked={!!e.wajib} onChange={(v) => updateDay(s.id, d.key, { wajib: v })} />
                      </td>
                      {renderCustomCells(s, d.key, e)}
                    </React.Fragment>
                  ) : (
                    <React.Fragment key={d.key}>
                      <td className={dayCellClass(d.key)}>
                        <AttSelect value={e.attendance} onChange={(v) => updateDay(s.id, d.key, { attendance: v })} />
                      </td>
                      <td className={dayCellClass(d.key)}>
                        <PlanAwareTaskCell
                          student={s}
                          task="hifz"
                          hasPlan={planStudentIds.has(s.id)}
                          hifzValue={e.hifz}
                          passFailValue=""
                          onHifzChange={(v) => updateDay(s.id, d.key, { hifz: v })}
                          onPassFailChange={() => {}}
                          onPlanHifzChange={(v) => void handlePlanHifz(s, d.key, v)}
                        />
                      </td>
                      <td className={dayCellClass(d.key)}>
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
                      <td className={dayCellClass(d.key)}>
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
                      {renderCustomCells(s, d.key, e)}
                    </React.Fragment>
                  );
                })}
                <td className="p-1 text-center border-r border-border/30">
                  <Cbx checked={w.sard} onChange={(v) => toggleSard(s, v)} />
                </td>
                <td className="p-2 text-center font-bold border-r border-border/30">
                  <span className={weekPct >= 80 ? "text-success" : weekPct >= 50 ? "text-warning" : "text-muted-foreground"}>
                    {weekPct}%
                  </span>
                </td>
                <td className="p-2 text-center font-bold border-r border-border/30">
                  <span className={overallPercentColorClass(semesterPct)}>
                    {formatOverallPercent(semesterPct)}
                  </span>
                </td>
                <td className="p-1 text-center">
                  <button
                    onClick={() => { setTransferFor(s); setTransferReason(""); }}
                    title="إرسال للإدارة"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-warning/15 text-warning border border-warning/40 hover:bg-warning/25 text-xs"
                  >
                    <Send className="w-3.5 h-3.5" /> إرسال
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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

      {showAssign && <AssignmentDialog halaqaId={halaqaId} onClose={() => setShowAssign(false)} />}

      <Dialog open={!!planSheetStudent} onOpenChange={(o) => !o && setPlanSheetStudent(null)}>
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
            />
          )}
        </DialogContent>
      </Dialog>

      {transferFor && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card rounded-2xl max-w-md w-full p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-warning flex items-center gap-2"><Send className="w-5 h-5" /> إرسال للإدارة</h3>
              <button onClick={() => setTransferFor(null)} className="p-1.5 hover:bg-secondary rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm mb-2">الطالب: <span className="font-bold">{transferFor.name}</span> · {weekLabel(weekNum)}</p>
            <p className="text-xs text-muted-foreground mb-3">اكتب سبب التحويل للمدير. سيُرفق تقرير كامل عن أداء الطالب تلقائياً.</p>
            <textarea
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
              rows={4}
              placeholder="السبب..."
              className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm"
            />
            <div className="flex gap-2 mt-4">
              <button onClick={submitTransfer} className="flex-1 px-4 py-2 rounded-lg gold-gradient text-primary-foreground font-bold">إرسال</button>
              <button onClick={() => setTransferFor(null)} className="px-4 py-2 rounded-lg border border-border">إلغاء</button>
            </div>
          </div>
        </div>
      )}
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
