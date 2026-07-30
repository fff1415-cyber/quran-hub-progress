import { useMemo, useState } from "react";
import { loadStudents, DAYS } from "@/lib/mock-data";
import type { AcademicCalendar } from "@/lib/academic-context";
import {
  formatWeekOptionLabel,
  getSelectableWeeks,
  workingDayKeysFromSemester,
} from "@/lib/academic-context";
import {
  formatProgramOptionsInput,
  loadHalaqaPrograms,
  loadHalaqaProgramsAll,
  loadProgramGrades,
  newProgramId,
  parseProgramOptionsInput,
  programSlots,
  saveHalaqaPrograms,
  saveProgramGrades,
  SCHEDULE_MODE_LABELS,
  studentProgramWeekScore,
  type HalaqaProgram,
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
import { BookOpen, Download, Loader2, Plus, Settings2, Trash2 } from "lucide-react";
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

  const workingKeys = useMemo(
    () => workingDayKeysFromSemester(calendar.semester?.working_days),
    [calendar.semester?.working_days],
  );

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
    setEditing({
      id: newProgramId(),
      name: "",
      scheduleMode: "weekdays",
      weekdays: [...workingKeys],
      timesPerWeek: 2,
      options: ["ممتاز", "جيد", "ضعيف"],
      maxScore: 100,
      sortOrder: programs.length,
      active: true,
    });
    setEditorOpen(true);
  };

  const openEditProgram = (p: HalaqaProgram) => {
    setEditing({ ...p });
    setEditorOpen(true);
  };

  const saveProgram = () => {
    if (!editing) return;
    const name = editing.name.trim();
    const options = editing.options.filter(Boolean);
    if (!name) {
      toast.error("اسم البرنامج مطلوب");
      return;
    }
    if (options.length === 0) {
      toast.error("أضف خياراً واحداً على الأقل للقائمة");
      return;
    }
    if (editing.scheduleMode === "weekdays" && editing.weekdays.length === 0) {
      toast.error("اختر يوماً واحداً على الأقل");
      return;
    }
    const all = loadHalaqaProgramsAll(halaqaId);
    const exists = all.some((p) => p.id === editing.id);
    const next = exists
      ? all.map((p) => (p.id === editing.id ? { ...editing, name, options } : p))
      : [...all, { ...editing, name, options }];
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
            مستقل عن الدرجات الرسمية (حضور، حفظ، ربط، مراجعة)
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
          workingKeys={workingKeys}
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
          workingKeys={workingKeys}
          grades={grades}
          readOnly={readOnly}
          onWeekChange={onWeekChange}
          onCellChange={setCell}
        />
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing && loadHalaqaProgramsAll(halaqaId).some((p) => p.id === editing.id) ? "تعديل برنامج" : "برنامج جديد"}</DialogTitle>
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
                  <Label>أيام الأسبوع</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {DAYS.filter((d) => workingKeys.has(d.key)).map((d) => (
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
                    max={5}
                    value={editing.timesPerWeek}
                    onChange={(e) =>
                      setEditing({ ...editing, timesPerWeek: Number(e.target.value) || 1 })
                    }
                  />
                </div>
              )}
              <div>
                <Label>خيارات القائمة (افصل بفاصلة)</Label>
                <Input
                  value={formatProgramOptionsInput(editing.options)}
                  onChange={(e) =>
                    setEditing({ ...editing, options: parseProgramOptionsInput(e.target.value) })
                  }
                  placeholder="ممتاز، جيد، ضعيف"
                />
              </div>
              <div>
                <Label>الدرجة الكلية للبرنامج (للتقرير فقط)</Label>
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={editing.maxScore}
                  onChange={(e) =>
                    setEditing({ ...editing, maxScore: Number(e.target.value) || 100 })
                  }
                />
              </div>
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
              <Input type="date" value={toDate} max={calendar.operationalDate} onChange={(e) => setToDate(e.target.value)} />
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

function ProgramSetupSection({
  programs,
  workingKeys,
  onAdd,
  onEdit,
  onRemove,
}: {
  programs: HalaqaProgram[];
  workingKeys: Set<string>;
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
          const slots = programSlots(p, workingKeys);
          return (
            <div key={p.id} className="rounded-xl border border-border p-4 bg-secondary/20">
              <div className="flex justify-between items-start gap-2 mb-2">
                <div>
                  <div className="font-bold">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {SCHEDULE_MODE_LABELS[p.scheduleMode]} · {slots.map((s) => s.label).join("، ") || "—"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    الخيارات: {p.options.join(" · ")}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button type="button" onClick={() => onEdit(p)} className="text-xs px-2 py-1 rounded border border-border hover:bg-secondary">
                    تعديل
                  </button>
                  <button type="button" onClick={() => onRemove(p.id)} className="text-destructive p-1.5 rounded hover:bg-destructive/10">
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
  workingKeys,
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
  workingKeys: Set<string>;
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
                const slots = programSlots(p, workingKeys);
                return (
                  <th key={p.id} colSpan={slots.length + 1} className="p-2 border-r border-border text-primary text-center">
                    {p.name}
                  </th>
                );
              })}
            </tr>
            <tr className="bg-secondary/30 text-xs text-muted-foreground">
              <th className="sticky right-0 bg-secondary" />
              {programs.flatMap((p) => {
                const slots = programSlots(p, workingKeys);
                return [
                  ...slots.map((sl) => (
                    <th key={`${p.id}-${sl.key}`} className="p-1 border-r border-border min-w-[72px]">
                      {sl.label}
                    </th>
                  )),
                  <th key={`${p.id}-pct`} className="p-1 border-r border-border min-w-[56px] text-primary">
                    %
                  </th>,
                ];
              })}
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} className="border-b border-border/50 hover:bg-accent/20">
                <td className="p-2 sticky right-0 bg-card font-medium">{s.name}</td>
                {programs.flatMap((p) => {
                  const slots = programSlots(p, workingKeys);
                  const vals = grades[s.id]?.[weekNum]?.[p.id];
                  const pct = studentProgramWeekScore(p, slots, vals);
                  return [
                    ...slots.map((sl) => (
                      <td key={`${s.id}-${p.id}-${sl.key}`} className="p-1 border-r border-border/30">
                        <CustomFieldSelect
                          value={vals?.[sl.key] ?? ""}
                          options={p.options}
                          disabled={readOnly}
                          onChange={(v) => onCellChange(s.id, p.id, sl.key, v)}
                        />
                      </td>
                    )),
                    <td key={`${s.id}-${p.id}-pct`} className="p-1 border-r border-border/30 text-center text-xs font-bold text-primary">
                      {pct > 0 ? `${pct}%` : "—"}
                    </td>,
                  ];
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
