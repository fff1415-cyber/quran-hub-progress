import { generateAcademicWeeks, generateWeekDaySlots, type AcademicWeekDaySlot } from "@/lib/calendar-generator";
import { holidayDateStrings, parseSemesterHolidays, type SemesterHoliday } from "@/lib/semester-holidays";
import { getCalendarIsoDate, getCalendarDayKey, isoDateToDayKey } from "@/lib/operational-date";
import { getToken } from "@/lib/cloud-sync";
import { secureGetActiveSemester } from "@/lib/secure-data.functions";
import { weekLabel } from "@/lib/arabic-numbers";

export interface SemesterDayRef {
  iso: string;
  weekNumber: number;
  dayKey: string;
}

export interface ActiveSemester {
  id: string;
  name: string;
  start_date: string;
  weeks_count: number;
  working_days: number[];
  excluded_dates: SemesterHoliday[];
}

export interface AcademicWeekRow {
  week_number: number;
  start_date: string;
  end_date: string;
}

export interface AcademicCalendar {
  semester: ActiveSemester | null;
  weeks: AcademicWeekRow[];
  currentWeekNumber: number;
  currentDayKey: string;
  operationalDate: string;
}

const CACHE_KEY = "qs_active_calendar_v2";
const FALLBACK_WEEKS = 18;

function parseSemester(raw: unknown): ActiveSemester | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.id !== "string" || typeof s.name !== "string") return null;
  return {
    id: s.id,
    name: s.name,
    start_date: String(s.start_date ?? ""),
    weeks_count: Number(s.weeks_count ?? 0),
    working_days: Array.isArray(s.working_days) ? s.working_days.map(Number) : [0, 1, 2, 3, 4],
    excluded_dates: parseSemesterHolidays(s.excluded_dates),
  };
}

function parseWeeks(raw: unknown): AcademicWeekRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((w) => {
      if (!w || typeof w !== "object") return null;
      const row = w as Record<string, unknown>;
      const week_number = Number(row.week_number ?? 0);
      const start_date = String(row.start_date ?? "");
      const end_date = String(row.end_date ?? "");
      if (week_number < 1 || !start_date || !end_date) return null;
      return { week_number, start_date, end_date };
    })
    .filter((w): w is AcademicWeekRow => w !== null)
    .sort((a, b) => a.week_number - b.week_number);
}

function fallbackWeeks(count: number): AcademicWeekRow[] {
  return Array.from({ length: count }, (_, i) => ({
    week_number: i + 1,
    start_date: "",
    end_date: "",
  }));
}

function semesterCalendarInput(semester: ActiveSemester) {
  return {
    startDate: semester.start_date,
    weeksCount: semester.weeks_count,
    workingDays: semester.working_days,
    excludedDates: holidayDateStrings(semester.excluded_dates),
  };
}

/** Single source of truth: regenerate week rows from semester settings (fallback to DB rows). */
function resolveCalendarWeeks(
  semester: ActiveSemester | null,
  dbWeeks: AcademicWeekRow[],
): AcademicWeekRow[] {
  if (!semester?.start_date || semester.weeks_count < 1) {
    if (dbWeeks.length > 0) return dbWeeks;
    const count =
      semester?.weeks_count && semester.weeks_count > 0 ? semester.weeks_count : FALLBACK_WEEKS;
    return fallbackWeeks(count);
  }

  try {
    return generateAcademicWeeks(semesterCalendarInput(semester)).map((w) => ({
      week_number: w.weekNumber,
      start_date: w.startDate,
      end_date: w.endDate,
    }));
  } catch {
    if (dbWeeks.length > 0) return dbWeeks;
    return fallbackWeeks(semester.weeks_count);
  }
}

/** Map ISO date → grade week/day columns using generated semester calendar. */
export function resolveSemesterDayForDate(
  calendar: AcademicCalendar,
  isoDate: string,
): SemesterDayRef | null {
  const sem = calendar.semester;
  if (!sem?.start_date || !isoDate) return null;

  const weeks = generateAcademicWeeks(semesterCalendarInput(sem));

  for (const w of weeks) {
    if (w.workingDayDates.includes(isoDate)) {
      return {
        iso: isoDate,
        weekNumber: w.weekNumber,
        dayKey: isoDateToDayKey(isoDate),
      };
    }
  }
  return null;
}

