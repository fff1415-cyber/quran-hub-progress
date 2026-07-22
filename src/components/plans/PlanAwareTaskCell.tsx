import type { PlanTaskType, TapValue } from "@/lib/plan-types";
import type { HifzValue, Student } from "@/lib/mock-data";
import { QuickTapInput } from "@/components/plans/QuickTapInput";
import { HifzSelect, PassFail } from "@/components/plans/TeacherGradeInputs";

interface PlanAwareTaskCellProps {
  student: Student;
  task: PlanTaskType;
  hasPlan: boolean;
  hifzValue: HifzValue;
  passFailValue: string;
  onHifzChange: (v: HifzValue) => void;
  onPassFailChange: (v: "pass" | "fail" | "") => void;
  onPlanTap: (tap: TapValue) => void;
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
  onPlanTap,
  disabled,
}: PlanAwareTaskCellProps) {
  if (hasPlan) {
    return (
      <QuickTapInput
        track={student.levelType}
        task={task}
        disabled={disabled}
        onTap={onPlanTap}
      />
    );
  }
  if (task === "hifz") {
    return <HifzSelect value={hifzValue} onChange={onHifzChange} />;
  }
  return (
    <PassFail
      value={passFailValue as "pass" | "fail" | ""}
      onChange={onPassFailChange}
    />
  );
}
