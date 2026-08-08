import { useMemo, useEffect, useState } from "react";
import {
  loadHalaqat,
  loadGrades,
  type Student,
} from "@/lib/mock-data";
import { fetchActiveCalendar, type AcademicCalendar } from "@/lib/academic-context";
import { studentReportPercentages, fallbackWeeklyAverage } from "@/lib/semester-grading";
import { StudentPercentSummary } from "@/components/StudentPercentSummary";
import { fetchStudentPlanSheet } from "@/lib/plans-service";
import type { StudentPlanSheetData } from "@/lib/plan-types";
import {
  attendanceTypeLabel,
  buildStudentProfileData,
  dayKeyLabel,
  formatProfileDate,
  transferStatusLabel,
  violationCategoryLabel,
} from "@/lib/student-profile-data";
import {
  buildStudentFullReport,
  exportStudentReportExcel,
  printStudentReportPdf,
} from "@/lib/student-report-export";
import { SCIENTIFIC_FIELD_LABELS } from "@/lib/scientific-grades";
import { AcademicRecordFullList } from "@/components/student-profile/StudentAcademicResults";
import { StudentPlanSheet } from "@/components/plans/StudentPlanSheet";
import { weekLabel } from "@/lib/arabic-numbers";
import { useTenant } from "@/contexts/TenantContext";
import { TransferActionsList } from "@/components/role-workspace/TransferActionForm";
import { BookOpen, Calendar, AlertTriangle, User, Download, FileText } from "lucide-react";
import { toast } from "sonner";

