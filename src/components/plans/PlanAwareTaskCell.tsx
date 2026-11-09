import type { GradePlanAvailability, PlanTaskType } from "@/lib/plan-types";
import { type HifzValue, type Student } from "@/lib/mock-data";
import { HifzTaskInput, PassFail } from "@/components/plans/TeacherGradeInputs";

export const planGradeTaskLabels = { hifz: "الحفظ", rabt: "الربط", muraja: "المراجعة" };

export function PlanGradeAvailabilityNote({ availability }: { availability?: GradePlanAvailability }) {
  if (!availability) return null;
  const messages = (Object.keys(planGradeTaskLabels) as PlanTaskType[]).flatMap(task => {
    switch (availability[task]) {
      case "complete":
        return task === "hifz" ? ["اكتملت مقاطع الحفظ في الخطة"] : [`${planGradeTaskLabels[task]}: أُنجزت المقاطع المتاحة`];
      case "awaiting_hifz":
        return [`${planGradeTaskLabels[task]}: بانتظار تسجيل الحفظ`];
      case "no_segments":
        return [`${planGradeTaskLabels[task]}: لا توجد مقاطع في الخطة`];
      default:
        return [];
    }
  });
  return messages.length ? <p className="text-[10px] text-warning leading-snug">{messages.join(" · ")}</p> : null;
}

interface PlanAwareTaskCellProps {
  student: Student;
  task: PlanTaskType;
  hasPlan: boolean;
  hifzValue: HifzValue;
  passFailValue: string;
  onHifzChange: (v: HifzValue) => void;
  onPassFailChange: (v: "pass" | "fail" | "") => void;
  onPlanHifzChange?: (value: HifzValue) => void;
  onPlanPassFailChange?: (v: "pass" | "fail" | "") => void;
  disabled?: boolean;
}

export function PlanAwareTaskCell({
  student,
  task,
  hasPlan,
  hifzValue,
  passFailValue,
  onHifzChange,
  onPassFailChange,
  onPlanHifzChange,
  onPlanPassFailChange,
  disabled,
}: PlanAwareTaskCellProps) {
  if (task === "hifz") {
    return (
      <HifzTaskInput
        value={hifzValue}
        levelType={student.levelType}
        goldOnly={hasPlan && student.levelType === "gold"}
        disabled={disabled}
        onChange={(v) => {
          if (hasPlan && onPlanHifzChange) {
            if (v !== hifzValue) onPlanHifzChange(v);
            return;
          }
          onHifzChange(v);
        }}
      />
    );
  }

  if (hasPlan) {
    return (
      <PassFail
        field={task}
        value={passFailValue as "pass" | "fail" | ""}
        disabled={disabled}
        onChange={(v) => {
          // A recorded pass can have a linked completion. Reversing it must
          // use the same atomic path as recording it.
          if ((v === "pass" || passFailValue === "pass") && onPlanPassFailChange) {
            onPlanPassFailChange(v);
            return;
          }
          onPassFailChange(v);
        }}
      />
    );
  }

  return (
    <PassFail
      field={task}
      value={passFailValue as "pass" | "fail" | ""}
      onChange={onPassFailChange}
    />
  );
}
