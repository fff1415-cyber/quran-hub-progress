import type { AcademicCalendar } from "@/lib/academic-context";
import {
  generateAcademicWeeks,
  parseISODate,
  addDays,
  formatISODate,
} from "@/lib/calendar-generator";
import { holidayDateStrings } from "@/lib/semester-holidays";
import type { GradesStore, Halaqa, Student } from "@/lib/mock-data";
import { resolveFaceQuotas, hifzFacesFromTap } from "@/lib/plan-daily-faces";
import { isoDateToDayKey } from "@/lib/operational-date";

export type ReportScope = "student" | "halaqa" | "complex";
export type ReportFocus = "all" | "attendance" | "hifz" | "rabt" | "muraja";
export type ReportOptions = {
  scope: ReportScope;
  from: string;
  to: string;
  halaqaId?: number;
  studentId?: string;
  named: boolean;
  focus: ReportFocus;
  donorName?: string;
};
export type PeriodTotals = {
  expected: number;
  recorded: number;
  present: number;
  late: number;
  excused: number;
  absent: number;
  eligibleTasks: number;
  hifzRecorded: number;
  hifzFaces: number;
  hifzTarget: number;
  rabtPass: number;
  rabtFail: number;
  murajaPass: number;
  murajaFail: number;
  wajibRecorded: number;
  wajibDone: number;
};
export type ReportStudent = {
  id: string;
  name: string;
  halaqaId: number;
  halaqaName: string;
  isTalqeen: boolean;
  period: PeriodTotals;
  previous: PeriodTotals | null;
  recommendation?: string;
};
export type ReportHalaqa = {
  id: number;
  name: string;
  isTalqeen: boolean;
  students: ReportStudent[];
  period: PeriodTotals;
  previous: PeriodTotals | null;
};
export type AcademicReport = {
  options: ReportOptions;
  semesterId: string;
  semesterName: string;
  generatedAt: string;
  priorFrom: string | null;
  priorTo: string | null;
  people: number;
  halaqat: ReportHalaqa[];
  totals: PeriodTotals;
  prior: PeriodTotals | null;
  improved: number | null;
  missingFields: number;
};

export const emptyTotals = (): PeriodTotals => ({
  expected: 0,
  recorded: 0,
  present: 0,
  late: 0,
  excused: 0,
  absent: 0,
  eligibleTasks: 0,
  hifzRecorded: 0,
  hifzFaces: 0,
  hifzTarget: 0,
  rabtPass: 0,
  rabtFail: 0,
  murajaPass: 0,
  murajaFail: 0,
  wajibRecorded: 0,
  wajibDone: 0,
});
export const percent = (a: number, b: number): number | null =>
  b > 0 ? Math.round((a / b) * 1000) / 10 : null;
export const attendancePct = (t: PeriodTotals): number | null =>
  percent(t.present + t.late, t.recorded);
export const completenessPct = (t: PeriodTotals): number | null => percent(t.recorded, t.expected);
export const hifzPct = (t: PeriodTotals): number | null => percent(t.hifzFaces, t.hifzTarget);
export const resultPct = (t: PeriodTotals, kind: "rabt" | "muraja"): number | null =>
  percent(t[`${kind}Pass`], t[`${kind}Pass`] + t[`${kind}Fail`]);
export function addTotals(target: PeriodTotals, source: PeriodTotals): PeriodTotals {
  for (const key of Object.keys(target) as (keyof PeriodTotals)[]) target[key] += source[key];
  return target;
}

/** Dates use the same working-day calendar and holidays as teacher preparation. */
function periodDays(
  calendar: AcademicCalendar,
  from: string,
  to: string,
): { date: string; week: number; dayKey: string }[] {
  const semester = calendar.semester;
  if (!semester) return [];
  return generateAcademicWeeks({
    startDate: semester.start_date,
    weeksCount: semester.weeks_count,
    workingDays: semester.working_days,
    excludedDates: holidayDateStrings(semester.excluded_dates),
  }).flatMap((week) =>
    week.workingDayDates
      .filter((date) => date >= from && date <= to && date <= calendar.operationalDate)
      .map((date) => ({ date, week: week.weekNumber, dayKey: isoDateToDayKey(date) })),
  );
}

function completeWeeks(
  calendar: AcademicCalendar,
  days: ReturnType<typeof periodDays>,
): Set<number> {
  const sem = calendar.semester!;
  const selected = new Set(days.map((day) => day.date));
  return new Set(
    generateAcademicWeeks({
      startDate: sem.start_date,
      weeksCount: sem.weeks_count,
      workingDays: sem.working_days,
      excludedDates: holidayDateStrings(sem.excluded_dates),
    })
      .filter(
        (week) =>
          week.workingDayDates.length > 0 &&
          week.workingDayDates.every((date) => selected.has(date)),
      )
      .map((week) => week.weekNumber),
  );
}

