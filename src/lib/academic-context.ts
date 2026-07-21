import { getOperationalDate, getOperationalDayKey, isoDateToDayKey } from "@/lib/operational-date";
import { getToken } from "@/lib/cloud-sync";
import { secureGetActiveSemester } from "@/lib/secure-data.functions";
import { weekLabel } from "@/lib/arabic-numbers";

export interface ActiveSemester {
  id: string;
  name: string;
  start_date: string;
  weeks_count: number;
  working_days: number[];
  excluded_dates: string[];
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

const CACHE_KEY = "qs_active_calendar_v1";
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
    excluded_dates: Array.isArray(s.excluded_dates) ? s.excluded_dates.map(String) : [],
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

/** Find academic week containing operational date (inclusive range). */
export function resolveWeekForDate(weeks: AcademicWeekRow[], isoDate: string): number {
  if (weeks.length === 0) return 1;
  for (const w of weeks) {
    if (w.start_date && w.end_date && isoDate >= w.start_date && isoDate <= w.end_date) {
      return w.week_number;
    }
  }
  const first = weeks[0];
  if (first.start_date && isoDate < first.start_date) return first.week_number;
  return weeks[weeks.length - 1]?.week_number ?? 1;
}

export function buildAcademicCalendar(
  semester: ActiveSemester | null,
  weeks: AcademicWeekRow[],
  now: Date = new Date(),
): AcademicCalendar {
  const operationalDate = getOperationalDate(now);
  const currentDayKey = getOperationalDayKey(now);

  let resolvedWeeks = weeks;
  if (resolvedWeeks.length === 0) {
    const count = semester?.weeks_count && semester.weeks_count > 0 ? semester.weeks_count : FALLBACK_WEEKS;
    resolvedWeeks = fallbackWeeks(count);
  }

  const currentWeekNumber = resolveWeekForDate(resolvedWeeks, operationalDate);

  return {
    semester,
    weeks: resolvedWeeks,
    currentWeekNumber,
    currentDayKey,
    operationalDate,
  };
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

export async function fetchActiveCalendar(force = false): Promise<AcademicCalendar> {
  if (!force) {
    const cached = loadCachedCalendar();
    if (cached) return cached;
  }

  const token = getToken();
  if (!token) {
    const cal = buildAcademicCalendar(null, []);
    cacheActiveCalendar(cal);
    return cal;
  }

  try {
    const res = await secureGetActiveSemester({ data: { token } });
    const semester = parseSemester(res.semester);
    const weeks = parseWeeks(res.weeks);
    const cal = buildAcademicCalendar(semester, weeks);
    cacheActiveCalendar(cal);
    return cal;
  } catch {
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

export function formatWeekOptionLabel(week: AcademicWeekRow, isCurrent: boolean): string {
  const base = weekLabel(week.week_number);
  const range =
    week.start_date && week.end_date ? ` (${week.start_date} → ${week.end_date})` : "";
  return isCurrent ? `${base}${range} — الأسبوع الحالي` : `${base}${range}`;
}

// Re-export for table date checks
export { isoDateToDayKey };
