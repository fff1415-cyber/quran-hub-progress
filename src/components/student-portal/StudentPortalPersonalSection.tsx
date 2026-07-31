import { useMemo } from "react";
import type { Student } from "@/lib/mock-data";
import type { Halaqa } from "@/lib/mock-data";
import type { AcademicCalendar } from "@/lib/academic-context";
import type { StudentPlanSheetData } from "@/lib/plan-types";
import type { StudentPortalVisibility } from "@/lib/student-portal-settings";
import type { StudentWeekReport } from "@/lib/semester-grading";
import {
  aggregateFaceProgress,
  faceQuotasFromAssignment,
  formatFaceCount,
} from "@/lib/plan-daily-faces";
import {
  attendanceTypeLabel,
  collectPortalAbsenceRows,
  dayNameAr,
  formatPortalDate,
} from "@/lib/student-portal-data";
import { StudentWeeklyPercentSummary } from "@/components/student-portal/StudentWeeklyPercentSummary";
import { StudentAcademicResultsSection } from "@/components/student-profile/StudentAcademicResults";
import { StudentPlanSheet } from "@/components/plans/StudentPlanSheet";
import { weekLabel } from "@/lib/arabic-numbers";
import {
  BookOpen, Calendar, CheckCircle2, Clock, AlertCircle, UserCheck, GraduationCap, Layers,
} from "lucide-react";
import type { GradesStore } from "@/lib/mock-data";

interface Props {
  student: Student;
  halaqa: Halaqa;
  calendar: AcademicCalendar;
  grades: GradesStore;
  weekReport: StudentWeekReport;
  semesterOverall: number;
  todayStatus: string;
  planData: StudentPlanSheetData | null;
  planLoading: boolean;
  visibility: StudentPortalVisibility;
}

export function StudentPortalPersonalSection({
  student,
  halaqa,
  calendar,
  grades,
  weekReport,
  semesterOverall,
  todayStatus,
  planData,
  planLoading,
  visibility,
}: Props) {
  const absenceRows = useMemo(
    () => (visibility.absenceRecord ? collectPortalAbsenceRows(student.id, calendar, grades) : []),
    [student.id, calendar, grades, visibility.absenceRecord],
  );

  const faceSummary = useMemo(() => {
    if (!visibility.faceCounts) return null;
    const quotas = faceQuotasFromAssignment(planData?.assignment ?? null);
    return aggregateFaceProgress(student.id, grades, calendar, quotas);
  }, [student.id, grades, calendar, planData?.assignment, visibility.faceCounts]);

  const rabtMurCombined = faceSummary
    ? faceSummary.rabtActual + faceSummary.murajaActual
    : 0;

  const showAny =
    visibility.studentHeader ||
    visibility.todayAttendance ||
    visibility.weeklyPercentages ||
    visibility.faceCounts ||
    visibility.absenceRecord ||
    visibility.academicResults ||
    visibility.educationPlan;

  if (!showAny) return null;

  return (
    <section className="glass-card rounded-2xl p-6 gold-glow mt-6">
      <h2 className="text-xl font-bold text-primary mb-4 flex items-center gap-2">
        <GraduationCap className="w-5 h-5" /> بيانات الطالب
      </h2>

      {visibility.studentHeader && (
        <div className="mb-4">
          <h3 className="display text-2xl gold-text mb-1">{student.name}</h3>
          <p className="text-sm text-muted-foreground">{halaqa.name} · مستوى {student.level}</p>
        </div>
      )}

      {visibility.todayAttendance && <TodayBadge status={todayStatus} />}

      {visibility.weeklyPercentages && (
        <div className="mt-4 p-4 rounded-xl bg-secondary/30 border border-border">
          <StudentWeeklyPercentSummary
            report={weekReport}
            semesterOverall={semesterOverall}
            isTalqeen={halaqa.isTalqeen}
            weekLabelText={`${weekLabel(weekReport.weekNumber)} — تفصيل نسب هذا الأسبوع`}
          />
        </div>
      )}

      {visibility.faceCounts && faceSummary && (
        <div className="mt-4 p-4 rounded-xl bg-secondary/30 border border-border">
          <h4 className="text-sm font-bold text-primary mb-1 flex items-center gap-2">
            <Layers className="w-4 h-4" /> عدد الأوجه المقروءة — من بداية الفصل
          </h4>
          <p className="text-xs text-muted-foreground mb-3">
            {calendar.semester?.name ?? "الفصل الحالي"} · تراكمي حتى اليوم
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <FaceCountCard label="الأوجه المحفوظة" value={faceSummary.hifzActual} />
            <FaceCountCard label="أوجه الربط والمراجعة" value={rabtMurCombined} />
          </div>
        </div>
      )}

      {visibility.absenceRecord && (
        <div className="mt-4 p-4 rounded-xl bg-secondary/30 border border-border">
          <h4 className="text-sm font-bold text-primary mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4" /> سجل الغياب والاستئذان
          </h4>
          {absenceRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">لا يوجد غياب أو استئذان مسجّل</p>
          ) : (
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-right text-muted-foreground border-b border-border">
                    <th className="p-2">التاريخ</th>
                    <th className="p-2">اليوم</th>
                    <th className="p-2">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {absenceRows.map((a, i) => (
                    <tr key={`${a.date}-${a.dayKey}-${i}`} className="border-b border-border/30">
                      <td className="p-2">{a.date ? formatPortalDate(a.date) : weekLabel(a.week)}</td>
                      <td className="p-2 text-muted-foreground">{dayNameAr(a.dayKey)}</td>
                      <td className="p-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          a.type === "absent"
                            ? "bg-destructive/15 text-destructive"
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
        </div>
      )}

      {visibility.academicResults && (
        <section className="mt-6 pt-6 border-t border-border">
          <StudentAcademicResultsSection studentId={student.id} />
        </section>
      )}

      {visibility.educationPlan && (
        <section className="mt-6 pt-6 border-t border-border">
          <h4 className="text-lg font-bold text-primary mb-1 flex items-center gap-2">
            <BookOpen className="w-5 h-5" /> الخطة التعليمية
          </h4>
          <p className="text-xs text-muted-foreground mb-4">
            تقدم الحفظ في الخطة — للقراءة فقط
          </p>
          <StudentPlanSheet
            data={planData ?? { assignment: null, plan: null, segments: [], completions: [] }}
            studentName={student.name}
            readOnly
            loading={planLoading}
          />
        </section>
      )}
    </section>
  );
}

function FaceCountCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border p-4 bg-card">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-2xl font-bold gold-text">
        {formatFaceCount(value)} <span className="text-sm font-normal text-muted-foreground">وجه</span>
      </div>
    </div>
  );
}

function TodayBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; icon: typeof CheckCircle2; cls: string }> = {
    present: { label: "حاضر اليوم", icon: CheckCircle2, cls: "bg-success/15 text-success border-success/30" },
    late: { label: "متأخر اليوم", icon: Clock, cls: "bg-warning/15 text-warning border-warning/30" },
    excused: { label: "مستأذن اليوم", icon: UserCheck, cls: "bg-primary/15 text-primary border-primary/30" },
    absent: { label: "غائب اليوم", icon: AlertCircle, cls: "bg-destructive/15 text-destructive border-destructive/30" },
  };
  const m = map[status] || { label: "لم تُسجَّل حالة اليوم بعد", icon: Clock, cls: "bg-muted text-muted-foreground border-border" };
  const Icon = m.icon;
  return (
    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border font-bold text-sm ${m.cls}`}>
      <Icon className="w-4 h-4" />
      {m.label}
    </div>
  );
}
