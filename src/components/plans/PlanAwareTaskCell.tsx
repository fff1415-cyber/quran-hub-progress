import type { PlanTaskType } from "@/lib/plan-types";
import { type HifzValue, type Student, isHifzChecked } from "@/lib/mock-data";
import { HifzTaskInput, PassFail } from "@/components/plans/TeacherGradeInputs";

interface PlanAwareTaskCellProps {
  student: Student;
  task: PlanTaskType;
  hasPlan: boolean;
  hifzValue: HifzValue;
  passFailValue: string;
  onHifzChange: (v: HifzValue) => void;
  onPassFailChange: (v: "pass" | "fail" | "") => void;
  onPlanHifzChange?: (checked: boolean) => void;
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
        disabled={disabled}
        onChange={(v) => {
          const wasOn = isHifzChecked(hifzValue);
          const nowOn = isHifzChecked(v);
          if (hasPlan && wasOn !== nowOn) {
            onPlanHifzChange?.(nowOn);
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
