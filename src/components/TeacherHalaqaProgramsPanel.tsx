import { useMemo, useState } from "react";
import { loadStudents } from "@/lib/mock-data";
import type { AcademicCalendar } from "@/lib/academic-context";
import {
  formatWeekOptionLabel,
  getSelectableWeeks,
  workingDayKeysFromSemester,
} from "@/lib/academic-context";
import {
  defaultNewProgram,
  loadHalaqaPrograms,
  loadHalaqaProgramsAll,
  loadProgramGrades,
  programLevelLabels,
  programSlots,
  PROGRAM_DAYS,
  saveHalaqaPrograms,
  saveProgramGrades,
  SCHEDULE_MODE_LABELS,
  studentAllProgramsPeriodTotals,
  studentAllProgramsWeekTotals,
  studentSingleProgramPeriodTotals,
  type HalaqaProgram,
  type ProgramWeekTotals,
  type ProgramLevel,
  type ProgramScheduleMode,
} from "@/lib/halaqa-programs";
import { downloadHalaqaProgramsWorkbook } from "@/lib/halaqa-programs-export";
import {
  filterStandardPrograms,
  findScientificProgram,
  isScientificHalaqaProgram,
} from "@/lib/scientific-grades-program";
import {
  enabledScientificFields,
  loadScientificConfig,
  loadScientificData,
  SCIENTIFIC_FIELD_LABELS,
  SCIENTIFIC_TOTAL_LABELS,
  scientificPeriodMaxPossible,
  studentScientificPeriodTotals,
  studentScientificWeekTotals,
  type ScientificGradeField,
  type ScientificWeekTotals,
} from "@/lib/scientific-grades";
import { CustomFieldSelect } from "@/components/plans/TeacherGradeInputs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BookOpen, Download, Info, Plus, Settings2, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Props = {
  halaqaId: number;
  halaqaName: string;
  calendar: AcademicCalendar;
  weekNum: number;
  onWeekChange: (n: number) => void;
  viewerRole: "teacher" | "assistant" | "manager";
  canManagePrograms: boolean;
  readOnly?: boolean;
};

