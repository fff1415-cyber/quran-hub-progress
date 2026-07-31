/**
 * Semester overall percentage — independent from plan progress (StudentPlanSheet).
 * Silver: ½ hifz = full hifz slot; Gold: 1 hifz = full hifz slot; excess can exceed 100%.
 */

import { generateAcademicWeeks } from "@/lib/calendar-generator";
import type { AcademicCalendar } from "@/lib/academic-context";
import { isoDateToDayKey } from "@/lib/operational-date";
import type { DayEntry, GradesStore, HifzValue, Student } from "@/lib/mock-data";
import { DAYS, weekPercentage, type WeekRecord } from "@/lib/mock-data";

export interface DailyGradeWeights {
  attendance_present: number;
  attendance_late: number;
  attendance_excused: number;
  hifz_half: number;
  hifz_one: number;
  hifz_two: number;
  /** Full hifz denominator for silver (½ = 100%). */
  hifz_silver_full: number;
  /** Full hifz denominator for gold (1 = 100%). */
  hifz_gold_full: number;
  rabt_pass: number;
  rabt_fail: number;
  muraja_pass: number;
  muraja_fail: number;
  talqeen_wajib: number;
}

export const DEFAULT_DAILY_GRADE_WEIGHTS: DailyGradeWeights = {
  attendance_present: 15,
  attendance_late: 10,
  attendance_excused: 5,
  hifz_half: 15,
  hifz_one: 20,
  hifz_two: 25,
  hifz_silver_full: 15,
  hifz_gold_full: 20,
  rabt_pass: 15,
  rabt_fail: 5,
  muraja_pass: 15,
  muraja_fail: 5,
  talqeen_wajib: 15,
};

export interface SemesterDayRef {
  iso: string;
  weekNumber: number;
  dayKey: string;
}

export interface DayScoreBreakdown {
  earned: number;
  max: number;
}

const EMPTY_DAY: DayEntry = {
  attendance: "",
  hifz: "",
  rabt: "",
  muraja: "",
  wajib: false,
};

export function hifzPoints(hifz: HifzValue, weights: DailyGradeWeights): number {
  if (hifz === "half") return weights.hifz_half;
  if (hifz === "one") return weights.hifz_one;
  if (hifz === "two") return weights.hifz_two;
  return 0;
}

export function hifzFullMax(levelType: Student["levelType"], weights: DailyGradeWeights): number {
  return levelType === "gold" ? weights.hifz_gold_full : weights.hifz_silver_full;
}

export function attendancePoints(att: DayEntry["attendance"], weights: DailyGradeWeights): number {
  if (att === "present") return weights.attendance_present;
  if (att === "late") return weights.attendance_late;
  if (att === "excused") return weights.attendance_excused;
  return 0;
}

export function attendanceMax(weights: DailyGradeWeights): number {
  return weights.attendance_present;
}

export function dayScoreBreakdown(
  entry: DayEntry | undefined,
  levelType: Student["levelType"],
  isTalqeen: boolean,
  weights: DailyGradeWeights = DEFAULT_DAILY_GRADE_WEIGHTS,
): DayScoreBreakdown {
  const d = entry ?? EMPTY_DAY;
  const attEarned = attendancePoints(d.attendance, weights);
  const attMax = attendanceMax(weights);

  if (isTalqeen) {
    const wajibEarned = d.wajib ? weights.talqeen_wajib : 0;
    return { earned: attEarned + wajibEarned, max: attMax + weights.talqeen_wajib };
  }

  const hifzEarned = hifzPoints(d.hifz, weights);
  const hifzMax = hifzFullMax(levelType, weights);
  const rabtEarned = d.rabt === "pass" ? weights.rabt_pass : d.rabt === "fail" ? weights.rabt_fail : 0;
  const rabtMax = weights.rabt_pass;
  const murEarned = d.muraja === "pass" ? weights.muraja_pass : d.muraja === "fail" ? weights.muraja_fail : 0;
  const murMax = weights.muraja_pass;

  return {
    earned: attEarned + hifzEarned + rabtEarned + murEarned,
    max: attMax + hifzMax + rabtMax + murMax,
  };
}

/** Elapsed working days in the active semester up to calendar operational date. */
export function getElapsedSemesterDays(calendar: AcademicCalendar): SemesterDayRef[] {
  const sem = calendar.semester;
  if (!sem?.start_date) return [];

  const weeks = generateAcademicWeeks({
    startDate: sem.start_date,
    weeksCount: sem.weeks_count,
    workingDays: sem.working_days,
    excludedDates: sem.excluded_dates,
  });

  const cap = calendar.operationalDate;
  const out: SemesterDayRef[] = [];

  for (const w of weeks) {
    for (const iso of w.workingDayDates) {
      if (iso > cap) continue;
      out.push({
        iso,
        weekNumber: w.weekNumber,
        dayKey: isoDateToDayKey(iso),
      });
    }
  }

  return out;
}