/** Today's working day in the active semester, or null (weekend/holiday/outside semester). */
export function getTodaySemesterDay(calendar: AcademicCalendar): SemesterDayRef | null {
  return resolveSemesterDayForDate(calendar, calendar.operationalDate);
}

function resolveWeekFromDbRows(weeks: AcademicWeekRow[], isoDate: string): number {
  if (weeks.length === 0) return 1;

  for (const w of weeks) {
    if (w.start_date && w.end_date && isoDate >= w.start_date && isoDate <= w.end_date) {
      return w.week_number;
    }
  }

  const first = weeks[0];
  if (first?.start_date && isoDate < first.start_date) return first.week_number;

  const last = weeks[weeks.length - 1];
  if (last?.end_date && isoDate > last.end_date) return last.week_number;

  // Gap days (e.g. Fri/Sat between Sun–Thu academic weeks): use the latest week that already started.
  let best = first?.week_number ?? 1;
  for (const w of weeks) {
    if (w.end_date && w.end_date <= isoDate) {
      best = w.week_number;
    }
  }
  return best;
}

/**
 * Resolve the academic week number for any calendar date.
 * On working days: exact match. On weekends/gaps/holidays: most recent started week.
 */
export function resolveAcademicWeekNumber(
  calendar: AcademicCalendar,
  isoDate: string,
): number {
  const sem = calendar.semester;
  if (!sem?.start_date || !isoDate) {
    return resolveWeekFromDbRows(calendar.weeks, isoDate);
  }

  let weeks;
  try {
    weeks = generateAcademicWeeks(semesterCalendarInput(sem));
  } catch {
    return resolveWeekFromDbRows(calendar.weeks, isoDate);
  }

  for (const w of weeks) {
    if (w.workingDayDates.includes(isoDate)) {
      return w.weekNumber;
    }
  }

  let bestWeek = 1;
  let bestDate = "";
  for (const w of weeks) {
    for (const d of w.workingDayDates) {
      if (d <= isoDate && d >= bestDate) {
        bestDate = d;
        bestWeek = w.weekNumber;
      }
    }
  }
  if (bestDate) return bestWeek;

  const firstWorking = weeks[0]?.workingDayDates[0];
  if (firstWorking && isoDate < firstWorking) return 1;

  return weeks[weeks.length - 1]?.weekNumber ?? 1;
}

/** Find academic week containing operational date (generated calendar first, then DB rows). */
export function resolveWeekForDate(
  weeks: AcademicWeekRow[],
  isoDate: string,
  calendar?: AcademicCalendar | null,
): number {
  if (calendar?.semester?.start_date) {
    return resolveAcademicWeekNumber(calendar, isoDate);
  }
  return resolveWeekFromDbRows(weeks, isoDate);
}

export function buildAcademicCalendar(
  semester: ActiveSemester | null,
  weeks: AcademicWeekRow[],
  now: Date = new Date(),
): AcademicCalendar {
  const operationalDate = getCalendarIsoDate(now);
  const currentDayKey = getCalendarDayKey(now);
  const resolvedWeeks = resolveCalendarWeeks(semester, weeks);

  const draft: AcademicCalendar = {
    semester,
    weeks: resolvedWeeks,
    currentWeekNumber: 1,
    currentDayKey,
    operationalDate,
  };
  const currentWeekNumber = resolveAcademicWeekNumber(draft, operationalDate);

  return { ...draft, currentWeekNumber };
}

export function getSelectableWeeks(calendar: AcademicCalendar): AcademicWeekRow[] {
  return calendar.weeks.filter((w) => w.week_number <= calendar.currentWeekNumber);
}

export function cacheActiveCalendar(calendar: AcademicCalendar): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(CACHE_KEY, JSON.stringify(calendar));
}

export function loadCachedCalendar(): AcademicCalendar | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AcademicCalendar;
  } catch {
    return null;
  }
}

