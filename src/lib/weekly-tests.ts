/**
 * Weekly tests track — independent from semester overall % and plan progress.
 * Slot counts configured by manager (muraja_slots, rabt_slots).
 */
import { hasAuthToken } from "@/lib/auth-session";

import type { AcademicCalendar } from "@/lib/academic-context";
import type { Student } from "@/lib/mock-data";

export type WeeklyTestResult = "" | "pass" | "fail";

export interface StudentWeeklyTests {
  muraja: WeeklyTestResult[];
  /** Legacy rows may store a single string; normalized to array on read. */
  rabt: WeeklyTestResult | WeeklyTestResult[];
}

export type WeeklyTestsStore = Record<string, Record<number, StudentWeeklyTests>>;

export interface WeeklyTestsSettings {
  enabled: boolean;
  muraja_slots: number;
  rabt_slots: number;
  muraja_pass_points: number;
  muraja_fail_points: number;
  rabt_pass_points: number;
  rabt_fail_points: number;
}

export const DEFAULT_WEEKLY_TESTS_SETTINGS: WeeklyTestsSettings = {
  enabled: true,
  muraja_slots: 3,
  rabt_slots: 1,
  muraja_pass_points: 10,
  muraja_fail_points: 3,
  rabt_pass_points: 15,
  rabt_fail_points: 5,
};

const KEY_STORE = "qshatawi_weekly_tests_v1";
const KEY_SETTINGS = "qshatawi_weekly_tests_settings_v1";
const KEY_SEMESTER = "qshatawi_weekly_tests_semester_v1";

function clampSlots(n: number, min: number, max: number): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

export function normalizeWeeklyTestsSettings(raw: Partial<WeeklyTestsSettings>): WeeklyTestsSettings {
  return {
    ...DEFAULT_WEEKLY_TESTS_SETTINGS,
    ...raw,
    muraja_slots: clampSlots(raw.muraja_slots ?? DEFAULT_WEEKLY_TESTS_SETTINGS.muraja_slots, 1, 6),
    rabt_slots: clampSlots(raw.rabt_slots ?? DEFAULT_WEEKLY_TESTS_SETTINGS.rabt_slots, 0, 3),
  };
}

function persistStore(value: WeeklyTestsStore) {
  if (typeof window === "undefined" || !hasAuthToken()) return;
  if (sessionStorage.getItem("qs_syncing") === "1") return;
  void import("./cloud-sync").then((m) => m.pushAppState("weekly_tests", value)).catch(() => undefined);
}

function persistSettings(value: WeeklyTestsSettings) {
  if (typeof window === "undefined" || !hasAuthToken()) return;
  if (sessionStorage.getItem("qs_syncing") === "1") return;
  void import("./cloud-sync").then((m) => m.pushAppState("weekly_tests_settings", value)).catch(() => undefined);
}

export function emptyWeeklyTests(settings = DEFAULT_WEEKLY_TESTS_SETTINGS): StudentWeeklyTests {
  const s = normalizeWeeklyTestsSettings(settings);
  return {
    muraja: Array.from({ length: s.muraja_slots }, () => "" as WeeklyTestResult),
    rabt: Array.from({ length: s.rabt_slots }, () => "" as WeeklyTestResult),
  };
}

function normalizeRabt(
  rabt: WeeklyTestResult | WeeklyTestResult[] | undefined,
  slots: number,
): WeeklyTestResult[] {
  const empty = Array.from({ length: slots }, () => "" as WeeklyTestResult);
  if (slots === 0) return [];
  if (Array.isArray(rabt)) {
    rabt.forEach((v, i) => {
      if (i < slots) empty[i] = v ?? "";
    });
    return empty;
  }
  if (typeof rabt === "string" && rabt !== "") empty[0] = rabt;
  return empty;
}

function normalizeMuraja(
  muraja: WeeklyTestResult[] | undefined,
  slots: number,
): WeeklyTestResult[] {
  const empty = Array.from({ length: slots }, () => "" as WeeklyTestResult);
  if (!muraja?.length) return empty;
  muraja.forEach((v, i) => {
    if (i < slots) empty[i] = v ?? "";
  });
  return empty;
}

