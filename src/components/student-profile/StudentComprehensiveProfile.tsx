import { useMemo } from "react";
import {
  loadHalaqat,
  loadStudents,
  loadGrades,
  type Student,
} from "@/lib/mock-data";
import { fetchActiveCalendar, type AcademicCalendar } from "@/lib/academic-context";
import { studentReportPercentages } from "@/lib/semester-grading";
import { StudentPercentSummary } from "@/components/StudentPercentSummary";
import { fetchStudentPlanSheet } from "@/lib/plans-service";
import type { StudentPlanSheetData } from "@/lib/plan-types";
import { useEffect, useState } from "react";
import {
  attendanceTypeLabel,
  buildStudentProfileData,
  transferStatusLabel,
} from "@/lib/student-profile-data";
import { AcademicRecordFullList } from "@/components/student-profile/StudentAcademicResults";
import { StudentPlanSheet } from "@/components/plans/StudentPlanSheet";
import { weekLabel } from "@/lib/arabic-numbers";
import { BookOpen, Calendar, Send, User } from "lucide-react";

const DAY_AR: Record<string, string> = {
  sun: "الأحد", mon: "الاثنين", tue: "الثلاثاء", wed: "الأربعاء", thu: "الخميس",
};

export function StudentComprehensiveProfile({ student }: { student: Student }) {
  const halaqat = loadHalaqat();
  const grades = loadGrades();
  const halaqa = halaqat.find((h) => h.id === student.halaqaId);
  const [planData, setPlanData] = useState<StudentPlanSheetData | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [calendar, setCalendar] = useState<AcademicCalendar | null>(null);

  const profile = useMemo(() => buildStudentProfileData(student.id), [student.id]);

  useEffect(() => {
    let cancelled = false;
    fetchActiveCalendar(true)
      .then((cal) => { if (!cancelled) setCalendar(cal); })
      .catch(() => { if (!cancelled) setCalendar(null); });
    return () => { cancelled = true; };
  }, []);

  const report = useMemo(() => {
    if (!calendar || !halaqa) return null;
    return studentReportPercentages(student.id, student.levelType, halaqa.isTalqeen, grades, calendar);
  }, [calendar, halaqa, student, grades]);

  useEffect(() => {
    let cancelled = false;
    setPlanLoading(true);
    fetchStudentPlanSheet(student.id)
      .then((d) => { if (!cancelled) setPlanData(d); })
      .catch(() => { if (!cancelled) setPlanData(null); })
      .finally(() => { if (!cancelled) setPlanLoading(false); });
    return () => { cancelled = true; };
  }, [student.id]);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
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

      {report && halaqa && (
        <section className="glass-card rounded-2xl p-5">
          <h4 className="font-bold text-primary mb-3">النسب التراكمية — من بداية الفصل حتى اليوم</h4>
          <StudentPercentSummary report={report} isTalqeen={halaqa.isTalqeen} />
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
                  <th className="p-2">التاريخ / الأسبوع</th>
                  <th className="p-2">اليوم</th>
                  <th className="p-2">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {profile.attendance.map((a, i) => (
                  <tr key={`${a.date}-${a.dayKey}-${i}`} className="border-b border-border/30">
                    <td className="p-2">{a.date || weekLabel(a.week)}</td>
                    <td className="p-2 text-muted-foreground">{DAY_AR[a.dayKey] ?? a.dayKey}</td>
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
        <h4 className="font-bold text-primary mb-3 flex items-center gap-2">
          <Send className="w-4 h-4" /> تحويلات المعلم للإدارة
        </h4>
        {profile.transfers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">لا توجد تحويلات مسجّلة</p>
        ) : (
          <div className="space-y-2">
            {profile.transfers.map((t) => (
              <div key={t.id} className="p-3 rounded-lg bg-warning/5 border border-warning/20 text-sm">
                <div className="flex justify-between gap-2 flex-wrap">
                  <span className="font-bold">{t.fromName}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(t.date).toLocaleDateString("ar-SA")} · {weekLabel(t.week)}
                  </span>
                </div>
                <p className="mt-1">{t.reason}</p>
                <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded bg-secondary">
                  {transferStatusLabel(t.status)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
