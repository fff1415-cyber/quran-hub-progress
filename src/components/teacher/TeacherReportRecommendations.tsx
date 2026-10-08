import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { loadStudents, loadHalaqat, loadGrades } from "@/lib/mock-data";
import { getReportNotes, saveReportNote } from "@/lib/academic-report-api";
import { fetchActiveCalendar, type AcademicCalendar } from "@/lib/academic-context";
import { buildAcademicReport, type AcademicReport } from "@/lib/academic-reports";
import { reportCards } from "@/lib/academic-report-export";

export function TeacherReportRecommendations({ halaqaId }: { halaqaId: number }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [id, setId] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [calendar, setCalendar] = useState<AcademicCalendar | null>(null);
  const students = loadStudents().filter((s) => s.halaqaId === halaqaId);
  useEffect(() => {
    void getReportNotes()
      .then(setNotes)
      .catch(() => undefined);
  }, [halaqaId]);
  useEffect(() => {
    void fetchActiveCalendar(true)
      .then(setCalendar)
      .catch(() => undefined);
  }, [halaqaId]);
  let report: AcademicReport | null = null;
  if (id && calendar?.semester) {
    const current = calendar.weeks.find((week) => week.week_number === calendar.currentWeekNumber);
    try {
      report = buildAcademicReport(
        calendar,
        loadHalaqat(),
        loadStudents(),
        loadGrades(),
        {
          scope: "student",
          from:
            current?.start_date && current.start_date > calendar.semester.start_date
              ? current.start_date
              : calendar.semester.start_date,
          to: calendar.operationalDate,
          studentId: id,
          named: true,
          focus: "all",
        },
        notes,
      );
    } catch {
      /* No working day in this week yet. */
    }
  }
  const select = (studentId: string) => {
    setId(studentId);
    setValue(notes[studentId] ?? "");
  };
  const save = async () => {
    if (!id) return;
    setBusy(true);
    try {
      await saveReportNote(id, value);
      setNotes((old) => ({ ...old, [id]: value }));
      toast.success("حُفظت توصية الطالب للتقرير");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر حفظ التوصية");
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="glass-card rounded-xl p-4 mb-4" dir="rtl">
      <summary className="cursor-pointer font-bold">توصيات تقارير الطلاب (اختيارية)</summary>
      <div className="mt-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          تظهر توصيتك في تقرير الطالب بعد مراجعة المدير واعتماده.
        </p>
        <select
          value={id}
          onChange={(e) => select(e.target.value)}
          className="w-full rounded-md border bg-background p-2"
          aria-label="اختر الطالب"
        >
          <option value="">اختر الطالب</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {id && (
          <>
            {report && (
              <div className="rounded-xl border p-3 space-y-2">
                <p className="text-sm font-bold">معاينة أداء الطالب لهذا الأسبوع</p>
                <div className="grid grid-cols-2 gap-2">
                  {reportCards(report.totals, "all", report.halaqat[0]?.isTalqeen ?? false).map(
                    (card) => (
                      <div key={card.label} className="rounded-lg bg-secondary/50 p-2 text-sm">
                        {card.label}: <strong>{card.value}</strong>
                      </div>
                    ),
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  التقرير الرسمي للفترة المختارة يعدّه المدير ويعتمده.
                </p>
              </div>
            )}
            <Textarea
              maxLength={500}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="توصية مختصرة لولي الأمر"
            />
            <Button disabled={busy} onClick={() => void save()}>
              حفظ التوصية
            </Button>
          </>
        )}
      </div>
    </details>
  );
}