export function loadWeeklyTests(): WeeklyTestsStore {
  if (typeof window === "undefined") return {};
  const raw = localStorage.getItem(KEY_STORE);
  return raw ? JSON.parse(raw) : {};
}

export function saveWeeklyTests(store: WeeklyTestsStore) {
  localStorage.setItem(KEY_STORE, JSON.stringify(store));
  persistStore(store);
}

export function loadWeeklyTestsSettings(): WeeklyTestsSettings {
  if (typeof window === "undefined") return { ...DEFAULT_WEEKLY_TESTS_SETTINGS };
  const raw = localStorage.getItem(KEY_SETTINGS);
  if (!raw) return { ...DEFAULT_WEEKLY_TESTS_SETTINGS };
  try {
    return normalizeWeeklyTestsSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_WEEKLY_TESTS_SETTINGS };
  }
}

export function saveWeeklyTestsSettings(settings: WeeklyTestsSettings) {
  const normalized = normalizeWeeklyTestsSettings(settings);
  localStorage.setItem(KEY_SETTINGS, JSON.stringify(normalized));
  persistSettings(normalized);
}

export function getWeeklyTestsSemesterId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY_SEMESTER);
}

export function setWeeklyTestsSemesterId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(KEY_SEMESTER, id);
  else localStorage.removeItem(KEY_SEMESTER);
}

export function resetWeeklyTestsForNewSemester(semesterId: string | null) {
  saveWeeklyTests({});
  setWeeklyTestsSemesterId(semesterId);
}

export function ensureWeeklyTestsSemester(semesterId: string | null): boolean {
  if (!semesterId) return false;
  const current = getWeeklyTestsSemesterId();
  if (current && current !== semesterId) {
    resetWeeklyTestsForNewSemester(semesterId);
    return true;
  }
  if (!current) setWeeklyTestsSemesterId(semesterId);
  return false;
}

export function getStudentWeeklyTests(
  store: WeeklyTestsStore,
  studentId: string,
  weekNum: number,
  settings = DEFAULT_WEEKLY_TESTS_SETTINGS,
): StudentWeeklyTests {
  const s = normalizeWeeklyTestsSettings(settings);
  const row = store[studentId]?.[weekNum];
  if (!row) return emptyWeeklyTests(s);
  return {
    muraja: normalizeMuraja(row.muraja, s.muraja_slots),
    rabt: normalizeRabt(row.rabt, s.rabt_slots),
  };
}

function rabtAt(row: StudentWeeklyTests, index: number): WeeklyTestResult {
  const r = row.rabt;
  if (Array.isArray(r)) return r[index] ?? "";
  return index === 0 ? (r ?? "") : "";
}

function resultPoints(result: WeeklyTestResult, passPts: number, failPts: number): number {
  if (result === "pass") return passPts;
  if (result === "fail") return failPts;
  return 0;
}

export function weekTestsMaxPoints(settings: WeeklyTestsSettings): number {
  const s = normalizeWeeklyTestsSettings(settings);
  return s.muraja_slots * s.muraja_pass_points + s.rabt_slots * s.rabt_pass_points;
}

export function scoreWeeklyTests(
  row: StudentWeeklyTests,
  settings: WeeklyTestsSettings = DEFAULT_WEEKLY_TESTS_SETTINGS,
): { earned: number; max: number; percent: number } {
  const s = normalizeWeeklyTestsSettings(settings);
  let earned = 0;
  for (let i = 0; i < s.muraja_slots; i++) {
    earned += resultPoints(row.muraja[i] ?? "", s.muraja_pass_points, s.muraja_fail_points);
  }
  for (let i = 0; i < s.rabt_slots; i++) {
    earned += resultPoints(rabtAt(row, i), s.rabt_pass_points, s.rabt_fail_points);
  }
  const max = weekTestsMaxPoints(s);
  const percent = max > 0 ? Math.round((earned / max) * 1000) / 10 : 0;
  return { earned, max, percent };
}

