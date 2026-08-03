import { useMemo } from "react";
import type { AcademicCalendar } from "@/lib/academic-context";
import type { GradesStore } from "@/lib/mock-data";
import {
  formatOverallPercent,
  overallPercentColorClass,
  semesterDayCompletionReport,
} from "@/lib/semester-grading";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BookOpen, ClipboardCheck, Info, Link2, RotateCw, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  studentId: string;
  isTalqeen: boolean;
  grades: GradesStore;
  calendar: AcademicCalendar;
}

export function SemesterBreakdownPopover({
  studentId,
  isTalqeen,
  grades,
  calendar,
}: Props) {
  const report = useMemo(
    () => semesterDayCompletionReport(studentId, isTalqeen, grades, calendar),
    [studentId, isTalqeen, grades, calendar],
  );

  const items = isTalqeen
    ? [
        { icon: UserCheck, label: "الحضور", hint: "حاضر + متأخر + مستأذن", value: report.components.attendance },
        { icon: ClipboardCheck, label: "الواجب", value: report.components.wajib },
      ]
    : [
        { icon: UserCheck, label: "الحضور", hint: "حاضر + متأخر + مستأذن", value: report.components.attendance },
        { icon: BookOpen, label: "الحفظ", value: report.components.hifz },
        { icon: RotateCw, label: "المراجعة", value: report.components.muraja },
        { icon: Link2, label: "الربط", value: report.components.rabt },
      ];

  const overallClass = overallPercentColorClass(report.overall);

  return (
    <div className="inline-flex items-center justify-center gap-0.5 min-w-0">
      <span className={cn("font-bold text-sm", overallClass)}>
        {formatOverallPercent(report.overall)}
      </span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex shrink-0 items-center justify-center w-5 h-5 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            aria-label="تفصيل النسب الفصلية"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="left"
          align="center"
          className="w-60 p-0 overflow-hidden"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="px-3 py-2 border-b border-border bg-primary/5">
            <p className="text-xs font-bold text-primary">النسب الفصلية — تفصيل</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              من بداية الفصل · {report.totalDays} يوم عمل
            </p>
          </div>
          <ul className="p-2 space-y-1">
            {items.map(({ icon: Icon, label, hint, value }) => (
              <li
                key={label}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50"
              >
                <span className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 text-primary shrink-0">
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <div className="flex-1 min-w-0 text-right">
                  <div className="text-xs font-medium text-foreground leading-tight">{label}</div>
                  {hint && (
                    <div className="text-[9px] text-muted-foreground leading-tight">{hint}</div>
                  )}
                </div>
                <span className={cn("text-sm font-bold shrink-0", overallPercentColorClass(value))}>
                  {formatOverallPercent(value)}
                </span>
              </li>
            ))}
          </ul>
          <div className="px-3 py-2 border-t border-border bg-muted/30 text-[9px] text-muted-foreground text-center leading-snug">
            كل نسبة = أيام أنجزها ÷ إجمالي أيام الفصل
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
