/**
 * Verify calendar weeks stay aligned after a holiday (no packing into the next week).
 * Run: node scripts/verify-calendar-weeks.mjs
 */
import {
  generateAcademicWeeks,
  generateWeekDaySlots,
} from "../src/lib/calendar-generator.ts";

function fail(msg) {
  console.error("FAIL:", msg);
  process.exitCode = 1;
}

const base = {
  startDate: "2026-08-02",
  weeksCount: 4,
  workingDays: [0, 1, 2, 3, 4],
  excludedDates: [],
};

const withHoliday = { ...base, excludedDates: ["2026-08-13"] };

const A = generateAcademicWeeks(base);
const B = generateAcademicWeeks(withHoliday);

if (A[1].workingDayDates.join() !== "2026-08-09,2026-08-10,2026-08-11,2026-08-12,2026-08-13") {
  fail("week 2 without holiday should be Sun–Thu 9–13");
}
if (B[1].workingDayDates.join() !== "2026-08-09,2026-08-10,2026-08-11,2026-08-12") {
  fail("week 2 with Thu holiday must drop 13 without adding 16: " + B[1].workingDayDates.join());
}
if (B[2].workingDayDates[0] !== "2026-08-16") {
  fail("Aug 16 must remain week 3 Sunday, got " + B[2].workingDayDates.join());
}
if (A[2].workingDayDates[0] !== B[2].workingDayDates[0]) {
  fail("week 3 start must not shift after holiday");
}

const keys = generateWeekDaySlots(withHoliday, 2).filter((s) => s.isWorking || s.isHoliday).map((s) => s.dayKey);
if (keys.filter((k) => k === "sun").length !== 1) fail("week 2 must not contain two Sundays");
const thu = generateWeekDaySlots(withHoliday, 2).find((s) => s.dayKey === "thu");
if (!thu?.isHoliday) fail("Aug 13 Thursday must be marked holiday");
if (thu.isWorking) fail("holiday Thursday must not be working");

if (!process.exitCode) console.log("verify-calendar-weeks: ok");
