import type { PlanTaskType } from "@/lib/plan-types";
import type { HifzValue, Student } from "@/lib/mock-data";
import { HifzSelect, PassFail } from "@/components/plans/TeacherGradeInputs";

interface PlanAwareTaskCellProps {
  student: Student;
  task: PlanTaskType;
  hasPlan: boolean;
  hifzValue: HifzValue;
  passFailValue: string;
  onHifzChange: (v: HifzValue) => void;
  onPassFailChange: (v: "pass" | "fail" | "") => void;
  onPlanHifzChange?: (v: HifzValue) => void;
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
  if (hasPlan) {
    if (task === "hifz") {
      return (
        <HifzSelect
          value={hifzValue}
          goldOnly={student.levelType === "gold"}
          disabled={disabled}
          onChange={(v) => {
            onHifzChange(v);
            if (v) onPlanHifzChange?.(v);
          }}
        />
      );
    }
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
