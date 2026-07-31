import { useMemo, useState } from "react";
import { loadHalaqat } from "@/lib/mock-data";
import type { AcademicCalendar } from "@/lib/academic-context";
import { weekLabel } from "@/lib/arabic-numbers";
import {
  computeTarbawiStats,
  getHalaqaPlanSpan,
  getTarbawiPlan,
  getTarbawiSettings,
} from "@/lib/tarbawi-program";
import { TeacherTarbawiPanel } from "@/components/tarbawi/TeacherTarbawiPanel";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatOverallPercent } from "@/lib/semester-grading";

export function ProgramSupervisorMonitorPanel({ calendar }: { calendar: AcademicCalendar }) {
  const semesterId = calendar.semester?.id ?? "default";
  const halaqat = loadHalaqat();
  const settings = getTarbawiSettings(semesterId);
  const semesterWeeks = calendar.semester?.weeks_count ?? calendar.weeks.length;
  const [halaqaId, setHalaqaId] = useState(halaqat[0]?.id ?? 0);
  const [weekNum, setWeekNum] = useState(calendar.currentWeekNumber);

  const halaqa = halaqat.find((h) => h.id === halaqaId);
  const plan = useMemo(() => getTarbawiPlan(semesterId, halaqaId), [semesterId, halaqaId, calendar]);
  const spanWeeks = halaqa ? getHalaqaPlanSpan(settings, halaqaId, semesterWeeks) : 0;
  const weekStats = useMemo(
    () => computeTarbawiStats(plan, spanWeeks, weekNum),
    [plan, spanWeeks, weekNum],
  );
  const semesterStats = useMemo(
    () => computeTarbawiStats(plan, spanWeeks),
    [plan, spanWeeks],
  );

  const statusLabel: Record<string, string> = {
    draft: "مسودة",
    submitted: "بانتظار الاعتماد",
    approved: "معتمد — تنفيذ",
    rejected: "مرفوض",
  };

  return (
    <div className="space-y-6">
      <section className="glass-card rounded-2xl p-5">
        <div className="flex flex-wrap gap-4 items-end mb-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">الحلقة</label>
            <Select value={String(halaqaId)} onValueChange={(v) => setHalaqaId(Number(v))}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {halaqat.map((h) => (
                  <SelectItem key={h.id} value={String(h.id)}>{h.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">الأسبوع</label>
            <Select value={String(weekNum)} onValueChange={(v) => setWeekNum(Number(v))}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: spanWeeks }, (_, i) => i + 1).map((w) => (
                  <SelectItem key={w} value={String(w)}>{weekLabel(w)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {halaqa && (
          <>
            <p className="text-sm text-muted-foreground mb-3">
              المعلّم: {halaqa.teacherName} · الحالة: <strong>{statusLabel[plan.status]}</strong>
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <DashCard label={`تنفيذ ${weekLabel(weekNum)}`} value={formatOverallPercent(weekStats.pct)} />
              <DashCard label="تنفيذ الخطة (الفصل)" value={formatOverallPercent(semesterStats.pct)} />
              <DashCard label="فقرات منفّذة" value={`${semesterStats.executed}/${semesterStats.total}`} />
              <DashCard label="مدة الخطة" value={`${spanWeeks} أسب.`} />
            </div>
          </>
        )}
      </section>

      {halaqa && (
        <SupervisorPlanEditor
          plan={plan}
          halaqaName={halaqa.name}
          calendar={calendar}
          weekNum={weekNum}
          onWeekChange={setWeekNum}
        />
      )}
    </div>
  );
}

function DashCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-center">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-lg font-bold gold-text">{value}</div>
    </div>
  );
}

/** Supervisor can view/edit approved plan execution same as teacher panel */
function SupervisorPlanEditor({
  plan,
  halaqaName,
  calendar,
  weekNum,
  onWeekChange,
}: {
  plan: ReturnType<typeof getTarbawiPlan>;
  halaqaName: string;
  calendar: AcademicCalendar;
  weekNum: number;
  onWeekChange: (n: number) => void;
}) {
  if (plan.status === "approved") {
    return (
      <TeacherTarbawiPanel
        halaqaId={plan.halaqaId}
        halaqaName={halaqaName}
        calendar={calendar}
        weekNum={weekNum}
        onWeekChange={onWeekChange}
        readOnly={false}
      />
    );
  }

  return (
    <div className="glass-card rounded-2xl p-6 text-sm text-muted-foreground text-center">
      الخطة لم تُعتمد بعد — راجع تبويب «اعتماد الخطط»
    </div>
  );
}
