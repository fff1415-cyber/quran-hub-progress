import type { AcademicCalendar } from "@/lib/academic-context";
import { generateWeekDaySlots } from "@/lib/calendar-generator";
import { holidayDateStrings } from "@/lib/semester-holidays";
import type { GradesStore, Halaqa, Student } from "@/lib/mock-data";
import { halaqaWeekAverage, studentWeekOverallPercentage } from "@/lib/semester-grading";

export const WEEKLY_REPORT_PREFIX = "weekly_report_archive:";

export interface WeeklyReportSnapshot {
  semesterId: string;
  semesterName: string;
  weekNumber: number;
  startDate: string;
  endDate: string;
  capturedAt: string;
  halaqat: { id: number; name: string; percentage: number; studentCount: number }[];
  attendance: { present: number; total: number; percentage: number };
  honorBoard: { id: string; name: string; halaqaName: string; percentage: number }[];
}

export function weeklyReportKey(semesterId: string, weekNumber: number): string {
  return `${WEEKLY_REPORT_PREFIX}${semesterId}:${weekNumber}`;
}

export function isWeeklyReportSnapshot(value: unknown): value is WeeklyReportSnapshot {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<WeeklyReportSnapshot>;
  return typeof row.semesterId === "string" && Number.isInteger(row.weekNumber) &&
    typeof row.semesterName === "string" && Array.isArray(row.halaqat) &&
    Array.isArray(row.honorBoard) && typeof row.attendance?.percentage === "number";
}

export function buildWeeklyReport(
  calendar: AcademicCalendar,
  weekNumber: number,
  halaqat: Halaqa[],
  students: Student[],
  grades: GradesStore,
): WeeklyReportSnapshot | null {
  const semester = calendar.semester;
  const week = calendar.weeks.find((w) => w.week_number === weekNumber);
  if (!semester?.start_date || !week || weekNumber < 1) return null;

  const slots = generateWeekDaySlots({
    startDate: semester.start_date,
    weeksCount: semester.weeks_count,
    workingDays: semester.working_days,
    excludedDates: holidayDateStrings(semester.excluded_dates),
  }, weekNumber);
  const days = slots.filter((slot) => slot.isWorking && slot.iso <= calendar.operationalDate);
  const present = students.reduce((sum, student) => sum + days.filter((day) => {
    const attendance = grades[student.id]?.[weekNumber]?.days[day.dayKey]?.attendance;
    return attendance === "present" || attendance === "late";
  }).length, 0);
  const total = students.length * days.length;
  const byHalaqa = new Map(halaqat.map((h) => [h.id, h]));

  return {
    semesterId: semester.id,
    semesterName: semester.name,
    weekNumber,
    startDate: week.start_date,
    endDate: week.end_date,
    capturedAt: new Date().toISOString(),
    halaqat: halaqat.map((h) => {
      const members = students.filter((s) => s.halaqaId === h.id);
      return { id: h.id, name: h.name, studentCount: members.length,
        percentage: halaqaWeekAverage(members, h.isTalqeen, grades, weekNumber) };
    }),
    attendance: { present, total, percentage: total ? Math.round(present / total * 1000) / 10 : 0 },
    honorBoard: students.map((s) => {
      const h = byHalaqa.get(s.halaqaId);
      if (!h) return null;
      return { id: s.id, name: s.name, halaqaName: h.name,
        percentage: studentWeekOverallPercentage(s.id, h.isTalqeen, grades, weekNumber, s.levelType) };
    }).filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => b.percentage - a.percentage).slice(0, 15),
  };
}

export function weekIsComplete(calendar: AcademicCalendar, weekNumber: number): boolean {
  const semester = calendar.semester;
  if (!semester?.start_date) return false;
  const saturday = generateWeekDaySlots({
    startDate: semester.start_date,
    weeksCount: semester.weeks_count,
    workingDays: semester.working_days,
    excludedDates: holidayDateStrings(semester.excluded_dates),
  }, weekNumber)[6]?.iso;
  return !!saturday && saturday < calendar.operationalDate;
}

export function weekHasGrades(grades: GradesStore, weekNumber: number): boolean {
  return Object.values(grades).some((weeks) => weeks[weekNumber] !== undefined);
}
