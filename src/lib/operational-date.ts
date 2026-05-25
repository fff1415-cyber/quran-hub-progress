// "Operational date" — the day rolls over at 2pm daily.
// Before 2pm we still show yesterday's data; at/after 2pm the new day begins.
export function getOperationalDate(now: Date = new Date()): string {
  const d = new Date(now);
  if (d.getHours() < 14) {
    d.setDate(d.getDate() - 1);
  }
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

const DAY_KEYS: Record<number, string> = {
  0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat",
};

export function getOperationalDayKey(now: Date = new Date()): string {
  const d = new Date(now);
  if (d.getHours() < 14) d.setDate(d.getDate() - 1);
  return DAY_KEYS[d.getDay()] || "sun";
}
