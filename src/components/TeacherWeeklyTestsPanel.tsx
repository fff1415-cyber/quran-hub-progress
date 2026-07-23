import { useMemo, useState } from "react";
import {
  loadStudents,
  type Student,
} from "@/lib/mock-data";
import {
  getSelectableWeeks,
  formatWeekOptionLabel,
  type AcademicCalendar,
} from "@/lib/academic-context";
import {
  loadWeeklyTests,
  saveWeeklyTests,
  loadWeeklyTestsSettings,
  getStudentWeeklyTests,
  scoreWeeklyTests,
  cumulativeWeeklyTestsPercent,
  halaqaWeeklyTestsAverage,
  weekTestsCompletion,
  formatWeeklyTestPercent,
  type WeeklyTestResult,
  type StudentWeeklyTests,
  type WeeklyTestsStore,
} from "@/lib/weekly-tests";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface TeacherWeeklyTestsPanelProps {
  halaqaId: number;
  halaqaName: string;
  isTalqeen: boolean;
  calendar: AcademicCalendar;
  weekNum: number;
  onWeekChange: (n: number) => void;
  viewerRole: "teacher" | "assistant";
}

function TestSelect({
  value,
  onChange,
  disabled,
}: {
  value: WeeklyTestResult;
  onChange: (v: WeeklyTestResult) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as WeeklyTestResult)}
      className={cn(
        "w-full min-w-[72px] bg-input border border-border rounded px-1 py-1.5 text-xs font-bold text-center",
        value === "pass" && "text-success border-success/40",
        value === "fail" && "text-destructive border-destructive/40",
      )}
    >
      <option value="">—</option>
      <option value="pass">✓</option>
      <option value="fail">✗</option>
    </select>
  );
}

