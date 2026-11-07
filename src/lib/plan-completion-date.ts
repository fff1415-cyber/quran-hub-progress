import { getWeekDaySlot, type AcademicCalendar } from "@/lib/academic-context";

/** Capture the date of the selected calendar cell before queued work runs. */
export function planCompletionDate(calendar: AcademicCalendar, week: number, dayKey: string): string | null {
  return getWeekDaySlot(calendar, week, dayKey)?.iso ?? null;
}