function studentTotals(
  student: Student,
  halaqa: Halaqa,
  grades: GradesStore,
  days: ReturnType<typeof periodDays>,
  fullWeeks: Set<number>,
): PeriodTotals {
  const totals = emptyTotals();
  const quota = resolveFaceQuotas(student.levelType);
  for (const day of days) {
    const entry = grades[student.id]?.[day.week]?.days[day.dayKey];
    totals.expected++;
    totals.hifzTarget += halaqa.isTalqeen ? 0 : quota.daily_hifz_faces;
    if (!entry) continue;
    if (entry.attendance) {
      totals.recorded++;
      totals[entry.attendance]++;
    }
    if (entry.attendance === "present" || entry.attendance === "late") totals.eligibleTasks++;
    if (halaqa.isTalqeen) {
      // The stored default is false, so it represents an incomplete duty on attended days.
      if (entry.attendance === "present" || entry.attendance === "late") {
        totals.wajibRecorded++;
        if (entry.wajib) totals.wajibDone++;
      }
      continue;
    }
    if (entry.hifz) {
      totals.hifzRecorded++;
      totals.hifzFaces += hifzFacesFromTap(entry.hifz);
    }
    totals.hifzFaces += entry.compensationFaces ?? 0;
    if (entry.rabt === "pass") totals.rabtPass++;
    if (entry.rabt === "fail") totals.rabtFail++;
    if (entry.muraja === "pass") totals.murajaPass++;
    if (entry.muraja === "fail") totals.murajaFail++;
    // Legacy weekly compensation has no day; it is counted only for complete weeks below.
  }
  if (!halaqa.isTalqeen) {
    for (const week of new Set(days.map((d) => d.week))) {
      const record = grades[student.id]?.[week];
      if (
        record &&
        fullWeeks.has(week) &&
        !Object.values(record.days).some((entry) => (entry?.compensationFaces ?? 0) > 0)
      )
        totals.hifzFaces += record.compensationFaces ?? 0;
    }
  }
  return totals;
}

export function buildAcademicReport(
  calendar: AcademicCalendar,
  halaqat: Halaqa[],
  students: Student[],
  grades: GradesStore,
  options: ReportOptions,
  notes: Record<string, string> = {},
): AcademicReport {
  if (!calendar.semester) throw new Error("لا يوجد فصل دراسي نشط");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(options.from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(options.to) ||
    options.from > options.to ||
    options.to > calendar.operationalDate
  )
    throw new Error("اختر فترة صحيحة لا تتجاوز اليوم");
  parseISODate(options.from);
  parseISODate(options.to);
  if (options.from < calendar.semester.start_date)
    throw new Error("تبدأ الفترة قبل بداية الفصل النشط");
  const days = periodDays(calendar, options.from, options.to);
  if (!days.length) throw new Error("لا توجد أيام دراسة في الفترة المحددة");
  const length =
    Math.round(
      (Date.parse(`${options.to}T00:00:00Z`) - Date.parse(`${options.from}T00:00:00Z`)) /
        86_400_000,
    ) + 1;
  const priorToCandidate = formatISODate(addDays(parseISODate(options.from), -1));
  const priorFromCandidate = formatISODate(addDays(parseISODate(options.from), -length));
  const priorCandidateDays =
    priorFromCandidate >= calendar.semester.start_date
      ? periodDays(calendar, priorFromCandidate, priorToCandidate)
      : [];
  const hasPrior = priorCandidateDays.length > 0;
  const priorDays = hasPrior ? priorCandidateDays : [];
  const fullWeeks = completeWeeks(calendar, days);
  const priorFullWeeks = hasPrior ? completeWeeks(calendar, priorDays) : new Set<number>();
  const byId = new Map(halaqat.map((h) => [h.id, h]));
  const selected = students.filter(
    (s) =>
      byId.has(s.halaqaId) &&
      (options.scope === "complex"
        ? !options.halaqaId || s.halaqaId === options.halaqaId
        : options.scope === "halaqa"
          ? s.halaqaId === options.halaqaId
          : s.id === options.studentId),
  );
  if (!selected.length) throw new Error("لا يوجد طلاب في النطاق المختار");
  const groups = new Map<number, ReportHalaqa>();
  for (const student of selected) {
    const h = byId.get(student.halaqaId)!;
    if (!groups.has(h.id))
      groups.set(h.id, {
        id: h.id,
        name: h.name,
        isTalqeen: h.isTalqeen,
        students: [],
        period: emptyTotals(),
        previous: hasPrior ? emptyTotals() : null,
      });
    const group = groups.get(h.id)!;
    const period = studentTotals(student, h, grades, days, fullWeeks);
    const previous = hasPrior ? studentTotals(student, h, grades, priorDays, priorFullWeeks) : null;
    group.students.push({
      id: student.id,
      name: student.name,
      halaqaId: h.id,
      halaqaName: h.name,
      isTalqeen: h.isTalqeen,
      period,
      previous,
      recommendation: notes[student.id],
    });
    addTotals(group.period, period);
    if (previous && group.previous) addTotals(group.previous, previous);
  }
  const rows = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const totals = rows.reduce((acc, row) => addTotals(acc, row.period), emptyTotals());
  const prior = hasPrior
    ? rows.reduce((acc, row) => addTotals(acc, row.previous!), emptyTotals())
    : null;
  const improved = hasPrior
    ? rows
        .flatMap((h) => h.students)
        .filter(
          (s) =>
            s.previous &&
            hifzPct(s.previous) !== null &&
            hifzPct(s.period) !== null &&
            hifzPct(s.period)! > hifzPct(s.previous)!,
        ).length
    : null;
  const missingFields = rows
    .flatMap((h) => h.students)
    .reduce(
      (n, s) =>
        n +
        (s.period.expected - s.period.recorded) +
        (s.isTalqeen
          ? Math.max(0, s.period.eligibleTasks - s.period.wajibRecorded)
          : Math.max(0, s.period.eligibleTasks - s.period.hifzRecorded) +
            Math.max(0, s.period.eligibleTasks - s.period.rabtPass - s.period.rabtFail) +
            Math.max(0, s.period.eligibleTasks - s.period.murajaPass - s.period.murajaFail)),
      0,
    );
  return {
    options,
    semesterId: calendar.semester.id,
    semesterName: calendar.semester.name,
    generatedAt: new Date().toISOString(),
    priorFrom: hasPrior ? priorFromCandidate : null,
    priorTo: hasPrior ? priorToCandidate : null,
    people: selected.length,
    halaqat: rows,
    totals,
    prior,
    improved,
    missingFields,
  };
}