function lookupDayEntry(
  grades: GradesStore,
  studentId: string,
  day: SemesterDayRef,
): DayEntry | undefined {
  return grades[studentId]?.[day.weekNumber]?.days[day.dayKey];
}

/** Semester cumulative overall % — can exceed 100. */
export function semesterOverallPercentage(
  studentId: string,
  levelType: Student["levelType"],
  isTalqeen: boolean,
  grades: GradesStore,
  calendar: AcademicCalendar,
  weights: DailyGradeWeights = DEFAULT_DAILY_GRADE_WEIGHTS,
): number {
  const days = getElapsedSemesterDays(calendar);
  if (days.length === 0) {
    return fallbackWeeklyAverage(studentId, isTalqeen, grades);
  }

  let earned = 0;
  let max = 0;
  for (const day of days) {
    const part = dayScoreBreakdown(lookupDayEntry(grades, studentId, day), levelType, isTalqeen, weights);
    earned += part.earned;
    max += part.max;
  }

  if (max <= 0) return 0;
  return Math.round((earned / max) * 1000) / 10;
}

export function halaqaSemesterAverage(
  students: Student[],
  isTalqeen: boolean,
  grades: GradesStore,
  calendar: AcademicCalendar,
  weights?: DailyGradeWeights,
): number {
  if (students.length === 0) return 0;
  const sum = students.reduce(
    (acc, s) => acc + semesterOverallPercentage(s.id, s.levelType, isTalqeen, grades, calendar, weights),
    0,
  );
  return Math.round((sum / students.length) * 10) / 10;
}

export interface ComponentPercentages {
  attendance: number;
  hifz: number;
  muraja: number;
  rabt: number;
  wajib: number;
}

export interface StudentReportPercentages {
  overall: number;
  weekOverall: number;
  components: ComponentPercentages;
}

/** Weekly-only report for student/parent portal. */
export interface StudentWeekReport {
  weekNumber: number;
  weekOverall: number;
  components: ComponentPercentages;
}

function ratioPct(earned: number, max: number): number {
  if (max <= 0) return 0;
  return Math.round((earned / max) * 1000) / 10;
}

function accumulateComponentTotals(
  entry: DayEntry | undefined,
  levelType: Student["levelType"],
  isTalqeen: boolean,
  weights: DailyGradeWeights,
  acc: { attE: number; attM: number; hifzE: number; hifzM: number; murE: number; murM: number; rabE: number; rabM: number; wajE: number; wajM: number },
): void {
  const d = entry ?? EMPTY_DAY;
  acc.attE += attendancePoints(d.attendance, weights);
  acc.attM += attendanceMax(weights);
  if (isTalqeen) {
    acc.wajE += d.wajib ? weights.talqeen_wajib : 0;
    acc.wajM += weights.talqeen_wajib;
    return;
  }
  acc.hifzE += hifzPoints(d.hifz, weights);
  acc.hifzM += hifzFullMax(levelType, weights);
  acc.murE += d.muraja === "pass" ? weights.muraja_pass : d.muraja === "fail" ? weights.muraja_fail : 0;
  acc.murM += weights.muraja_pass;
  acc.rabE += d.rabt === "pass" ? weights.rabt_pass : d.rabt === "fail" ? weights.rabt_fail : 0;
  acc.rabM += weights.rabt_pass;
}

/** Component % from semester start through today (elapsed working days). */
export function semesterComponentPercentages(
  studentId: string,
  levelType: Student["levelType"],
  isTalqeen: boolean,
  grades: GradesStore,
  calendar: AcademicCalendar,
  weights: DailyGradeWeights = DEFAULT_DAILY_GRADE_WEIGHTS,
): ComponentPercentages {
  const days = getElapsedSemesterDays(calendar);
  const acc = { attE: 0, attM: 0, hifzE: 0, hifzM: 0, murE: 0, murM: 0, rabE: 0, rabM: 0, wajE: 0, wajM: 0 };
  for (const day of days) {
    accumulateComponentTotals(lookupDayEntry(grades, studentId, day), levelType, isTalqeen, weights, acc);
  }
  return {
    attendance: ratioPct(acc.attE, acc.attM),
    hifz: ratioPct(acc.hifzE, acc.hifzM),
    muraja: ratioPct(acc.murE, acc.murM),
    rabt: ratioPct(acc.rabE, acc.rabM),
    wajib: ratioPct(acc.wajE, acc.wajM),
  };
}

export function studentWeekOverallPercentage(
  studentId: string,
  isTalqeen: boolean,
  grades: GradesStore,
  weekNum: number,
): number {
  return weekPercentage(grades[studentId]?.[weekNum], isTalqeen);
}

