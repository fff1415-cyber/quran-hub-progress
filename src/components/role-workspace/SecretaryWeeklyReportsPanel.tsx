import { useEffect, useMemo, useState } from "react";
import { fetchActiveCalendar, getSelectableWeeks, type AcademicCalendar } from "@/lib/academic-context";
import { getToken, syncFromCloud } from "@/lib/cloud-sync";
import { loadGrades, loadHalaqat, loadStudents } from "@/lib/mock-data";
import { secureListAppState, secureSetAppState } from "@/lib/secure-data.functions";
import {
  buildWeeklyReport, isWeeklyReportSnapshot, WEEKLY_REPORT_PREFIX,
  weekHasGrades, weekIsComplete, weeklyReportKey, type WeeklyReportSnapshot,
} from "@/lib/weekly-report-history";
import { formatOverallPercent } from "@/lib/semester-grading";
import { weekLabel } from "@/lib/arabic-numbers";
import { Loader2, Trophy } from "lucide-react";

export function SecretaryWeeklyReportsPanel() {
  const [calendar, setCalendar] = useState<AcademicCalendar | null>(null);
  const [archive, setArchive] = useState<WeeklyReportSnapshot[]>([]);
  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await syncFromCloud({ force: true });
        const cal = await fetchActiveCalendar(true);
        const token = getToken();
        if (!token) throw new Error("الجلسة غير متاحة");
        const rows = await secureListAppState({ data: { token } });
        const snapshots = new Map(rows
          .filter((row) => row.key.startsWith(WEEKLY_REPORT_PREFIX) && isWeeklyReportSnapshot(row.value))
          .map((row) => [row.key, row.value as WeeklyReportSnapshot]));
        const students = loadStudents();
        const halaqat = loadHalaqat();
        const grades = loadGrades();
        const writes: Promise<unknown>[] = [];
        for (const week of getSelectableWeeks(cal)) {
          const num = week.week_number;
          // Do not overwrite an earlier snapshot with an empty cache after a semester reset.
          if (!weekIsComplete(cal, num) || !weekHasGrades(grades, num) || !students.length || !halaqat.length) continue;
          const report = buildWeeklyReport(cal, num, halaqat, students, grades);
          if (!report) continue;
          const key = weeklyReportKey(report.semesterId, num);
          snapshots.set(key, report);
          writes.push(secureSetAppState({ data: { token, key, value: report } }));
        }
        if (!cancelled) {
          setCalendar(cal);
          setArchive([...snapshots.values()]);
          setVersion((v) => v + 1);
        }
        const outcomes = await Promise.allSettled(writes);
        if (!cancelled && outcomes.some((outcome) => outcome.status === "rejected")) setSyncError(true);
      } catch {
        if (!cancelled) setSyncError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const reports = useMemo(() => {
    const byKey = new Map(archive.map((row) => [weeklyReportKey(row.semesterId, row.weekNumber), row]));
    if (calendar?.semester) {
      const students = loadStudents();
      const halaqat = loadHalaqat();
      const grades = loadGrades();
      for (const week of getSelectableWeeks(calendar)) {
        if (week.week_number !== calendar.currentWeekNumber && !weekHasGrades(grades, week.week_number)) continue;
        const report = buildWeeklyReport(calendar, week.week_number, halaqat, students, grades);
        if (report) byKey.set(weeklyReportKey(report.semesterId, report.weekNumber), report);
      }
    }
    return [...byKey.entries()].sort((a, b) => b[1].startDate.localeCompare(a[1].startDate));
  }, [archive, calendar, version]);

  const selectedKey = reports.some(([key]) => key === selected) ? selected : reports[0]?.[0];
  const report = reports.find(([key]) => key === selectedKey)?.[1];

  return (
    <section className="glass-card rounded-2xl p-5 space-y-5">
      <div>
        <h2 className="text-lg font-bold text-primary">التقارير الأسبوعية</h2>
        <p className="text-sm text-muted-foreground">نسب الحلقات، حضور الأسبوع، ولوحة الشرف للأسابيع المسجلة.</p>
      </div>
      {loading ? <p className="flex items-center gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> جارٍ استرجاع الأسابيع السابقة…</p> : null}
      {syncError && <p className="text-sm text-destructive">تعذّر مزامنة الأرشيف الآن. قد لا تظهر تقارير الفصول المحفوظة سابقًا حتى يعود الاتصال.</p>}
      {!loading && reports.length === 0 && <p className="text-sm text-muted-foreground">لا توجد درجات أو تقارير أسبوعية محفوظة لاسترجاعها.</p>}
      {report && (
        <>
          <label className="block text-sm font-medium space-y-2">
            <span>اختر الأسبوع</span>
            <select className="block w-full rounded-md border border-input bg-background p-2" value={selectedKey} onChange={(e) => setSelected(e.target.value)}>
              {reports.map(([key, row]) => <option key={key} value={key}>{row.semesterName} — {weekLabel(row.weekNumber)} ({row.startDate} – {row.endDate})</option>)}
            </select>
          </label>
          <div className="rounded-lg border border-border p-4">
            <h3 className="font-semibold mb-2">حضور الأسبوع كاملًا</h3>
            <strong className="text-2xl text-primary">{formatOverallPercent(report.attendance.percentage)}</strong>
            <p className="text-xs text-muted-foreground mt-1">{report.attendance.present} حضور من {report.attendance.total} فرصة حضور للطلاب في أيام الدراسة؛ التأخر محسوب حضورًا.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-3">نسب الحلقات الأسبوعية</h3>
            <div className="grid sm:grid-cols-2 gap-2">
              {report.halaqat.map((row) => <div key={row.id} className="flex justify-between gap-2 rounded-lg bg-secondary/50 p-3"><span>{row.name} <small className="text-muted-foreground">({row.studentCount})</small></span><strong>{formatOverallPercent(row.percentage)}</strong></div>)}
            </div>
          </div>
          <div>
            <h3 className="flex items-center gap-2 font-semibold mb-3"><Trophy className="w-4 h-4" /> لوحة الشرف — الأوائل</h3>
            <div className="grid sm:grid-cols-2 gap-2">
              {report.honorBoard.map((row, index) => <div key={row.id} className="flex justify-between gap-2 rounded-lg bg-secondary/50 p-3"><span>{index + 1}. {row.name} <small className="text-muted-foreground">— {row.halaqaName}</small></span><strong>{formatOverallPercent(row.percentage)}</strong></div>)}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
