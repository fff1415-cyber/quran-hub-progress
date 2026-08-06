import { useEffect, useMemo, useState } from "react";
import { loadGrades, loadHalaqat, loadStudents } from "@/lib/mock-data";
import { fetchActiveCalendar, type AcademicCalendar } from "@/lib/academic-context";
import {
  computeAllHalaqaSummaries,
  computeHalaqaResults,
  type HalaqaResultsSummary,
  type TaskFaceMetrics,
} from "@/lib/halaqa-results";
import { formatFaceCount } from "@/lib/plan-daily-faces";
import { formatOverallPercent } from "@/lib/semester-grading";
import { weekLabel } from "@/lib/arabic-numbers";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  BookOpen,
  ChevronLeft,
  Layers,
  Link2,
  Loader2,
  RefreshCw,
  Users,
} from "lucide-react";

export function SupervisorHalaqaResultsPanel() {
  const [calendar, setCalendar] = useState<AcademicCalendar | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const halaqat = loadHalaqat();
  const students = loadStudents();
  const grades = loadGrades();

  useEffect(() => {
    let cancelled = false;
    fetchActiveCalendar(true)
      .then((cal) => {
        if (!cancelled) setCalendar(cal);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const summaries = useMemo(() => {
    if (!calendar) return [];
    void refreshKey;
    return computeAllHalaqaSummaries(halaqat, students, grades, calendar);
  }, [calendar, halaqat, students, grades, refreshKey]);

  const selected = useMemo(() => {
    if (!calendar || selectedId == null) return null;
    const h = halaqat.find((x) => x.id === selectedId);
    if (!h) return null;
    void refreshKey;
    return computeHalaqaResults(h, students, grades, calendar);
  }, [calendar, selectedId, halaqat, students, grades, refreshKey]);

  if (!calendar) {
    return (
      <section className="glass-card rounded-2xl p-10 flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p>جاري تحميل بيانات الفصل...</p>
      </section>
    );
  }

  if (selected) {
    return (
      <HalaqaDetailView
        data={selected}
        weekNum={calendar.currentWeekNumber}
        onBack={() => setSelectedId(null)}
        onRefresh={() => setRefreshKey((k) => k + 1)}
      />
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-primary">نتائج الحلقات</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {weekLabel(calendar.currentWeekNumber)} · اضغط على حلقة للتفاصيل
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => setRefreshKey((k) => k + 1)}>
          <RefreshCw className="w-4 h-4" /> تحديث
        </Button>
      </div>

      {summaries.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center text-muted-foreground">
          لا توجد حلقات
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {summaries.map((s) => (
            <button
              key={s.halaqaId}
              type="button"
              onClick={() => setSelectedId(s.halaqaId)}
              className="glass-card rounded-2xl p-4 text-right hover:ring-2 hover:ring-primary/40 transition-all border border-border/50"
            >
              <div className="font-bold text-primary mb-1">{s.halaqaName}</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
                <Users className="w-3.5 h-3.5" />
                {s.studentCount} طالب
                {s.isTalqeen && <span className="mr-2 text-warning">· تلقين</span>}
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <MiniStat label="الكلي — أسبوع" value={formatOverallPercent(s.overallWeekPct)} />
                <MiniStat label="الكلي — تراكمي" value={formatOverallPercent(s.overallSemesterPct)} highlight />
              </div>
              {!s.isTalqeen && (
                <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-3 gap-1 text-[10px] text-center text-muted-foreground">
                  <span>حفظ {formatOverallPercent(s.hifz.weekPct)}</span>
                  <span>ربط {formatOverallPercent(s.rabt.weekPct)}</span>
                  <span>مراجعة {formatOverallPercent(s.muraja.weekPct)}</span>
                </div>
              )}
              <div className="mt-3 flex items-center justify-end gap-1 text-xs text-primary font-medium">
                عرض التفاصيل <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function HalaqaDetailView({
  data,
  weekNum,
  onBack,
  onRefresh,
}: {
  data: HalaqaResultsSummary;
  weekNum: number;
  onBack: () => void;
  onRefresh: () => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1" onClick={onBack}>
            <ChevronLeft className="w-4 h-4" /> رجوع
          </Button>
          <div>
            <h2 className="text-lg font-bold text-primary">{data.halaqaName}</h2>
            <p className="text-xs text-muted-foreground">
              {data.studentCount} طالب · {weekLabel(weekNum)}
              {data.isTalqeen ? " · حلقة تلقين" : ""}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1" onClick={onRefresh}>
          <RefreshCw className="w-4 h-4" /> تحديث
        </Button>
      </div>

      <div className="glass-card rounded-2xl p-6 flex flex-col items-center">
        <OverallRing pct={data.overallSemesterPct} label="النسبة الكلية للحلقة — تراكمي" size="lg" />
        <p className="text-xs text-muted-foreground mt-2">
          أسبوع {weekLabel(weekNum)}: {formatOverallPercent(data.overallWeekPct)}
        </p>
      </div>

      {data.isTalqeen ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.attendance && (
            <TaskCard title="الحضور" icon={Users} metrics={data.attendance} showFaces={false} />
          )}
          {data.wajib && (
            <TaskCard title="الواجب" icon={BookOpen} metrics={data.wajib} showFaces={false} />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <TaskCard title="الحفظ" icon={BookOpen} metrics={data.hifz} accent="primary" />
          <TaskCard title="الربط" icon={Link2} metrics={data.rabt} accent="blue" />
          <TaskCard title="المراجعة" icon={Layers} metrics={data.muraja} accent="amber" allowOver100Faces />
        </div>
      )}

      <StudentResultsTable data={data} weekNum={weekNum} />
    </section>
  );
}

function TaskCard({
  title,
  icon: Icon,
  metrics,
  showFaces = true,
  accent = "primary",
  allowOver100Faces = false,
}: {
  title: string;
  icon: typeof BookOpen;
  metrics: TaskFaceMetrics;
  showFaces?: boolean;
  accent?: "primary" | "blue" | "amber";
  allowOver100Faces?: boolean;
}) {
  const accentClass =
    accent === "blue"
      ? "border-blue-500/30 bg-blue-500/5"
      : accent === "amber"
        ? "border-amber-500/30 bg-amber-500/5"
        : "border-primary/30 bg-primary/5";

  return (
    <div className={cn("glass-card rounded-2xl p-5 border", accentClass)}>
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-5 h-5 text-primary" />
        <h3 className="font-bold text-primary">{title}</h3>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <OverallRing pct={metrics.weekPct} label="نسبة الأسبوع" />
        <OverallRing pct={metrics.semesterPct} label="تراكمي الفصل" />
      </div>

      {showFaces && (
        <div className="space-y-2 pt-3 border-t border-border/50">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">الأوجه المحفوظة</span>
            <span className="font-bold">{formatFaceCount(metrics.actualFaces)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">المستهدف — كامل الترم</span>
            <span className="font-bold">{formatFaceCount(metrics.termTargetFaces)}</span>
          </div>
          <FaceProgressBar pct={metrics.facesProgressPct} allowOver100={allowOver100Faces} />
          <p className={cn(
            "text-[10px] text-muted-foreground text-center",
            allowOver100Faces && metrics.facesProgressPct > 100 && "text-success font-bold",
          )}>
            إنجاز الأوجه: {formatOverallPercent(metrics.facesProgressPct)}% من هدف الترم
          </p>
        </div>
      )}
    </div>
  );
}

function StudentResultsTable({ data, weekNum }: { data: HalaqaResultsSummary; weekNum: number }) {
  if (data.students.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center text-muted-foreground text-sm">
        لا يوجد طلاب في هذه الحلقة
      </div>
    );
  }

  if (data.isTalqeen) {
    return (
      <div className="glass-card rounded-2xl p-4 overflow-x-auto">
        <h3 className="font-bold text-primary mb-3 text-sm">تفاصيل الطلاب</h3>
        <table className="w-full text-sm min-w-[640px] border-separate border-spacing-0">
          <thead>
            <tr className="text-right text-muted-foreground bg-secondary/60">
              <th className="p-2.5 border-b-2 border-border font-bold">الطالب</th>
              <th className="p-2.5 border-b-2 border-border">أسبوع</th>
              <th className="p-2.5 border-b-2 border-border">تراكمي</th>
              <th className="p-2.5 border-b-2 border-border">حضور أسبوع</th>
              <th className="p-2.5 border-b-2 border-border">حضور تراكمي</th>
              <th className="p-2.5 border-b-2 border-border">واجب أسبوع</th>
              <th className="p-2.5 border-b-2 border-border">واجب تراكمي</th>
            </tr>
          </thead>
          <tbody>
            {data.students.map((s, idx) => (
              <tr
                key={s.studentId}
                className={cn(
                  "border-b border-border/40 transition-colors hover:bg-accent/20",
                  idx % 2 === 0 ? "bg-card" : "bg-secondary/50",
                )}
              >
                <td className="p-2.5 font-medium">{s.studentName}</td>
                <td className="p-2.5 text-center">{formatOverallPercent(s.overallWeekPct)}</td>
                <td className="p-2.5 text-center font-bold text-primary">{formatOverallPercent(s.overallSemesterPct)}</td>
                <td className="p-2.5 text-center">{formatOverallPercent(s.attendance?.weekPct ?? 0)}</td>
                <td className="p-2.5 text-center">{formatOverallPercent(s.attendance?.semesterPct ?? 0)}</td>
                <td className="p-2.5 text-center">{formatOverallPercent(s.wajib?.weekPct ?? 0)}</td>
                <td className="p-2.5 text-center">{formatOverallPercent(s.wajib?.semesterPct ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-4 overflow-x-auto">
      <h3 className="font-bold text-primary mb-3 text-sm">تفاصيل الطلاب — {weekLabel(weekNum)}</h3>
      <table className="w-full text-sm min-w-[720px] border-separate border-spacing-0">
        <thead>
          <tr className="text-xs border-b-2 border-border bg-secondary/60">
            <th className="p-2.5 font-bold text-primary" rowSpan={2}>الطالب</th>
            <th className="p-2.5 font-bold text-primary border-r border-border" rowSpan={2}>كلي</th>
            <th className="p-2 text-center font-bold text-primary border-r-2 border-border" colSpan={2}>
              الحفظ
            </th>
            <th className="p-2 text-center font-bold text-primary border-r-2 border-border" colSpan={2}>
              الربط
            </th>
            <th className="p-2 text-center font-bold text-primary" colSpan={2}>
              المراجعة
            </th>
          </tr>
          <tr className="text-[11px] text-muted-foreground border-b-2 border-border bg-secondary/40">
            <th className="p-2 border-r border-border/60">تراكمي</th>
            <th className="p-2 border-r-2 border-border">أوجه / هدف</th>
            <th className="p-2 border-r border-border/60">تراكمي</th>
            <th className="p-2 border-r-2 border-border">أوجه / هدف</th>
            <th className="p-2 border-r border-border/60">تراكمي</th>
            <th className="p-2">أوجه / هدف</th>
          </tr>
        </thead>
        <tbody>
          {data.students.map((s, idx) => {
            const rowBg = idx % 2 === 0 ? "bg-card" : "bg-secondary/50";
            return (
              <tr
                key={s.studentId}
                className={cn(
                  "border-b border-border/50 transition-colors hover:bg-accent/20",
                  rowBg,
                )}
              >
                <td className={cn("p-2.5 font-medium whitespace-nowrap border-r border-border/40", rowBg)}>
                  {s.studentName}
                </td>
                <td className={cn("p-2.5 font-bold text-primary whitespace-nowrap text-center border-r border-border", rowBg)}>
                  {formatOverallPercent(s.overallSemesterPct)}
                </td>
                <StudentTaskCells task={s.hifz} sectionEnd rowBg={rowBg} />
                <StudentTaskCells task={s.rabt} sectionEnd rowBg={rowBg} />
                <StudentTaskCells task={s.muraja} rowBg={rowBg} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StudentTaskCells({
  task,
  sectionEnd = false,
  rowBg,
}: {
  task: TaskFaceMetrics;
  sectionEnd?: boolean;
  rowBg: string;
}) {
  return (
    <>
      <td className={cn("p-2.5 text-center font-semibold border-r border-border/40", rowBg)}>
        {formatOverallPercent(task.semesterPct)}
      </td>
      <td
        className={cn(
          "p-2.5 text-center text-xs whitespace-nowrap",
          sectionEnd && "border-r-2 border-border",
          rowBg,
        )}
      >
        <span className="font-bold text-foreground">{formatFaceCount(task.actualFaces)}</span>
        <span className="text-muted-foreground mx-1">/</span>
        <span className="text-muted-foreground">{formatFaceCount(task.termTargetFaces)}</span>
        <span className={cn(
          "block text-[10px] mt-0.5",
          task.facesProgressPct > 100 ? "text-success font-bold" : "text-muted-foreground",
        )}>
          {formatOverallPercent(task.facesProgressPct)}
        </span>
      </td>
    </>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg bg-secondary/40 px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-bold", highlight ? "gold-text" : "text-foreground")}>{value}</div>
    </div>
  );
}

function OverallRing({ pct, label, size = "md" }: { pct: number; label: string; size?: "md" | "lg" }) {
  const dim = size === "lg" ? 120 : 88;
  const r = size === "lg" ? 46 : 34;
  const stroke = size === "lg" ? 10 : 8;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(Math.max(pct, 0), 100);
  const dash = (clamped / 100) * c;
  const display = pct % 1 === 0 ? String(Math.round(pct)) : pct.toFixed(1);

  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative" style={{ width: dim, height: dim }}>
        <svg viewBox="0 0 100 100" className="-rotate-90 w-full h-full" aria-hidden>
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
          {clamped > 0 && (
            <circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${c}`}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn("font-bold text-primary", size === "lg" ? "text-2xl" : "text-base")}>
            {display}%
          </span>
        </div>
      </div>
      <div className="text-xs font-bold mt-2">{label}</div>
    </div>
  );
}

function FaceProgressBar({ pct, allowOver100 = false }: { pct: number; allowOver100?: boolean }) {
  const width = allowOver100 ? Math.min(Math.max(pct, 0), 100) : Math.min(Math.max(pct, 0), 100);
  return (
    <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
      <div
        className={cn(
          "h-full transition-all rounded-full",
          allowOver100 && pct > 100 ? "bg-success" : "bg-primary",
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