/** Component % for a single academic week (current week on portal). */
export function studentWeekComponentPercentages(
  studentId: string,
  levelType: Student["levelType"],
  isTalqeen: boolean,
  grades: GradesStore,
  calendar: AcademicCalendar,
  weekNum: number,
  weights: DailyGradeWeights = DEFAULT_DAILY_GRADE_WEIGHTS,
): ComponentPercentages {
  const days = getElapsedSemesterDays(calendar).filter((d) => d.weekNumber === weekNum);
  const acc = { attE: 0, attM: 0, hifzE: 0, hifzM: 0, murE: 0, murM: 0, rabE: 0, rabM: 0, wajE: 0, wajM: 0 };

  if (days.length > 0) {
    for (const day of days) {
      accumulateComponentTotals(lookupDayEntry(grades, studentId, day), levelType, isTalqeen, weights, acc);
    }
  } else {
    const week = grades[studentId]?.[weekNum];
    if (week) {
      for (const d of DAYS) {
        accumulateComponentTotals(week.days[d.key], levelType, isTalqeen, weights, acc);
      }
    }
  }

  return {
    attendance: ratioPct(acc.attE, acc.attM),
    hifz: ratioPct(acc.hifzE, acc.hifzM),
    muraja: ratioPct(acc.murE, acc.murM),
    rabt: ratioPct(acc.rabE, acc.rabM),
    wajib: ratioPct(acc.wajE, acc.wajM),
  };
}

export function studentWeekReportPercentages(
  studentId: string,
  levelType: Student["levelType"],
  isTalqeen: boolean,
  grades: GradesStore,
  calendar: AcademicCalendar,
  weekNum: number = calendar.currentWeekNumber,
  weights?: DailyGradeWeights,
): StudentWeekReport {
  return {
    weekNumber: weekNum,
    weekOverall: studentWeekOverallPercentage(studentId, isTalqeen, grades, weekNum),
    components: studentWeekComponentPercentages(studentId, levelType, isTalqeen, grades, calendar, weekNum, weights),
  };
}

export function studentReportPercentages(
  studentId: string,
  levelType: Student["levelType"],
  isTalqeen: boolean,
  grades: GradesStore,
  calendar: AcademicCalendar,
  weights?: DailyGradeWeights,
): StudentReportPercentages {
  return {
    overall: semesterOverallPercentage(studentId, levelType, isTalqeen, grades, calendar, weights),
    weekOverall: studentWeekOverallPercentage(studentId, isTalqeen, grades, calendar.currentWeekNumber),
    components: semesterComponentPercentages(studentId, levelType, isTalqeen, grades, calendar, weights),
  };
}

export function halaqaWeekAverage(
  students: Student[],
  isTalqeen: boolean,
  grades: GradesStore,
  weekNum: number,
): number {
  if (students.length === 0) return 0;
  const sum = students.reduce(
    (acc, s) => acc + studentWeekOverallPercentage(s.id, isTalqeen, grades, weekNum),
    0,
  );
  return Math.round((sum / students.length) * 10) / 10;
}

/** Rows for Excel / report «معلومات» sheet. */
export function studentReportPercentRows(
  report: StudentReportPercentages,
  isTalqeen: boolean,
): (string | number)[][] {
  const rows: (string | number)[][] = [
    ["النسب — من بداية الفصل حتى اليوم"],
    ["النسبة الكلية %", report.overall],
    ["نسبة الأسبوع الحالي %", report.weekOverall],
    ["نسبة الحضور %", report.components.attendance],
  ];
  if (isTalqeen) {
    rows.push(["نسبة الواجب %", report.components.wajib]);
  } else {
    rows.push(
      ["نسبة الحفظ %", report.components.hifz],
      ["نسبة المراجعة %", report.components.muraja],
      ["نسبة الربط %", report.components.rabt],
    );
  }
  return rows;
}

/** Legacy fallback when no semester calendar is configured. */
export function fallbackWeeklyAverage(
  studentId: string,
  isTalqeen: boolean,
  grades: GradesStore,
): number {
  const weeks = grades[studentId];
  if (!weeks) return 0;
  const arr = Object.values(weeks).map((w) => weekPercentage(w, isTalqeen));
  if (arr.length === 0) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

export function formatOverallPercent(pct: number): string {
  if (Number.isInteger(pct) || pct === Math.round(pct * 10) / 10) {
    return `${pct % 1 === 0 ? Math.round(pct) : pct.toFixed(1)}%`;
  }
  return `${pct.toFixed(1)}%`;
}

export function overallPercentColorClass(pct: number): string {
  if (pct >= 80) return "text-success";
  if (pct >= 50) return "text-warning";
  return "text-muted-foreground";
}

/** Re-export for tests — week percentage unchanged for weekly column. */
export type { WeekRecord };
