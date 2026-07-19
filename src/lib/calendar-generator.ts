/** Academic calendar week generator — working-days only, skips excluded dates. */

export interface SemesterCalendarInput {
  startDate: string;
  weeksCount: number;
  workingDays: number[];
  excludedDates: string[];
}

export interface GeneratedAcademicWeek {
  weekNumber: number;
  startDate: string;
  endDate: string;
  workingDayDates: string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseISODate(iso: string): Date {
  if (!ISO_DATE.test(iso)) throw new Error("صيغة التاريخ غير صالحة");
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function isWorkingDay(date: Date, workingDays: Set<number>, excluded: Set<string>): boolean {
  if (excluded.has(formatISODate(date))) return false;
  return workingDays.has(date.getDay());
}

function advanceToNextWorkingDay(
  date: Date,
  workingDays: Set<number>,
  excluded: Set<string>,
): Date {
  let cursor = new Date(date);
  let guard = 0;
  while (!isWorkingDay(cursor, workingDays, excluded)) {
    cursor = addDays(cursor, 1);
    guard += 1;
    if (guard > 366 * 3) throw new Error("تعذّر إيجاد يوم عمل صالح ضمن المدى الزمني");
  }
  return cursor;
}

/**
 * Builds academic weeks: each week contains exactly one occurrence per configured working day,
 * skipping excluded dates and non-working weekdays.
 */
export function generateAcademicWeeks(input: SemesterCalendarInput): GeneratedAcademicWeek[] {
  const { startDate, weeksCount, workingDays, excludedDates } = input;

  if (weeksCount < 1) throw new Error("عدد الأسابيع يجب أن يكون 1 على الأقل");
  if (workingDays.length === 0) throw new Error("يجب تحديد يوم عمل واحد على الأقل");

  const workingSet = new Set([...workingDays].sort((a, b) => a - b));
  const excludedSet = new Set(excludedDates);
  const daysPerWeek = workingSet.size;

  let cursor = advanceToNextWorkingDay(parseISODate(startDate), workingSet, excludedSet);
  const weeks: GeneratedAcademicWeek[] = [];

  for (let weekNumber = 1; weekNumber <= weeksCount; weekNumber += 1) {
    const workingDayDates: string[] = [];
    let weekStart: Date | null = null;
    let weekEnd: Date | null = null;

    while (workingDayDates.length < daysPerWeek) {
      if (isWorkingDay(cursor, workingSet, excludedSet)) {
        const iso = formatISODate(cursor);
        if (!weekStart) weekStart = new Date(cursor);
        weekEnd = new Date(cursor);
        workingDayDates.push(iso);
      }
      cursor = addDays(cursor, 1);
    }

    if (!weekStart || !weekEnd) {
      throw new Error(`تعذّر توليد الأسبوع رقم ${weekNumber}`);
    }

    weeks.push({
      weekNumber,
      startDate: formatISODate(weekStart),
      endDate: formatISODate(weekEnd),
      workingDayDates,
    });
  }

  return weeks;
}

export const WEEKDAY_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "الأحد" },
  { value: 1, label: "الاثنين" },
  { value: 2, label: "الثلاثاء" },
  { value: 3, label: "الأربعاء" },
  { value: 4, label: "الخميس" },
  { value: 5, label: "الجمعة" },
  { value: 6, label: "السبت" },
];

export function formatDateArabic(iso: string): string {
  try {
    return parseISODate(iso).toLocaleDateString("ar-SA", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
