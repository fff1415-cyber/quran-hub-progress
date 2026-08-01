import type { PlanTaskType } from "@/lib/plan-types";
import { hifzCheckedValue, isHifzChecked, type HifzValue, type Student } from "@/lib/mock-data";
import { HifzCheckbox, PassFail } from "@/components/plans/TeacherGradeInputs";

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
      <HifzCheckbox
        checked={isHifzChecked(hifzValue)}
        disabled={disabled}
        onChange={(next) => {
          onHifzChange(next ? hifzCheckedValue(student.levelType) : "");
          if (hasPlan && next) onPlanHifzChange?.(true);
        }}
      />
    );
  }

  if (hasPlan) {
    return (
      <PassFail
        value={passFailValue as "pass" | "fail" | ""}
        disabled={disabled}
        onChange={(v) => {
          onPassFailChange(v);
          if (v === "pass") onPlanPassFailChange?.(v);
        }}
      />
    );
  }

  return (
    <PassFail
      value={passFailValue as "pass" | "fail" | ""}
      onChange={onPassFailChange}
    />
  );
}
