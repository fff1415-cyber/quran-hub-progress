/** Teacher-defined halaqa programs — fully separate from core grades (حفظ/ربط/مراجعة). */

import { DAYS } from "@/lib/mock-data";

export type ProgramScheduleMode = "weekdays" | "times_per_week";

export type HalaqaProgram = {
  id: string;
  name: string;
  scheduleMode: ProgramScheduleMode;
  /** Day keys (sun…thu) when scheduleMode = weekdays */
  weekdays: string[];
  /** 1–5 when scheduleMode = times_per_week */
  timesPerWeek: number;
  options: string[];
  /** Display weight for program summary (not merged into official grades) */
  maxScore: number;
  sortOrder: number;
  active: boolean;
};

export type HalaqaProgramsStore = Record<string, HalaqaProgram[]>;

/** studentId → weekNum → programId → slotKey → selected option */
export type HalaqaProgramGradesStore = Record<
  string,
  Record<string, Record<number, Record<string, Record<string, string>>>>
>;

const KEY_PROGRAMS = "qshatawi_halaqa_programs_v1";
const KEY_PROGRAM_GRADES = "qshatawi_halaqa_program_grades_v1";

function persistPrograms(value: HalaqaProgramsStore) {
  if (typeof window === "undefined" || !sessionStorage.getItem("qs_token")) return;
  if (sessionStorage.getItem("qs_syncing") === "1") return;
  void import("./cloud-sync").then((m) => m.pushAppState("halaqa_programs", value)).catch(() => undefined);
}

function persistProgramGrades(value: HalaqaProgramGradesStore) {
  if (typeof window === "undefined" || !sessionStorage.getItem("qs_token")) return;
  if (sessionStorage.getItem("qs_syncing") === "1") return;
  void import("./cloud-sync").then((m) => m.pushAppState("halaqa_program_grades", value)).catch(() => undefined);
}

export function loadAllHalaqaPrograms(): HalaqaProgramsStore {
  if (typeof window === "undefined") return {};
  const raw = localStorage.getItem(KEY_PROGRAMS);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as HalaqaProgramsStore;
  } catch {
    return {};
  }
}

export function saveAllHalaqaPrograms(store: HalaqaProgramsStore) {
  localStorage.setItem(KEY_PROGRAMS, JSON.stringify(store));
  persistPrograms(store);
}

export function loadHalaqaPrograms(halaqaId: number): HalaqaProgram[] {
  const list = loadAllHalaqaPrograms()[String(halaqaId)] ?? [];
  return [...list]
    .filter((p) => p.active !== false)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function loadHalaqaProgramsAll(halaqaId: number): HalaqaProgram[] {
  const list = loadAllHalaqaPrograms()[String(halaqaId)] ?? [];
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function saveHalaqaPrograms(halaqaId: number, programs: HalaqaProgram[]) {
  const store = loadAllHalaqaPrograms();
  store[String(halaqaId)] = programs.map((p, i) => ({ ...p, sortOrder: i }));
  saveAllHalaqaPrograms(store);
}

export function loadAllProgramGrades(): HalaqaProgramGradesStore {
  if (typeof window === "undefined") return {};
  const raw = localStorage.getItem(KEY_PROGRAM_GRADES);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as HalaqaProgramGradesStore;
  } catch {
    return {};
  }
}

export function saveAllProgramGrades(store: HalaqaProgramGradesStore) {
  localStorage.setItem(KEY_PROGRAM_GRADES, JSON.stringify(store));
  persistProgramGrades(store);
}

export function loadProgramGrades(halaqaId: number): HalaqaProgramGradesStore[string] {
  return loadAllProgramGrades()[String(halaqaId)] ?? {};
}

export function saveProgramGrades(halaqaId: number, grades: HalaqaProgramGradesStore[string]) {
  const store = loadAllProgramGrades();
  store[String(halaqaId)] = grades;
  saveAllProgramGrades(store);
}

export function newProgramId(): string {
  return `hp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function parseProgramOptionsInput(raw: string): string[] {
  return raw
    .split(/[\n,،|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function formatProgramOptionsInput(options: string[]): string {
  return options.join("، ");
}

export type ProgramSlot = { key: string; label: string };

/** Slots shown for a program in a given week (working days filtered). */
export function programSlots(program: HalaqaProgram, workingDayKeys: Set<string> | readonly string[]): ProgramSlot[] {
  const keySet = workingDayKeys instanceof Set ? workingDayKeys : new Set(workingDayKeys);
  if (program.scheduleMode === "weekdays") {
    return DAYS.filter((d) => keySet.has(d.key) && program.weekdays.includes(d.key)).map(
      (d) => ({ key: d.key, label: d.label }),
    );
  }
  const n = Math.max(1, Math.min(5, program.timesPerWeek || 1));
  return Array.from({ length: n }, (_, i) => ({
    key: `slot-${i}`,
    label: `المرة ${i + 1}`,
  }));
}

/** Option index score 0–100 within program (first option = best). */
export function programOptionScore(options: string[], value: string, maxScore: number): number {
  if (!value || options.length === 0) return 0;
  const idx = options.indexOf(value);
  if (idx < 0) return 0;
  if (options.length === 1) return maxScore;
  const ratio = 1 - idx / (options.length - 1);
  return Math.round(maxScore * ratio);
}

export function studentProgramWeekScore(
  program: HalaqaProgram,
  slots: ProgramSlot[],
  values: Record<string, string> | undefined,
): number {
  if (slots.length === 0) return 0;
  let total = 0;
  let filled = 0;
  for (const slot of slots) {
    const v = values?.[slot.key];
    if (v) {
      filled++;
      total += programOptionScore(program.options, v, program.maxScore);
    }
  }
  if (filled === 0) return 0;
  return Math.round(total / filled);
}

export const SCHEDULE_MODE_LABELS: Record<ProgramScheduleMode, string> = {
  weekdays: "أيام محددة",
  times_per_week: "عدد مرات في الأسبوع",
};