export function TeacherWeeklyTestsPanel({
  halaqaId,
  halaqaName,
  isTalqeen,
  calendar,
  weekNum,
  onWeekChange,
  viewerRole,
}: TeacherWeeklyTestsPanelProps) {
  const settings = useMemo(() => loadWeeklyTestsSettings(), []);
  const allStudents = useMemo(
    () => loadStudents().filter((s) => s.halaqaId === halaqaId),
    [halaqaId],
  );
  const students = viewerRole === "assistant"
    ? allStudents.filter((s) => s.assignedTo !== "teacher")
    : allStudents.filter((s) => s.assignedTo !== "assistant");

  const [store, setStore] = useState<WeeklyTestsStore>(() => loadWeeklyTests());
  const selectableWeeks = useMemo(() => getSelectableWeeks(calendar), [calendar]);

  const halaqaWeekPct = useMemo(
    () => halaqaWeeklyTestsAverage(students, store, weekNum, settings, "week"),
    [students, store, weekNum, settings],
  );
  const halaqaCumulativePct = useMemo(
    () => halaqaWeeklyTestsAverage(students, store, weekNum, settings, "cumulative"),
    [students, store, weekNum, settings],
  );

  const totalSlots = useMemo(() => {
    let mur = 0;
    let rab = 0;
    students.forEach((s) => {
      const row = getStudentWeeklyTests(store, s.id, weekNum, settings);
      const c = weekTestsCompletion(row, settings);
      mur += c.murajaDone;
      rab += c.rabtDone;
    });
    const murMax = students.length * settings.muraja_slots;
    const rabMax = students.length * settings.rabt_slots;
    return { mur, murMax, rab, rabMax };
  }, [students, store, weekNum, settings]);

  const updateTest = (
    studentId: string,
    patch: Partial<StudentWeeklyTests> | ((row: StudentWeeklyTests) => StudentWeeklyTests),
  ) => {
    const next: WeeklyTestsStore = { ...store };
    if (!next[studentId]) next[studentId] = {};
    const cur = getStudentWeeklyTests(store, studentId, weekNum, settings);
    const updated = typeof patch === "function" ? patch(cur) : { ...cur, ...patch };
    next[studentId] = { ...next[studentId], [weekNum]: updated };
    setStore(next);
    saveWeeklyTests(next);
  };

  const setMuraja = (studentId: string, index: number, value: WeeklyTestResult) => {
    updateTest(studentId, (row) => {
      const muraja = [...row.muraja] as StudentWeeklyTests["muraja"];
      muraja[index] = value;
      return { ...row, muraja };
    });
  };

  const setRabt = (studentId: string, value: WeeklyTestResult) => {
    updateTest(studentId, { rabt: value });
  };

  if (!settings.enabled) {
    return (
      <div className="glass-card rounded-2xl p-10 text-center text-muted-foreground">
        <ClipboardCheck className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="font-medium">الاختبارات الأسبوعية غير مفعّلة</p>
        <p className="text-xs mt-1">يُفعّلها المدير من لوحة التحكم</p>
      </div>
    );
  }

  if (isTalqeen) {
    return (
      <div className="glass-card rounded-2xl p-10 text-center text-muted-foreground">
        <p>الاختبارات الأسبوعية (مراجعة + ربط) غير متاحة لحلقات التلقين</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
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
          <span className="text-xs text-muted-foreground">
            اكتمال: مراجعة {totalSlots.mur}/{totalSlots.murMax} · ربط {totalSlots.rab}/{totalSlots.rabMax}
          </span>
        </div>
        <div className="text-left text-sm">
          <div><span className="text-muted-foreground">درجة الأسبوع:</span> <strong className="text-primary">{formatWeeklyTestPercent(halaqaWeekPct)}</strong></div>
          <div><span className="text-muted-foreground">تراكم {halaqaName}:</span> <strong className="gold-text">{formatWeeklyTestPercent(halaqaCumulativePct)}</strong></div>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-4 overflow-x-auto">
        {students.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-sm">لا يوجد طلاب</p>
        ) : (
          <table className="w-full text-sm border-collapse min-w-[640px]">
            <thead>
              <tr className="bg-secondary/50">
                <th className="p-2 text-right sticky right-0 bg-secondary z-10 min-w-[120px]">الطالب</th>
                <th className="p-2 text-center border-r border-border">مراجعة 1</th>
                <th className="p-2 text-center border-r border-border">مراجعة 2</th>
                <th className="p-2 text-center border-r border-border">مراجعة 3</th>
                <th className="p-2 text-center border-r border-border">ربط كامل</th>
                <th className="p-2 text-center border-r border-border text-muted-foreground">أسبوع</th>
                <th className="p-2 text-center text-primary font-bold">تراكم</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <StudentWeeklyTestsRow
                  key={s.id}
                  student={s}
                  weekNum={weekNum}
                  store={store}
                  settings={settings}
                  onMuraja={setMuraja}
                  onRabt={setRabt}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground px-1">
        مسار مستقل — لا يؤثر على النسبة الكلية أو تقدم الخطة · الحفظ تلقائي
      </p>
    </div>
  );
}

function StudentWeeklyTestsRow({
  student,
  weekNum,
  store,
  settings,
  onMuraja,
  onRabt,
}: {
  student: Student;
  weekNum: number;
  store: WeeklyTestsStore;
  settings: ReturnType<typeof loadWeeklyTestsSettings>;
  onMuraja: (id: string, i: number, v: WeeklyTestResult) => void;
  onRabt: (id: string, v: WeeklyTestResult) => void;
}) {
  const row = getStudentWeeklyTests(store, student.id, weekNum, settings);
  const weekScore = scoreWeeklyTests(row, settings);
  const cumulative = cumulativeWeeklyTestsPercent(store, student.id, weekNum, settings);

  return (
    <tr className="border-b border-border/50 hover:bg-accent/20">
      <td className="p-2 sticky right-0 bg-card font-medium">{student.name}</td>
      {[0, 1, 2].slice(0, settings.muraja_slots).map((i) => (
        <td key={i} className="p-1 border-r border-border/30">
          <TestSelect
            value={row.muraja[i] ?? ""}
            onChange={(v) => onMuraja(student.id, i, v)}
          />
        </td>
      ))}
      <td className="p-1 border-r border-border/30">
        {settings.rabt_slots > 0 ? (
          <TestSelect value={row.rabt} onChange={(v) => onRabt(student.id, v)} />
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </td>
      <td className="p-2 text-center font-bold border-r border-border/30 text-muted-foreground">
        {formatWeeklyTestPercent(weekScore.percent)}
      </td>
      <td className="p-2 text-center font-bold text-primary">
        {formatWeeklyTestPercent(cumulative)}
      </td>
    </tr>
  );
}
