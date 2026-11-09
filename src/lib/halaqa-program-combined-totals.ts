import {
  loadProgramGrades,
  studentAllProgramsPeriodTotals,
  studentAllProgramsWeekTotals,
  studentSingleProgramPeriodTotals,
  type HalaqaProgram,
  type ProgramWeekTotals,
} from "@/lib/halaqa-programs";
import type { AcademicCalendar } from "@/lib/academic-context";
import { generateWeekDaySlots } from "@/lib/calendar-generator";
import { holidayDateStrings } from "@/lib/semester-holidays";
import {
  emptyScientificWeekTotals,
  isScientificProgramEnabled,
  loadScientificConfig,
  loadScientificData,
  parseScientificScore,
  scientificDailyMaxPossible,
  type ScientificGradeField,
  type ScientificWeekTotals,
} from "@/lib/scientific-grades";

export function elapsedProgramDays(calendar: AcademicCalendar, weeks: number[]): Record<number, string[]> {
  const semester = calendar.semester;
  if (!semester || !/^\d{4}-\d{2}-\d{2}$/.test(semester.start_date)) return {};
  const input = {
    startDate: semester.start_date,
    weeksCount: semester.weeks_count,
    workingDays: semester.working_days,
    excludedDates: holidayDateStrings(semester.excluded_dates),
  };
  return Object.fromEntries(weeks.map(week => [week, generateWeekDaySlots(input, week)
    .filter(day => day.isWorking && day.iso <= calendar.operationalDate)
    .map(day => day.dayKey)]));
}

export type CombinedProgramTotals = {
  earned: number;
  maxPossible: number;
  percent: number;
  hasData: boolean;
  hasPercent: boolean;
  sciTotals: ScientificWeekTotals | null;
  scientificRecordedFields: Set<ScientificGradeField>;
  programBreakdown: { program: HalaqaProgram; totals: ProgramWeekTotals }[];
};

export function buildCombinedProgramTotals(
  standardPrograms: HalaqaProgram[],
  grades: ReturnType<typeof loadProgramGrades>,
  studentId: string,
  weekNums: number[],
  sciData: ReturnType<typeof loadScientificData>,
  sciFields: ScientificGradeField[],
  daysByWeek: Record<number, string[]>,
  sciConfig: ReturnType<typeof loadScientificConfig>,
): CombinedProgramTotals {
  const stdTotals =
    weekNums.length === 1
      ? studentAllProgramsWeekTotals(standardPrograms, grades, studentId, weekNums[0]!)
      : studentAllProgramsPeriodTotals(standardPrograms, grades, studentId, weekNums);

  const sciTotals = isScientificProgramEnabled(sciConfig) ? emptyScientificWeekTotals() : null;
  let elapsedDays = 0;
  const scientificRecordedFields = new Set<ScientificGradeField>();
  if (sciTotals) {
    for (const week of weekNums) {
      const days = daysByWeek[week] ?? [];
      elapsedDays += days.length;
      for (const day of days) {
        const entry = sciData[studentId]?.[week]?.[day];
        if (!entry) continue;
        for (const field of sciFields) {
          const score = parseScientificScore(entry[field]);
          if (score === null) continue;
          scientificRecordedFields.add(field);
          sciTotals[field] += score;
          sciTotals.total += score;
        }
      }
    }
  }
  const sciMax = scientificDailyMaxPossible(sciConfig) * elapsedDays;
  const sciEarned = sciTotals?.total ?? 0;
  const earned = stdTotals.earned + sciEarned;
  const maxPossible = stdTotals.maxPossible + sciMax;

  return {
    earned,
    maxPossible,
    percent: maxPossible > 0 ? Math.round((earned / maxPossible) * 100) : 0,
    hasData: stdTotals.filledSlots > 0 || scientificRecordedFields.size > 0,
    hasPercent: maxPossible > 0,
    sciTotals,
    scientificRecordedFields,
    programBreakdown: standardPrograms.map((p) => ({
      program: p,
      totals: studentSingleProgramPeriodTotals(p, grades, studentId, weekNums),
    })),
  };
}
