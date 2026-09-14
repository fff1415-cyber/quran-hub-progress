import {
  loadProgramGrades,
  studentAllProgramsPeriodTotals,
  studentAllProgramsWeekTotals,
  studentSingleProgramPeriodTotals,
  type HalaqaProgram,
  type ProgramWeekTotals,
} from "@/lib/halaqa-programs";
import {
  enabledScientificFields,
  isScientificProgramEnabled,
  loadScientificConfig,
  loadScientificData,
  scientificPeriodMaxPossible,
  studentScientificPeriodTotals,
  studentScientificWeekTotals,
  type ScientificGradeField,
  type ScientificWeekTotals,
} from "@/lib/scientific-grades";

export type CombinedProgramTotals = {
  earned: number;
  maxPossible: number;
  percent: number;
  hasData: boolean;
  hasPercent: boolean;
  sciTotals: ScientificWeekTotals | null;
  programBreakdown: { program: HalaqaProgram; totals: ProgramWeekTotals }[];
};

export function buildCombinedProgramTotals(
  standardPrograms: HalaqaProgram[],
  grades: ReturnType<typeof loadProgramGrades>,
  studentId: string,
  weekNums: number[],
  sciData: ReturnType<typeof loadScientificData>,
  sciFields: ScientificGradeField[],
  workingDayKeys: string[],
  sciConfig: ReturnType<typeof loadScientificConfig>,
): CombinedProgramTotals {
  const stdTotals =
    weekNums.length === 1
      ? studentAllProgramsWeekTotals(standardPrograms, grades, studentId, weekNums[0]!)
      : studentAllProgramsPeriodTotals(standardPrograms, grades, studentId, weekNums);

  const sciTotals =
    isScientificProgramEnabled(sciConfig) && sciFields.length > 0
      ? weekNums.length === 1
        ? studentScientificWeekTotals(sciData, studentId, weekNums[0]!, sciFields)
        : studentScientificPeriodTotals(sciData, studentId, weekNums, sciFields)
      : null;

  const sciMax =
    sciFields.length > 0 ? scientificPeriodMaxPossible(sciConfig, weekNums, workingDayKeys) : 0;
  const sciEarned = sciTotals?.total ?? 0;
  const earned = stdTotals.earned + sciEarned;
  const maxPossible = stdTotals.maxPossible + sciMax;

  return {
    earned,
    maxPossible,
    percent: maxPossible > 0 ? Math.round((earned / maxPossible) * 100) : 0,
    hasData: stdTotals.filledSlots > 0 || sciEarned > 0,
    hasPercent: maxPossible > 0,
    sciTotals,
    programBreakdown: standardPrograms.map((p) => ({
      program: p,
      totals: studentSingleProgramPeriodTotals(p, grades, studentId, weekNums),
    })),
  };
}
