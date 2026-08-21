/** Named holiday / excluded date in the academic semester calendar. */

export interface SemesterHoliday {
  date: string;
  name: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeHolidayDate(raw: string): string {
  return raw.slice(0, 10);
}

/** Parse API/local storage — supports legacy string[] and { date, name }[]. */
export function parseSemesterHolidays(raw: unknown): SemesterHoliday[] {
  if (!Array.isArray(raw)) return [];
  const out: SemesterHoliday[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const date = normalizeHolidayDate(item);
      if (ISO_DATE.test(date)) out.push({ date, name: "" });
      continue;
    }
    if (item && typeof item === "object") {
      const row = item as Record<string, unknown>;
      const date = normalizeHolidayDate(String(row.date ?? ""));
      if (!ISO_DATE.test(date)) continue;
      const name = String(row.name ?? "").trim();
      out.push({ date, name });
    }
  }
  return sortSemesterHolidays(out);
}

export function sortSemesterHolidays(holidays: SemesterHoliday[]): SemesterHoliday[] {
  return [...holidays].sort((a, b) => a.date.localeCompare(b.date));
}

export function holidayDateStrings(holidays: SemesterHoliday[]): string[] {
  return holidays.map((h) => h.date);
}

export function serializeSemesterHolidays(holidays: SemesterHoliday[]): SemesterHoliday[] {
  return sortSemesterHolidays(
    holidays.map((h) => ({
      date: normalizeHolidayDate(h.date),
      name: h.name.trim(),
    })),
  );
}

export function holidayDisplayLabel(h: SemesterHoliday): string {
  return h.name ? `${h.name} (${h.date})` : h.date;
}
