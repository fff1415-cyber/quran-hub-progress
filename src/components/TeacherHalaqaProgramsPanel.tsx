import { useMemo, useState } from "react";
import { loadStudents } from "@/lib/mock-data";
import type { AcademicCalendar } from "@/lib/academic-context";
import {
  formatWeekOptionLabel,
  getSelectableWeeks,
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
  studentAllProgramsWeekTotals,
  type HalaqaProgram,
  type ProgramLevel,
  type ProgramScheduleMode,
} from "@/lib/halaqa-programs";
import { downloadHalaqaProgramsWorkbook } from "@/lib/halaqa-programs-export";
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
import { BookOpen, Download, Plus, Settings2, Trash2 } from "lucide-react";
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
          programs={loadHalaqaProgramsAll(halaqaId).filter((p) => p.active !== false)}
          onAdd={openNewProgram}
          onEdit={openEditProgram}
          onRemove={removeProgram}
        />
      ) : (
        <ProgramFillSection
          programs={programs}
          students={students}
          weekNum={weekNum}
          calendar={calendar}
          selectableWeeks={selectableWeeks}
          grades={grades}
          readOnly={readOnly}
          onWeekChange={onWeekChange}
          onCellChange={setCell}
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

function ProgramFillSection({
  programs,
  students,
  weekNum,
  calendar,
  selectableWeeks,
  grades,
  readOnly,
  onWeekChange,
  onCellChange,
}: {
  programs: HalaqaProgram[];
  students: ReturnType<typeof loadStudents>;
  weekNum: number;
  calendar: AcademicCalendar;
  selectableWeeks: ReturnType<typeof getSelectableWeeks>;
  grades: ReturnType<typeof loadProgramGrades>;
  readOnly: boolean;
  onWeekChange: (n: number) => void;
  onCellChange: (studentId: string, programId: string, slotKey: string, value: string) => void;
}) {
  if (programs.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center text-muted-foreground">
        <p>لا توجد برامج — انتقل إلى «إعداد البرامج» لإنشاء برنامج</p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-4 overflow-x-auto">
      <div className="mb-4">
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
      </div>

      {students.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground text-sm">لا يوجد طلاب</p>
      ) : (
        <table className="w-full text-sm border-collapse min-w-[640px]">
          <thead>
            <tr className="bg-secondary/50">
              <th className="p-2 text-right sticky right-0 bg-secondary z-10 min-w-[120px]">الطالب</th>
              {programs.map((p) => {
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
              <th colSpan={2} className="p-2 border-r border-border text-primary text-center bg-primary/10">
                المجموع (كل البرامج)
              </th>
            </tr>
            <tr className="bg-secondary/30 text-xs text-muted-foreground">
              <th className="sticky right-0 bg-secondary" />
              {programs.flatMap((p) => {
                const slots = programSlots(p);
                return slots.map((sl) => (
                  <th key={`${p.id}-${sl.key}`} className="p-1 border-r border-border min-w-[72px]">
                    {sl.label}
                  </th>
                ));
              })}
              <th className="p-1 border-r border-border min-w-[64px] text-primary font-bold">رقم</th>
              <th className="p-1 border-r border-border min-w-[56px] text-primary font-bold">%</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const totals = studentAllProgramsWeekTotals(programs, grades, s.id, weekNum);
              return (
                <tr key={s.id} className="border-b border-border/50 hover:bg-accent/20">
                  <td className="p-2 sticky right-0 bg-card font-medium">{s.name}</td>
                  {programs.flatMap((p) => {
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
                  <td className="p-1 border-r border-border/30 text-center text-xs font-bold text-primary bg-primary/5">
                    {totals.filledSlots > 0 ? totals.earned : "—"}
                  </td>
                  <td className="p-1 border-r border-border/30 text-center text-xs font-bold text-primary bg-primary/5">
                    {totals.filledSlots > 0 ? `${totals.percent}%` : "—"}
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