export function StudentComprehensiveProfile({ student }: { student: Student }) {
  const { brandName } = useTenant();
  const halaqat = loadHalaqat();
  const grades = loadGrades();
  const halaqa = halaqat.find((h) => h.id === student.halaqaId);
  const [planData, setPlanData] = useState<StudentPlanSheetData | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [calendar, setCalendar] = useState<AcademicCalendar | null>(null);

  const profile = useMemo(
    () => buildStudentProfileData(student.id, calendar),
    [student.id, calendar],
  );

  useEffect(() => {
    let cancelled = false;
    fetchActiveCalendar(true)
      .then((cal) => { if (!cancelled) setCalendar(cal); })
      .catch(() => { if (!cancelled) setCalendar(null); });
    return () => { cancelled = true; };
  }, []);

  const report = useMemo(() => {
    if (!halaqa) return null;
    if (calendar) {
      return studentReportPercentages(student.id, student.levelType, halaqa.isTalqeen, grades, calendar);
    }
    return {
      overall: fallbackWeeklyAverage(student.id, halaqa.isTalqeen, grades, student.levelType),
      weekOverall: 0,
      components: { attendance: 0, hifz: 0, muraja: 0, rabt: 0, wajib: 0 },
    };
  }, [calendar, halaqa, student, grades]);

  const fullReport = useMemo(
    () => buildStudentFullReport(student, calendar),
    [student, calendar],
  );

  useEffect(() => {
    let cancelled = false;
    setPlanLoading(true);
    fetchStudentPlanSheet(student.id)
      .then((d) => { if (!cancelled) setPlanData(d); })
      .catch(() => { if (!cancelled) setPlanData(null); })
      .finally(() => { if (!cancelled) setPlanLoading(false); });
    return () => { cancelled = true; };
  }, [student.id]);

  const exportExcel = () => {
    try {
      exportStudentReportExcel(fullReport);
      toast.success("تم تصدير التقرير (Excel)");
    } catch {
      toast.error("فشل تصدير Excel");
    }
  };

  const exportPdf = () => {
    try {
      printStudentReportPdf(fullReport, brandName);
      toast.success("جاري فتح نافذة الطباعة — اختر «حفظ كـ PDF»");
    } catch {
      toast.error("فشل تصدير PDF");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20 flex-1 min-w-0">
          <User className="w-8 h-8 text-primary shrink-0 mt-0.5" />
          <div>
            <h3 className="text-xl font-bold">{student.name}</h3>
            <p className="text-sm text-muted-foreground">
              {halaqa?.name ?? "—"} · مستوى {student.level} · {student.levelType === "gold" ? "ذهبي" : "فضي"}
            </p>
            {student.nationalId && (
              <p className="text-xs text-muted-foreground mt-1">الهوية: {student.nationalId}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={exportExcel}
            className="px-3 py-2 rounded-lg gold-gradient text-primary-foreground font-bold flex items-center gap-1.5 text-sm"
          >
            <Download className="w-4 h-4" /> Excel
          </button>
          <button
            type="button"
            onClick={exportPdf}
            className="px-3 py-2 rounded-lg border border-primary/40 text-primary font-bold flex items-center gap-1.5 text-sm hover:bg-primary/5"
          >
            <FileText className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      {report && halaqa && (
        <section className="glass-card rounded-2xl p-5">
          <h4 className="font-bold text-primary mb-3">النسب التراكمية — من بداية الفصل حتى اليوم</h4>
          <StudentPercentSummary report={report} isTalqeen={halaqa.isTalqeen} />
        </section>
      )}

      {fullReport.scientific.enabled && (
        <section className="glass-card rounded-2xl p-5">
          <h4 className="font-bold text-primary mb-3">الدرجات العلمية (مجموع الفصل)</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {fullReport.scientific.fields.map((field) => (
              <div key={field} className="rounded-lg border border-border p-3 bg-secondary/30 text-center">
                <div className="text-xs text-muted-foreground">{SCIENTIFIC_FIELD_LABELS[field]}</div>
                <div className="text-lg font-bold text-primary">{fullReport.scientific.totals[field]}</div>
              </div>
            ))}
            <div className="rounded-lg border border-primary/30 p-3 bg-primary/5 text-center">
              <div className="text-xs text-muted-foreground">الإجمالي</div>
              <div className="text-lg font-bold text-primary">{fullReport.scientific.totals.total}</div>
            </div>
          </div>
        </section>
      )}

      <section className="glass-card rounded-2xl p-5">
        <h4 className="font-bold text-primary mb-3 flex items-center gap-2">
          <BookOpen className="w-4 h-4" /> الخطط والمراحل المجتازة
        </h4>
        <AcademicRecordFullList records={profile.academic.filter((r) => r.result === "passed")} />
        {profile.academic.filter((r) => r.result === "passed").length === 0 && (
          <p className="text-xs text-muted-foreground mb-4">لا توجد مراحل مجتازة بعد — الخطة الحالية أدناه</p>
        )}
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-sm font-bold text-muted-foreground mb-3">الخطة الحالية</p>
          <StudentPlanSheet
            data={planData ?? { assignment: null, plan: null, segments: [], completions: [] }}
            studentName={student.name}
            readOnly
            loading={planLoading}
          />
        </div>
      </section>

      <section className="glass-card rounded-2xl p-5">
        <h4 className="font-bold text-primary mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4" /> سجل الغياب والتأخر
        </h4>
        {profile.attendance.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">لا يوجد غياب أو تأخر مسجّل</p>
        ) : (
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-muted-foreground border-b border-border">
                  <th className="p-2">التاريخ</th>
                  <th className="p-2">اليوم</th>
                  <th className="p-2">الأسبوع</th>
                  <th className="p-2">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {profile.attendance.map((a, i) => (
                  <tr key={`${a.date}-${a.dayKey}-${i}`} className="border-b border-border/30">
                    <td className="p-2">{a.date ? formatProfileDate(a.date) : "—"}</td>
                    <td className="p-2 text-muted-foreground">{dayKeyLabel(a.dayKey)}</td>
                    <td className="p-2 text-muted-foreground">{a.week ? weekLabel(a.week) : "—"}</td>
                    <td className="p-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        a.type === "absent" ? "bg-destructive/15 text-destructive"
                          : a.type === "late" ? "bg-warning/15 text-warning"
                            : "bg-primary/15 text-primary"
                      }`}>
                        {attendanceTypeLabel(a.type)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="glass-card rounded-2xl p-5">
        <h4 className="font-bold text-primary mb-1 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> المخالفات
        </h4>
        <p className="text-xs text-muted-foreground mb-3">
          {violationCategoryLabel()} — تاريخ المخالفة = يوم إرسال المعلم للإدارة
        </p>
        {profile.violations.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">لا توجد مخالفات مسجّلة</p>
        ) : (
          <div className="space-y-3">
            {profile.violations.map((v) => (
              <div key={v.id} className="rounded-xl border border-warning/20 bg-warning/5 p-3">
                <div className="grid sm:grid-cols-2 gap-2 text-sm mb-2">
                  <div><span className="text-muted-foreground text-xs">السبب: </span><span className="font-medium">{v.type}</span></div>
                  <div><span className="text-muted-foreground text-xs">تاريخ المخالفة: </span>{formatProfileDate(v.date)}</div>
                  <div><span className="text-muted-foreground text-xs">المعلم: </span>{v.fromName}</div>
                  <div><span className="text-muted-foreground text-xs">الأسبوع: </span>{weekLabel(v.week)} · {transferStatusLabel(v.status)}</div>
                </div>
                {v.actions.length > 0 ? (
                  <div>
                    <p className="text-xs font-bold text-primary mb-1">الإجراءات المتخذة</p>
                    <TransferActionsList actions={v.actions} />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">لا يوجد إجراء مسجّل بعد</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
