/** Academic calendar weeks — one wall-clock week each; holidays skip a day without shifting later weeks. */

const DAY_KEY_BY_JS: Record<number, string> = {
  0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat",
};

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

export interface AcademicWeekDaySlot {
  iso: string;
  dayKey: string;
  /** Configured working weekday, on or after semester start, and not a holiday. */
  isWorking: boolean;
  isHoliday: boolean;
  isBeforeStart: boolean;
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

/** Sunday on or before the given date (JS getDay 0 = Sunday). */
export function sundayOnOrBefore(d: Date): Date {
  return addDays(d, -d.getDay());
}

function isExcluded(iso: string, excluded: Set<string>): boolean {
  return excluded.has(iso);
}

function lastConfiguredWeekdayOffset(workingDays: number[]): number {
  const days = [...workingDays].sort((a, b) => a - b);
  return days.length ? days[days.length - 1]! : 4;
}

export function generateWeekDaySlots(
  input: SemesterCalendarInput,
  weekNumber: number,
): AcademicWeekDaySlot[] {
  const { startDate, workingDays, excludedDates } = input;
  if (weekNumber < 1) return [];

  const workingSet = new Set(workingDays);
  const excludedSet = new Set(excludedDates);
  const semesterStart = parseISODate(startDate);
  const weekSunday = addDays(sundayOnOrBefore(semesterStart), (weekNumber - 1) * 7);

  const slots: AcademicWeekDaySlot[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDays(weekSunday, offset);
    const iso = formatISODate(date);
    const jsDay = date.getDay();
    const configured = workingSet.has(jsDay);
    const beforeStart = iso < startDate;
    const holiday = configured && !beforeStart && isExcluded(iso, excludedSet);
    slots.push({
      iso,
      dayKey: DAY_KEY_BY_JS[jsDay] ?? "sun",
      isWorking: configured && !beforeStart && !holiday,
      isHoliday: holiday,
      isBeforeStart: beforeStart,
    });
  }
  return slots;
}

/**
 * Builds academic weeks aligned to Sunday–Saturday calendar weeks.
 * Each week keeps its weekday columns; excluded dates are omitted from workingDayDates
 * instead of pulling the next week’s days into the same week number.
 */
export function generateAcademicWeeks(input: SemesterCalendarInput): GeneratedAcademicWeek[] {
  const { startDate, weeksCount, workingDays } = input;

  if (weeksCount < 1) throw new Error("عدد الأسابيع يجب أن يكون 1 على الأقل");
  if (workingDays.length === 0) throw new Error("يجب تحديد يوم عمل واحداً على الأقل");
  parseISODate(startDate);

  const lastOffset = lastConfiguredWeekdayOffset(workingDays);
  const weeks: GeneratedAcademicWeek[] = [];

  for (let weekNumber = 1; weekNumber <= weeksCount; weekNumber += 1) {
    const slots = generateWeekDaySlots(input, weekNumber);
    const weekSunday = slots[0]!;
    const rangeStartIso = startDate > weekSunday.iso ? startDate : weekSunday.iso;
    const rangeEnd = addDays(parseISODate(weekSunday.iso), lastOffset);
    const rangeEndIso = formatISODate(rangeEnd);

    weeks.push({
      weekNumber,
      startDate: rangeStartIso,
      endDate: rangeEndIso < rangeStartIso ? rangeStartIso : rangeEndIso,
      workingDayDates: slots.filter((s) => s.isWorking).map((s) => s.iso),
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
