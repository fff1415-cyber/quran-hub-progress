import { useMemo } from "react";
import type { StudentPlanSheetData } from "@/lib/plan-types";
import {
  completionMap,
  computeDelayDays,
  findCurrentSegmentIndex,
  levelUnit,
  trackLabel,
} from "@/lib/plan-translator";
import { resolveFaceQuotas } from "@/lib/plan-daily-faces";
import { formatPlanDate, formatPlanDateTime } from "@/lib/plan-dates";
import { arabicDayName } from "@/lib/plan-phase";
import { cn } from "@/lib/utils";
import { Check, Loader2 } from "lucide-react";

interface StudentPlanSheetProps {
  data: StudentPlanSheetData;
  studentName?: string;
  readOnly?: boolean;
  loading?: boolean;
  error?: string | null;
  className?: string;
}

export function StudentPlanSheet({
  data,
  studentName,
  readOnly = true,
  loading,
  error,
  className,
}: StudentPlanSheetProps) {
  const { assignment, plan, segments, completions } = data;

  const compMap = useMemo(() => completionMap(completions), [completions]);
  const segmentIndexes = useMemo(() => segments.map((s) => s.segment_index), [segments]);
  const currentSeg = useMemo(() => {
    if (!assignment) return null;
    return findCurrentSegmentIndex(assignment.start_segment_index, segmentIndexes, completions);
  }, [assignment, segmentIndexes, completions]);

  const delayDays = useMemo(
    () => computeDelayDays(currentSeg, completions),
    [currentSeg, completions],
  );

  const progressPct = useMemo(() => {
    if (segments.length === 0) return 0;
    const hifzDone = new Set(
      completions.filter((c) => c.task_type === "hifz").map((c) => c.segment_index),
    ).size;
    return Math.round((hifzDone / segments.length) * 100);
  }, [segments, completions]);

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center py-16 text-muted-foreground", className)}>
        <Loader2 className="w-6 h-6 animate-spin ml-2" />
        جاري تحميل الخطة...
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("text-center py-12 text-destructive text-sm space-y-2", className)}>
        <p>{studentName ? `${studentName}: ` : ""}تعذّر تحميل ورقة الإنجاز</p>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">{error}</p>
      </div>
    );
  }

  if (!assignment || !plan) {
    return (
      <div className={cn("text-center py-12 text-muted-foreground text-sm", className)}>
        {studentName ? `${studentName}: ` : ""}
        {assignment && !plan
          ? "الربط موجود لكن الخطة غير موجودة على السيرفر — أعد استيراد Excel"
          : "لم تُربَط بخطة تعليمية بعد"}
      </div>
    );
  }

  const planLabel = `${trackLabel(plan.track)} · ${levelUnit(plan.track)} ${plan.level_number}`;
  const quotas = resolveFaceQuotas(plan.track);
  const visibleSegments = segments.filter((s) => s.segment_index >= assignment.start_segment_index);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {studentName && <div className="font-bold text-lg text-primary">{studentName}</div>}
          <div className="text-sm font-medium">{plan.title || planLabel}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {trackLabel(plan.track)}
            {assignment.plan_start_date && ` · بداية ${formatPlanDate(assignment.plan_start_date)}`}
            {assignment.assigned_at && ` · ربط ${formatPlanDateTime(assignment.assigned_at)}`}
            {assignment.status === "frozen" && (
              <span className="mr-2 text-warning font-bold">· مجمدة</span>
            )}
          </div>
        </div>
        <div className="text-left">
          <div className="text-2xl font-bold gold-text">{progressPct}%</div>
          <div className="text-[10px] text-muted-foreground">تقدم الحفظ</div>
        </div>
      </div>

      {currentSeg !== null && delayDays > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning font-medium">
          متأخر {delayDays} {delayDays === 1 ? "يوم" : "أيام"} — المقطع #{currentSeg}
        </div>
      )}

      <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2 text-xs text-muted-foreground grid grid-cols-2 sm:grid-cols-3 gap-2">
        <span>حفظ/يوم: <strong className="text-foreground">{quotas.daily_hifz_faces}</strong> وجه</span>
        <span>ربط/يوم: <strong className="text-foreground">{quotas.daily_rabt_faces}</strong> وجه</span>
        <span>مراجعة/يوم: <strong className="text-foreground">{quotas.daily_muraja_faces}</strong> وجه</span>
        <span className="sm:col-span-3">ضغطات الحفظ: ½={quotas.faces_per_half} · 1={quotas.faces_per_one} · 2={quotas.faces_per_two} وجه</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm border-collapse min-w-[720px]">
          <thead>
            <tr className="bg-secondary/50 text-xs">
              <th className="p-2 text-right w-10">#</th>
              <th className="p-2 text-center w-16">اليوم</th>
              <th className="p-2 text-center w-24">التاريخ</th>
              <th className="p-2 text-right">الخطة (حفظ)</th>
              <th className="p-2 text-center w-12">✅</th>
              <th className="p-2 text-right">الربط</th>
              <th className="p-2 text-center w-12">✅</th>
              <th className="p-2 text-right">المراجعة</th>
              <th className="p-2 text-center w-12">✅</th>
            </tr>
          </thead>
          <tbody>
            {visibleSegments.map((seg) => {
              const hifzDate = compMap[`${seg.segment_index}:hifz`];
              const rabtDone = !!compMap[`${seg.segment_index}:rabt`];
              const murajaDone = !!compMap[`${seg.segment_index}:muraja`];
              const isCurrent = seg.segment_index === currentSeg;
              return (
                <tr
                  key={seg.segment_index}
                  className={cn(
                    "border-t border-border/50",
                    isCurrent && "bg-warning/10",
                    hifzDate && "bg-success/5",
                  )}
                >
                  <td className="p-2 font-mono text-muted-foreground">{seg.segment_index}</td>
                  <td className="p-2 text-center text-xs">{hifzDate ? arabicDayName(hifzDate) : "—"}</td>
                  <td className="p-2 text-center text-xs font-mono">{hifzDate || "—"}</td>
                  <td className="p-2 text-xs max-w-[180px] truncate" title={seg.hifz_plan}>
                    {seg.hifz_plan || "—"}
                  </td>
                  <td className="p-2 text-center">
                    {hifzDate ? (
                      <Check className="w-4 h-4 text-success inline" aria-label="تم الحفظ" />
                    ) : (
                      <span className="text-muted-foreground/30">—</span>
                    )}
                  </td>
                  <td className="p-2 text-xs max-w-[140px] truncate" title={seg.rabt_plan}>
                    {seg.rabt_plan || "—"}
                  </td>
                  <td className="p-2 text-center">
                    {rabtDone ? (
                      <Check className="w-4 h-4 text-success inline" aria-label="تم الربط" />
                    ) : (
                      <span className="text-muted-foreground/30">—</span>
                    )}
                  </td>
                  <td className="p-2 text-xs max-w-[140px] truncate" title={seg.muraja_plan}>
                    {seg.muraja_plan || "—"}
                  </td>
                  <td className="p-2 text-center">
                    {murajaDone ? (
                      <Check className="w-4 h-4 text-success inline" aria-label="تمت المراجعة" />
                    ) : (
                      <span className="text-muted-foreground/30">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {readOnly && (
        <p className="text-[10px] text-muted-foreground text-center">عرض للقراءة فقط</p>
      )}
    </div>
  );
}