export function weekTestsCompletion(row: StudentWeeklyTests, settings: WeeklyTestsSettings): {
  murajaDone: number;
  murajaTotal: number;
  rabtDone: number;
  rabtTotal: number;
} {
  const s = normalizeWeeklyTestsSettings(settings);
  const murajaDone = row.muraja.slice(0, s.muraja_slots).filter((r) => r !== "").length;
  let rabtDone = 0;
  for (let i = 0; i < s.rabt_slots; i++) {
    if (rabtAt(row, i) !== "") rabtDone++;
  }
  return {
    murajaDone,
    murajaTotal: s.muraja_slots,
    rabtDone,
    rabtTotal: s.rabt_slots,
  };
}

export function cumulativeWeeklyTestsPercent(
  store: WeeklyTestsStore,
  studentId: string,
  throughWeek: number,
  settings: WeeklyTestsSettings = DEFAULT_WEEKLY_TESTS_SETTINGS,
): number {
  if (throughWeek < 1) return 0;
  let sum = 0;
  let count = 0;
  for (let w = 1; w <= throughWeek; w++) {
    const row = getStudentWeeklyTests(store, studentId, w, settings);
    sum += scoreWeeklyTests(row, settings).percent;
    count++;
  }
  return count > 0 ? Math.round((sum / count) * 10) / 10 : 0;
}

export function halaqaWeeklyTestsAverage(
  students: Student[],
  store: WeeklyTestsStore,
  weekNum: number,
  settings: WeeklyTestsSettings,
  mode: "week" | "cumulative",
): number {
  if (students.length === 0) return 0;
  const sum = students.reduce((acc, s) => {
    if (mode === "week") {
      const row = getStudentWeeklyTests(store, s.id, weekNum, settings);
      return acc + scoreWeeklyTests(row, settings).percent;
    }
    return acc + cumulativeWeeklyTestsPercent(store, s.id, weekNum, settings);
  }, 0);
  return Math.round((sum / students.length) * 10) / 10;
}

export interface HalaqaWeeklyTestsRank {
  halaqaId: number;
  halaqaName: string;
  weekPercent: number;
  cumulativePercent: number;
  completionMuraja: number;
  completionRabt: number;
  studentsTotal: number;
}

export function rankHalaqatByWeeklyTests(
  halaqat: { id: number; name: string; isTalqeen: boolean }[],
  students: Student[],
  store: WeeklyTestsStore,
  calendar: AcademicCalendar,
  settings: WeeklyTestsSettings,
): HalaqaWeeklyTestsRank[] {
  const weekNum = calendar.currentWeekNumber;
  return halaqat
    .filter((h) => !h.isTalqeen)
    .map((h) => {
      const hs = students.filter((s) => s.halaqaId === h.id);
      let murDone = 0;
      let murTotal = 0;
      let rabDone = 0;
      let rabTotal = 0;
      hs.forEach((s) => {
        const row = getStudentWeeklyTests(store, s.id, weekNum, settings);
        const c = weekTestsCompletion(row, settings);
        murDone += c.murajaDone;
        murTotal += c.murajaTotal;
        rabDone += c.rabtDone;
        rabTotal += c.rabtTotal;
      });
      return {
        halaqaId: h.id,
        halaqaName: h.name,
        weekPercent: halaqaWeeklyTestsAverage(hs, store, weekNum, settings, "week"),
        cumulativePercent: halaqaWeeklyTestsAverage(hs, store, weekNum, settings, "cumulative"),
        completionMuraja: murTotal ? Math.round((murDone / murTotal) * 100) : 0,
        completionRabt: rabTotal ? Math.round((rabDone / rabTotal) * 100) : 0,
        studentsTotal: hs.length,
      };
    })
    .sort((a, b) => b.cumulativePercent - a.cumulativePercent);
}

export function formatWeeklyTestPercent(pct: number): string {
  return `${pct % 1 === 0 ? Math.round(pct) : pct.toFixed(1)}%`;
}

export const WEEKLY_TEST_RESULT_LABEL: Record<WeeklyTestResult, string> = {
  "": "—",
  pass: "ناجح",
  fail: "راسب",
};
