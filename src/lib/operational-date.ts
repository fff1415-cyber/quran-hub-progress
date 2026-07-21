// Day keys align with JS getDay(): 0=Sunday … 6=Saturday (matches DAYS in mock-data).
const DAY_KEYS: Record<number, string> = {
  0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat",
};

/** YYYY-MM-DD in the browser's local timezone (never UTC via toISOString). */
export function formatLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Wall-clock calendar date (local timezone). */
export function getCalendarIsoDate(now: Date = new Date()): string {
  return formatLocalIsoDate(new Date(now));
}

/** Wall-clock weekday column key (sun…sat) from local getDay(). */
export function getCalendarDayKey(now: Date = new Date()): string {
  const d = new Date(now);
  return DAY_KEYS[d.getDay()] ?? "sun";
}

/**
 * "Operational date" — rolls over at 2pm for business-day archives / daily reset.
 * Before 2pm local time the previous calendar date is used.
 */
export function getOperationalDate(now: Date = new Date()): string {
  const d = new Date(now);
  if (d.getHours() < 14) {
    d.setDate(d.getDate() - 1);
  }
  return formatLocalIsoDate(d);
}

/**
 * Weekday column for attendance tables — always matches the local calendar day
 * (what users see on the wall clock), not the pre-2pm operational rollback.
 */
export function getOperationalDayKey(now: Date = new Date()): string {
  return getCalendarDayKey(now);
}

/** Map a local YYYY-MM-DD string to a weekday column key. */
export function isoDateToDayKey(iso: string): string {
  const [y, m, day] = iso.split("-").map(Number);
  if (!y || !m || !day) return "sun";
  const d = new Date(y, m - 1, day);
  return DAY_KEYS[d.getDay()] ?? "sun";
}