/** Recompute week/day fields from cached semester data (always fresh local clock). */
function refreshCalendarNow(calendar: AcademicCalendar, now: Date = new Date()): AcademicCalendar {
  const operationalDate = getCalendarIsoDate(now);
  const currentDayKey = getCalendarDayKey(now);
  const weeks = resolveCalendarWeeks(calendar.semester, calendar.weeks);
  const draft = { ...calendar, weeks, operationalDate, currentDayKey };
  const currentWeekNumber = resolveAcademicWeekNumber(draft, operationalDate);
  return { ...draft, currentWeekNumber };
}

function calendarSemesterId(calendar: AcademicCalendar | null): string | null {
  return calendar?.semester?.id ?? null;
}

export async function fetchActiveCalendar(force = false): Promise<AcademicCalendar> {
  const cached = !force ? loadCachedCalendar() : null;

  const token = getToken();
  if (!token) {
    if (cached) {
      const fresh = refreshCalendarNow(cached);
      cacheActiveCalendar(fresh);
      return fresh;
    }
    const cal = buildAcademicCalendar(null, []);
    cacheActiveCalendar(cal);
    return cal;
  }

  try {
    const res = await secureGetActiveSemester({ data: { token } });
    const semester = parseSemester(res.semester);
    const weeks = parseWeeks(res.weeks);

    if (
      cached &&
      !force &&
      calendarSemesterId(cached) === semester?.id &&
      cached.semester?.start_date === semester?.start_date &&
      cached.semester?.weeks_count === semester?.weeks_count
    ) {
      const fresh = refreshCalendarNow({ ...cached, semester, weeks: resolveCalendarWeeks(semester, weeks) });
      cacheActiveCalendar(fresh);
      return fresh;
    }

    const cal = buildAcademicCalendar(semester, weeks);
    cacheActiveCalendar(cal);
    return cal;
  } catch {
    if (cached) {
      const fresh = refreshCalendarNow(cached);
      cacheActiveCalendar(fresh);
      return fresh;
    }
    const cal = buildAcademicCalendar(null, []);
    cacheActiveCalendar(cal);
    return cal;
  }
}

export function clearCalendarCache(): void {
  if (typeof window !== "undefined") sessionStorage.removeItem(CACHE_KEY);
}

/** Day keys (sun..thu) enabled for this semester's working_days. */
export const DAY_KEY_BY_JS: Record<number, string> = {
  0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat",
};

export function workingDayKeysFromSemester(workingDays: number[] | undefined): Set<string> {
  const days = workingDays?.length ? workingDays : [0, 1, 2, 3, 4];
  return new Set(days.map((d) => DAY_KEY_BY_JS[d]).filter(Boolean));
}

function semesterGeneratorInput(calendar: AcademicCalendar) {
  const sem = calendar.semester;
  if (!sem?.start_date) return null;
  return {
    startDate: sem.start_date,
    weeksCount: sem.weeks_count,
    workingDays: sem.working_days,
    excludedDates: holidayDateStrings(sem.excluded_dates),
  };
}

/** Status of a weekday column in a given academic week (holiday vs open for entry). */
export function getWeekDaySlot(
  calendar: AcademicCalendar,
  weekNumber: number,
  dayKey: string,
): AcademicWeekDaySlot | null {
  const input = semesterGeneratorInput(calendar);
  if (!input || weekNumber < 1) return null;
  return generateWeekDaySlots(input, weekNumber).find((s) => s.dayKey === dayKey) ?? null;
}

export function isWeekDayClosed(
  calendar: AcademicCalendar,
  weekNumber: number,
  dayKey: string,
): boolean {
  const slot = getWeekDaySlot(calendar, weekNumber, dayKey);
  if (!slot) return false;
  return !slot.isWorking;
}

export function formatWeekOptionLabel(week: AcademicWeekRow, isCurrent: boolean): string {
  const base = weekLabel(week.week_number);
  const range =
    week.start_date && week.end_date ? ` (${week.start_date} → ${week.end_date})` : "";
  return isCurrent ? `${base}${range} — الأسبوع الحالي` : `${base}${range}`;
}

// Re-export for table date checks
export { isoDateToDayKey };
