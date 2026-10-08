import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fetchStudentEntryReport, type StudentEntryReport } from "@/lib/student-entry-tracking";

export function ManagerStudentEntriesPanel() {
  const [date, setDate] = useState("");
  const [report, setReport] = useState<StudentEntryReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchStudentEntryReport(date || undefined)
      .then((data) => {
        if (active) {
          setReport(data);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "تعذّر تحميل نشاط الدخول");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [date, refreshKey]);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="glass-card rounded-xl p-4 flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm font-medium">
          اختر اليوم
          <Input
            type="date"
            value={date || report?.date || ""}
            max={report?.today}
            onChange={(event) => setDate(event.target.value)}
            className="mt-1"
          />
        </label>
        <Button
          type="button"
          variant="outline"
          onClick={() => setRefreshKey((n) => n + 1)}
          disabled={loading}
        >
          تحديث
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {loading && <p className="text-muted-foreground">جاري تحميل التقرير...</p>}
      {report && (!date || report.date === date) && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="glass-card rounded-xl p-4">
              <p className="text-sm text-muted-foreground">مجموع الدخول يوم {report.date}</p>
              <strong className="text-2xl">{report.total}</strong>
            </div>
            <div className="glass-card rounded-xl p-4">
              <p className="text-sm text-muted-foreground">عدد الأشخاص الذين دخلوا</p>
              <strong className="text-2xl">{report.people}</strong>
            </div>
            <div className="glass-card rounded-xl p-4">
              <p className="text-sm text-muted-foreground">إجمالي الدخول منذ بداية الفصل</p>
              <strong className="text-2xl">{report.semesterTotal ?? "—"}</strong>
              <p className="text-xs text-muted-foreground">
                {report.semester
                  ? `${report.semester.name} · من ${report.semester.startDate}`
                  : "لا يوجد فصل نشط"}
              </p>
            </div>
          </div>
          <div className="glass-card rounded-xl p-4 overflow-x-auto">
            <h3 className="font-bold mb-3">تفاصيل الدخول اليومي</h3>
            <table className="w-full text-sm min-w-[450px]">
              <thead>
                <tr className="border-b text-right">
                  <th className="p-2">الطالب</th>
                  <th className="p-2">الحلقة</th>
                  <th className="p-2">مرات الدخول</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.studentId} className="border-b border-border/50">
                    <td className="p-2">{row.studentName}</td>
                    <td className="p-2">{row.halaqaName}</td>
                    <td className="p-2 font-bold">{row.visits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {report.rows.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">لم يُسجل دخول في هذا اليوم.</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            يبدأ الإحصاء من تفعيل هذه الميزة؛ لا يمكن احتساب زيارات سابقة لم تُسجّل. اليوم محسوب
            بتوقيت السعودية.
          </p>
        </>
      )}
    </div>
  );
}
