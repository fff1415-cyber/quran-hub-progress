import { useMemo, useState } from "react";
import type { PlanTaskType, StudentPlanSheetData } from "@/lib/plan-types";
import {
  completionMap,
  computeDelayDays,
  findCurrentSegmentIndex,
  levelUnit,
  taskLabel,
  trackLabel,
} from "@/lib/plan-translator";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, Loader2 } from "lucide-react";

const TASKS: PlanTaskType[] = ["hifz", "rabt", "muraja"];

interface StudentPlanSheetProps {
  data: StudentPlanSheetData;
  studentName?: string;
  readOnly?: boolean;
  loading?: boolean;
  className?: string;
}

export function StudentPlanSheet({
  data,
  studentName,
  readOnly = true,
  loading,
  className,
}: StudentPlanSheetProps) {
  const [tab, setTab] = useState<PlanTaskType>("hifz");

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

  if (!assignment || !plan) {
    return (
      <div className={cn("text-center py-12 text-muted-foreground text-sm", className)}>
        {studentName ? `${studentName}: ` : ""}لم تُربَط بخطة تعليمية بعد
      </div>
    );
  }

  const planLabel = `${trackLabel(plan.track)} · ${levelUnit(plan.track)} ${plan.level_number}`;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {studentName && <div className="font-bold text-lg text-primary">{studentName}</div>}
          <div className="text-sm text-muted-foreground">{plan.title || planLabel}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {planLabel}
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

      <Tabs value={tab} onValueChange={(v) => setTab(v as PlanTaskType)} dir="rtl">
        <TabsList className="w-full grid grid-cols-3">
          {TASKS.map((t) => (
            <TabsTrigger key={t} value={t}>
              {taskLabel(t)}
            </TabsTrigger>
          ))}
        </TabsList>
        {TASKS.map((task) => (
          <TabsContent key={task} value={task} className="mt-3">
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm border-collapse min-w-[480px]">
                <thead>
                  <tr className="bg-secondary/50 text-xs">
                    <th className="p-2 text-right w-12">#</th>
                    <th className="p-2 text-right">الخطة</th>
                    <th className="p-2 text-center w-36">الإنجاز</th>
                  </tr>
                </thead>
                <tbody>
                  {segments
                    .filter((s) => s.segment_index >= assignment.start_segment_index)
                    .map((seg) => {
                      const planText =
                        task === "hifz"
                          ? seg.hifz_plan
                          : task === "rabt"
                            ? seg.rabt_plan
                            : seg.muraja_plan;
                      const date = compMap[`${seg.segment_index}:${task}`];
                      const isCurrent = seg.segment_index === currentSeg && task === "hifz";
                      return (
                        <tr
                          key={`${seg.segment_index}-${task}`}
                          className={cn(
                            "border-t border-border/50",
                            isCurrent && "bg-warning/10",
                            date && "bg-success/5",
                          )}
                        >
                          <td className="p-2 font-mono text-muted-foreground">{seg.segment_index}</td>
                          <td className="p-2 text-xs max-w-[240px] truncate" title={planText}>
                            {planText || "—"}
                          </td>
                          <td className="p-2 text-center">
                            {date ? (
                              <span className="inline-flex items-center gap-1 text-success font-medium text-xs">
                                <Check className="w-3.5 h-3.5 shrink-0" aria-hidden />
                                {date}
                              </span>
                            ) : isCurrent && delayDays > 0 ? (
                              <span className="text-warning text-xs font-bold">متأخر {delayDays}d</span>
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {readOnly && (
        <p className="text-[10px] text-muted-foreground text-center">عرض للقراءة فقط</p>
      )}
    </div>
  );
}