export function TeacherHalaqaProgramsPanel({
  halaqaId,
  halaqaName,
  calendar,
  weekNum,
  onWeekChange,
  viewerRole,
  canManagePrograms,
  readOnly = false,
}: Props) {
  const [mode, setMode] = useState<"fill" | "setup">("fill");
  const [programs, setPrograms] = useState<HalaqaProgram[]>(() => loadHalaqaPrograms(halaqaId));
  const [grades, setGrades] = useState(() => loadProgramGrades(halaqaId));
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<HalaqaProgram | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [fromDate, setFromDate] = useState(calendar.semester?.start_date ?? calendar.operationalDate);
  const [toDate, setToDate] = useState(calendar.operationalDate);

  const allStudents = useMemo(
    () => loadStudents().filter((s) => s.halaqaId === halaqaId),
    [halaqaId],
  );
  const students = useMemo(
    () =>
      viewerRole === "assistant"
        ? allStudents.filter((s) => s.assignedTo !== "teacher")
        : allStudents.filter((s) => s.assignedTo !== "assistant"),
    [allStudents, viewerRole],
  );

  const selectableWeeks = useMemo(() => getSelectableWeeks(calendar), [calendar]);

  const refreshPrograms = () => {
    setPrograms(loadHalaqaPrograms(halaqaId));
  };

  const persistGrades = (next: typeof grades) => {
    setGrades(next);
    saveProgramGrades(halaqaId, next);
  };

  const setCell = (studentId: string, programId: string, slotKey: string, value: string) => {
    if (readOnly) return;
    const next = { ...grades };
    if (!next[studentId]) next[studentId] = {};
    if (!next[studentId][weekNum]) next[studentId][weekNum] = {};
    if (!next[studentId][weekNum][programId]) next[studentId][weekNum][programId] = {};
    const slotMap = { ...next[studentId][weekNum][programId] };
    if (value) slotMap[slotKey] = value;
    else delete slotMap[slotKey];
    next[studentId][weekNum][programId] = slotMap;
    persistGrades(next);
  };

  const openNewProgram = () => {
    setEditing(defaultNewProgram(programs.length));
    setEditorOpen(true);
  };

  const openEditProgram = (p: HalaqaProgram) => {
    if (isScientificHalaqaProgram(p)) {
      toast.info("برنامج درجات العلمي يُحدَّث تلقائياً من إعداد الدرجات العلمية");
      return;
    }
    setEditing({
      ...p,
      levels: p.levels.map((l) => ({ ...l })),
      weekdays: [...p.weekdays],
    });
    setEditorOpen(true);
  };

  const saveProgram = () => {
    if (!editing) return;
    const name = editing.name.trim();
    const levels = editing.levels
      .map((l) => ({ label: l.label.trim(), score: Math.max(0, Number(l.score) || 0) }))
      .filter((l) => l.label);
    if (!name) {
      toast.error("اسم البرنامج مطلوب");
      return;
    }
    if (levels.length === 0) {
      toast.error("أضف مستوى واحداً على الأقل مع درجته");
      return;
    }
    if (editing.scheduleMode === "weekdays" && editing.weekdays.length === 0) {
      toast.error("اختر يوماً واحداً على الأقل");
      return;
    }
    const payload = { ...editing, name, levels };
    const all = loadHalaqaProgramsAll(halaqaId);
    const exists = all.some((p) => p.id === editing.id);
    const next = exists
      ? all.map((p) => (p.id === editing.id ? payload : p))
      : [...all, payload];
    saveHalaqaPrograms(halaqaId, next);
    refreshPrograms();
    setEditorOpen(false);
    setEditing(null);
    toast.success("تم حفظ البرنامج");
  };

  const removeProgram = (id: string) => {
    if (isScientificHalaqaProgram({ id } as HalaqaProgram)) {
      toast.error("برنامج درجات العلمي يُدار من تبويب التحضير والدرجات");
      return;
    }
    const all = loadHalaqaProgramsAll(halaqaId).map((p) =>
      p.id === id ? { ...p, active: false } : p,
    );
    saveHalaqaPrograms(halaqaId, all);
    refreshPrograms();
    toast.success("تم حذف البرنامج");
  };

  const doExport = () => {
    if (students.length === 0) {
      toast.error("لا يوجد طلاب");
      return;
    }
    if (programs.length === 0) {
      toast.error("لا توجد برامج");
      return;
    }
    downloadHalaqaProgramsWorkbook(students, halaqaId, halaqaName, calendar, fromDate, toDate);
    setExportOpen(false);
    toast.success("تم تصدير برامج الحلقة");
  };

  if (programs.length === 0 && !canManagePrograms) {
    return (
      <div className="glass-card rounded-2xl p-10 text-center text-muted-foreground">
        <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-50" />
        <p>لم يُنشئ المعلم أي برنامج للحلقة بعد.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-primary flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            برنامج الحلقة
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            مستقل عن الدرجات الرسمية — المجموع والنسبة تجمع كل البرامج معاً
            {readOnly && " — عرض فقط"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!readOnly && (
            <button
              type="button"
              onClick={() => setMode(mode === "fill" ? "setup" : "fill")}
              className={cn(
                "px-3 py-2 rounded-lg text-sm font-bold border",
                mode === "setup"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:bg-secondary",
              )}
            >
              <Settings2 className="w-4 h-4 inline ml-1" />
              {mode === "setup" ? "العودة للتعبئة" : "إعداد البرامج"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            className="px-3 py-2 rounded-lg border border-primary/30 text-primary text-sm font-bold flex items-center gap-1 hover:bg-primary/5"
          >
            <Download className="w-4 h-4" />
            تصدير البرامج
          </button>
        </div>
      </div>

      {mode === "setup" && canManagePrograms && !readOnly ? (
        <ProgramSetupSection
          programs={loadHalaqaProgramsAll(halaqaId).filter((p) => p.active !== false && !isScientificHalaqaProgram(p))}
          onAdd={openNewProgram}
          onEdit={openEditProgram}
          onRemove={removeProgram}
        />
      ) : (
        <ProgramFillSection
          halaqaId={halaqaId}
          programs={programs}
          students={students}
          weekNum={weekNum}
          calendar={calendar}
          selectableWeeks={selectableWeeks}
          grades={grades}
          readOnly={readOnly}
          onWeekChange={onWeekChange}
          onCellChange={setCell}
          workingDayKeys={[...workingDayKeysFromSemester(calendar.semester?.working_days)]}
        />
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {editing && loadHalaqaProgramsAll(halaqaId).some((p) => p.id === editing.id)
                ? "تعديل برنامج"
                : "برنامج جديد"}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4 py-2">
              <div>
                <Label>اسم البرنامج</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="مثال: حضور الدرس، برنامج المراجعة"
                />
              </div>
              <div>
                <Label>طريقة التطبيق</Label>
                <select
                  value={editing.scheduleMode}
                  onChange={(e) =>
                    setEditing({ ...editing, scheduleMode: e.target.value as ProgramScheduleMode })
                  }
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-input border border-border text-sm"
                >
                  {(Object.keys(SCHEDULE_MODE_LABELS) as ProgramScheduleMode[]).map((k) => (
                    <option key={k} value={k}>
                      {SCHEDULE_MODE_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
              {editing.scheduleMode === "weekdays" ? (
                <div>
                  <Label>أيام الأسبوع (يشمل الجمعة والسبت)</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {PROGRAM_DAYS.map((d) => (
                      <label key={d.key} className="flex items-center gap-1 text-sm">
                        <input
                          type="checkbox"
                          checked={editing.weekdays.includes(d.key)}
                          onChange={(e) => {
                            const set = new Set(editing.weekdays);
                            if (e.target.checked) set.add(d.key);
                            else set.delete(d.key);
                            setEditing({ ...editing, weekdays: [...set] });
                          }}
                        />
                        {d.label}
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <Label>عدد المرات في الأسبوع</Label>
                  <Input
                    type="number"
                    min={1}
                    max={7}
                    value={editing.timesPerWeek}
                    onChange={(e) =>
                      setEditing({ ...editing, timesPerWeek: Number(e.target.value) || 1 })
                    }
                  />
                </div>
              )}
              <ProgramLevelsEditor
                levels={editing.levels}
                onChange={(levels) => setEditing({ ...editing, levels })}
              />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={saveProgram}>حفظ البرنامج</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تصدير برامج الحلقة</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label>من تاريخ</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div>
              <Label>إلى تاريخ</Label>
              <Input
                type="date"
                value={toDate}
                max={calendar.operationalDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={doExport}>تصدير Excel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProgramLevelsEditor({
  levels,
  onChange,
}: {
  levels: ProgramLevel[];
  onChange: (levels: ProgramLevel[]) => void;
}) {
  const updateLevel = (index: number, patch: Partial<ProgramLevel>) => {
    onChange(levels.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const addLevel = () => {
    onChange([...levels, { label: "", score: 0 }]);
  };

  const removeLevel = (index: number) => {
    onChange(levels.filter((_, i) => i !== index));
  };

  return (
    <div>
      <Label>مستويات البرنامج ودرجات كل مستوى</Label>
      <p className="text-xs text-muted-foreground mt-1 mb-2">
        حدّد اسم كل مستوى (ممتاز، جيد، ضعيف…) ودرجته — أنت تتحكم بالكامل
      </p>
      <div className="space-y-2">
        {levels.map((level, i) => (
          <div key={i} className="flex gap-2 items-center">
            <Input
              value={level.label}
              onChange={(e) => updateLevel(i, { label: e.target.value })}
              placeholder="اسم المستوى"
              className="flex-1"
            />
            <Input
              type="number"
              min={0}
              value={level.score}
              onChange={(e) => updateLevel(i, { score: Number(e.target.value) || 0 })}
              placeholder="الدرجة"
              className="w-24"
              dir="ltr"
            />
            <button
              type="button"
              onClick={() => removeLevel(i)}
              className="text-destructive p-2 rounded hover:bg-destructive/10 shrink-0"
              aria-label="حذف المستوى"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addLevel}
        className="mt-2 text-sm text-primary font-bold flex items-center gap-1 hover:underline"
      >
        <Plus className="w-4 h-4" />
        إضافة مستوى
      </button>
    </div>
  );
}

function ProgramSetupSection({
  programs,
  onAdd,
  onEdit,
  onRemove,
}: {
  programs: HalaqaProgram[];
  onAdd: () => void;
  onEdit: (p: HalaqaProgram) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="glass-card rounded-2xl p-6 space-y-4">
      <button
        type="button"
        onClick={onAdd}
        className="w-full py-3 rounded-xl border-2 border-dashed border-primary/40 text-primary font-bold flex items-center justify-center gap-2 hover:bg-primary/5"
      >
        <Plus className="w-5 h-5" />
        إضافة برنامج جديد
      </button>
      {programs.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-6">لا توجد برامج — ابدأ بإضافة برنامج</p>
      ) : (
        programs.map((p) => {
          if (isScientificHalaqaProgram(p)) return null;
          const slots = programSlots(p);
          return (
            <div key={p.id} className="rounded-xl border border-border p-4 bg-secondary/20">
              <div className="flex justify-between items-start gap-2 mb-2">
                <div>
                  <div className="font-bold">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {SCHEDULE_MODE_LABELS[p.scheduleMode]} · {slots.map((s) => s.label).join("، ") || "—"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    المستويات: {p.levels.map((l) => `${l.label} (${l.score})`).join(" · ")}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => onEdit(p)}
                    className="text-xs px-2 py-1 rounded border border-border hover:bg-secondary"
                  >
                    تعديل
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(p.id)}
                    className="text-destructive p-1.5 rounded hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}

type CombinedTotals = {
  earned: number;
  maxPossible: number;
  percent: number;
  hasData: boolean;
  hasPercent: boolean;
  sciTotals: ScientificWeekTotals | null;
  programBreakdown: { program: HalaqaProgram; totals: ProgramWeekTotals }[];
};

function buildCombinedTotals(
  standardPrograms: HalaqaProgram[],
  grades: ReturnType<typeof loadProgramGrades>,
  studentId: string,
  weekNums: number[],
  sciData: ReturnType<typeof loadScientificData>,
  sciFields: ScientificGradeField[],
  workingDayKeys: string[],
  sciConfig: ReturnType<typeof loadScientificConfig>,
  scientificProgram: HalaqaProgram | null,
): CombinedTotals {
  const stdTotals =
    weekNums.length === 1
      ? studentAllProgramsWeekTotals(standardPrograms, grades, studentId, weekNums[0]!)
      : studentAllProgramsPeriodTotals(standardPrograms, grades, studentId, weekNums);

  const sciTotals =
    scientificProgram && sciFields.length > 0
      ? weekNums.length === 1
        ? studentScientificWeekTotals(sciData, studentId, weekNums[0]!, sciFields, workingDayKeys)
        : studentScientificPeriodTotals(sciData, studentId, weekNums, sciFields, workingDayKeys)
      : null;

  const sciMax =
    sciFields.length > 0 ? scientificPeriodMaxPossible(sciConfig, weekNums, workingDayKeys) : 0;
  const sciEarned = sciTotals?.total ?? 0;
  const earned = stdTotals.earned + sciEarned;
  const maxPossible = stdTotals.maxPossible + sciMax;

  return {
    earned,
    maxPossible,
    percent: maxPossible > 0 ? Math.round((earned / maxPossible) * 100) : 0,
    hasData: stdTotals.filledSlots > 0 || sciEarned > 0,
    hasPercent: maxPossible > 0,
    sciTotals,
    programBreakdown: standardPrograms.map((p) => ({
      program: p,
      totals: studentSingleProgramPeriodTotals(p, grades, studentId, weekNums),
    })),
  };
}

function ProgramFillSection({
  halaqaId,
  programs,
  students,
  weekNum,
  calendar,
  selectableWeeks,
  grades,
  readOnly,
  onWeekChange,
  onCellChange,
  workingDayKeys,
}: {
  halaqaId: number;
  programs: HalaqaProgram[];
  students: ReturnType<typeof loadStudents>;
  weekNum: number;
  calendar: AcademicCalendar;
  selectableWeeks: ReturnType<typeof getSelectableWeeks>;
  grades: ReturnType<typeof loadProgramGrades>;
  readOnly: boolean;
  onWeekChange: (n: number) => void;
  onCellChange: (studentId: string, programId: string, slotKey: string, value: string) => void;
  workingDayKeys: string[];
}) {
  const standardPrograms = useMemo(() => filterStandardPrograms(programs), [programs]);
  const scientificProgram = useMemo(() => findScientificProgram(programs), [programs]);
  const sciFields = useMemo((): ScientificGradeField[] => {
    if (scientificProgram?.scientificFields?.length) {
      return scientificProgram.scientificFields;
    }
    return enabledScientificFields(loadScientificConfig(halaqaId).fields);
  }, [scientificProgram, halaqaId]);
  const sciConfig = useMemo(() => loadScientificConfig(halaqaId), [halaqaId]);
  const sciData = loadScientificData(halaqaId);

  if (programs.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center text-muted-foreground">
        <p>لا توجد برامج — انتقل إلى «إعداد البرامج» لإنشاء برنامج</p>
      </div>
    );
  }

  const formatTotal = (n: number) => (n > 0 ? String(n) : "—");

  const cumulativeWeekNums = useMemo(
    () => selectableWeeks.filter((w) => w.week_number <= weekNum).map((w) => w.week_number),
    [selectableWeeks, weekNum],
  );

  const showScientific = !!(scientificProgram && sciFields.length > 0);
  const sciColSpan = showScientific ? sciFields.length + 1 : 0;

  return (
    <div className="glass-card rounded-2xl p-4 overflow-x-auto">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={String(weekNum)} onValueChange={(v) => onWeekChange(Number(v))}>
          <SelectTrigger className="w-[min(100%,320px)] font-bold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {selectableWeeks.map((wk) => (
              <SelectItem key={wk.week_number} value={String(wk.week_number)}>
                {formatWeekOptionLabel(wk, wk.week_number === calendar.currentWeekNumber)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          إدخال درجات الأسبوع {weekNum} · مجموع أسبوعي + تراكمي من الأسبوع 1
        </p>
      </div>

      {students.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground text-sm">لا يوجد طلاب</p>
      ) : (
        <table className="w-full text-sm border-collapse min-w-[640px]">
          <thead>
            <tr className="bg-secondary/50">
              <th className="p-2 text-right sticky right-0 bg-secondary z-10 min-w-[120px]">الطالب</th>
              {standardPrograms.map((p) => {
                const slots = programSlots(p);
                return (
                  <th
                    key={p.id}
                    colSpan={slots.length}
                    className="p-2 border-r border-border text-primary text-center"
                  >
                    {p.name}
                  </th>
                );
              })}
              {showScientific && (
                <>
                  <th
                    colSpan={sciColSpan}
                    className="p-2 border-r border-border text-center bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 font-bold"
                  >
                    {scientificProgram!.name} — أسبوع {weekNum}
                  </th>
                  <th
                    colSpan={sciColSpan}
                    className="p-2 border-r border-border text-center bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-bold"
                  >
                    {scientificProgram!.name} — تراكمي
                  </th>
                </>
              )}
              <th colSpan={2} className="p-2 border-r border-border text-sky-800 dark:text-sky-300 text-center bg-sky-500/10 font-bold">
                إجمالي أسبوعي
              </th>
              <th colSpan={2} className="p-2 border-r border-border text-primary text-center bg-primary/10 font-bold">
                إجمالي تراكمي
              </th>
            </tr>
            <tr className="bg-secondary/30 text-xs text-muted-foreground">
              <th className="sticky right-0 bg-secondary" />
              {standardPrograms.flatMap((p) => {
                const slots = programSlots(p);
                return slots.map((sl) => (
                  <th key={`${p.id}-${sl.key}`} className="p-1 border-r border-border min-w-[72px]">
                    {sl.label}
                  </th>
                ));
              })}
              {showScientific && (
                <>
                  {sciFields.map((field) => (
                    <th
                      key={`sci-w-${field}`}
                      className="p-1 border-r border-border min-w-[64px] text-emerald-800 dark:text-emerald-400 font-bold"
                    >
                      {SCIENTIFIC_FIELD_LABELS[field]}
                    </th>
                  ))}
                  <th className="p-1 border-r border-border min-w-[56px] text-emerald-800 dark:text-emerald-400 font-bold">
                    الكلي
                  </th>
                  {sciFields.map((field) => (
                    <th
                      key={`sci-c-${field}`}
                      className="p-1 border-r border-border min-w-[64px] text-emerald-700 dark:text-emerald-400 font-bold"
                    >
                      {SCIENTIFIC_TOTAL_LABELS[field]}
                    </th>
                  ))}
                  <th className="p-1 border-r border-border min-w-[56px] text-emerald-700 dark:text-emerald-400 font-bold">
                    الكلي
                  </th>
                </>
              )}
              <th className="p-1 border-r border-border min-w-[56px] text-sky-800 dark:text-sky-300 font-bold">رقم</th>
              <th className="p-1 border-r border-border min-w-[48px] text-sky-800 dark:text-sky-300 font-bold">%</th>
              <th className="p-1 border-r border-border min-w-[56px] text-primary font-bold">رقم</th>
              <th className="p-1 border-r border-border min-w-[48px] text-primary font-bold">%</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const weekly = buildCombinedTotals(
                standardPrograms,
                grades,
                s.id,
                [weekNum],
                sciData,
                sciFields,
                workingDayKeys,
                sciConfig,
                scientificProgram,
              );
              const cumulative = buildCombinedTotals(
                standardPrograms,
                grades,
                s.id,
                cumulativeWeekNums,
                sciData,
                sciFields,
                workingDayKeys,
                sciConfig,
                scientificProgram,
              );
              return (
                <tr key={s.id} className="border-b border-border/50 hover:bg-accent/20">
                  <td className="p-2 sticky right-0 bg-card font-medium">{s.name}</td>
                  {standardPrograms.flatMap((p) => {
                    const slots = programSlots(p);
                    const vals = grades[s.id]?.[weekNum]?.[p.id];
                    return slots.map((sl) => (
                      <td key={`${s.id}-${p.id}-${sl.key}`} className="p-1 border-r border-border/30">
                        <CustomFieldSelect
                          value={vals?.[sl.key] ?? ""}
                          options={programLevelLabels(p)}
                          disabled={readOnly}
                          onChange={(v) => onCellChange(s.id, p.id, sl.key, v)}
                        />
                      </td>
                    ));
                  })}
                  {showScientific && weekly.sciTotals && cumulative.sciTotals && (
                    <>
                      {sciFields.map((field) => (
                        <td
                          key={`${s.id}-sci-w-${field}`}
                          className="p-1 border-r border-border/30 text-center text-xs font-bold bg-emerald-500/10"
                        >
                          {formatTotal(weekly.sciTotals![field])}
                        </td>
                      ))}
                      <td className="p-1 border-r border-border/30 text-center text-xs font-bold bg-emerald-500/15">
                        {formatTotal(weekly.sciTotals.total)}
                      </td>
                      {sciFields.map((field) => (
                        <td
                          key={`${s.id}-sci-c-${field}`}
                          className="p-1 border-r border-border/30 text-center text-xs font-bold bg-emerald-500/5"
                        >
                          {formatTotal(cumulative.sciTotals![field])}
                        </td>
                      ))}
                      <td className="p-1 border-r border-border/30 text-center text-xs font-bold bg-emerald-500/10">
                        {formatTotal(cumulative.sciTotals.total)}
                      </td>
                    </>
                  )}
                  <td className="p-1 border-r border-border/30 text-center text-xs font-bold text-sky-800 dark:text-sky-300 bg-sky-500/5">
                    {weekly.hasData ? weekly.earned : "—"}
                  </td>
                  <td className="p-1 border-r border-border/30 text-center bg-sky-500/5">
                    <ProgramsTotalsBreakdown
                      percent={weekly.percent}
                      filled={weekly.hasData}
                      percentAvailable={weekly.hasPercent}
                      programs={weekly.programBreakdown}
                      scientific={
                        scientificProgram && weekly.sciTotals
                          ? { name: scientificProgram.name, earned: weekly.sciTotals.total }
                          : null
                      }
                      title="البرامج — تفصيل أسبوعي"
                      hint={`الأسبوع ${weekNum} فقط`}
                    />
                  </td>
                  <td className="p-1 border-r border-border/30 text-center text-xs font-bold text-primary bg-primary/5">
                    {cumulative.hasData ? cumulative.earned : "—"}
                  </td>
                  <td className="p-1 border-r border-border/30 text-center bg-primary/5">
                    <ProgramsTotalsBreakdown
                      percent={cumulative.percent}
                      filled={cumulative.hasData}
                      percentAvailable={cumulative.hasPercent}
                      programs={cumulative.programBreakdown}
                      scientific={
                        scientificProgram && cumulative.sciTotals
                          ? { name: scientificProgram.name, earned: cumulative.sciTotals.total }
                          : null
                      }
                      title="البرامج — تفصيل تراكمي"
                      hint="من الأسبوع 1 حتى الأسبوع المحدد"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ProgramsTotalsBreakdown({
  percent,
  filled,
  percentAvailable = true,
  programs,
  scientific,
  title,
  hint,
}: {
  percent: number;
  filled: boolean;
  percentAvailable?: boolean;
  programs: { program: HalaqaProgram; totals: ProgramWeekTotals }[];
  scientific: { name: string; earned: number } | null;
  title: string;
  hint: string;
}) {
  const displayPercent = filled && percentAvailable ? `${percent}%` : "—";
  const hasBreakdown = programs.length > 0 || scientific !== null;

  if (!hasBreakdown) {
    return <span className="text-xs font-bold text-primary">{displayPercent}</span>;
  }

  return (
    <div className="inline-flex items-center justify-center gap-0.5 min-w-0">
      <span className="text-xs font-bold text-primary">{displayPercent}</span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex shrink-0 items-center justify-center w-5 h-5 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            aria-label={title}
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="left"
          align="center"
          className="w-64 p-0 overflow-hidden"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="px-3 py-2 border-b border-border bg-primary/5">
            <p className="text-xs font-bold text-primary">{title}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>
          </div>
          <ul className="p-2 space-y-1">
            {programs.map(({ program, totals }) => (
              <li
                key={program.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50"
              >
                <div className="flex-1 min-w-0 text-right">
                  <div className="text-xs font-medium text-foreground leading-tight truncate">{program.name}</div>
                  {totals.filledSlots > 0 && (
                    <div className="text-[9px] text-muted-foreground leading-tight mt-0.5">
                      {totals.earned} من {totals.maxPossible}
                    </div>
                  )}
                </div>
                <span className="text-sm font-bold shrink-0 text-primary">
                  {totals.filledSlots > 0 ? `${totals.percent}%` : "—"}
                </span>
              </li>
            ))}
            {scientific && (
              <li className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50 bg-emerald-500/5">
                <div className="flex-1 min-w-0 text-right">
                  <div className="text-xs font-medium text-emerald-800 dark:text-emerald-300 leading-tight truncate">
                    {scientific.name}
                  </div>
                  <div className="text-[9px] text-muted-foreground leading-tight mt-0.5">مجموع نقاط</div>
                </div>
                <span className="text-sm font-bold shrink-0 text-emerald-700 dark:text-emerald-400">
                  {scientific.earned > 0 ? scientific.earned : "—"}
                </span>
              </li>
            )}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
