/** Teacher-defined halaqa programs — fully separate from core grades (حفظ/ربط/مراجعة). */

export type ProgramScheduleMode = "weekdays" | "times_per_week";

export type ProgramLevel = {
  label: string;
  /** Points awarded when this level is selected */
  score: number;
};

export type HalaqaProgram = {
  id: string;
  name: string;
  scheduleMode: ProgramScheduleMode;
  /** Day keys when scheduleMode = weekdays */
  weekdays: string[];
  /** 1–7 when scheduleMode = times_per_week */
  timesPerWeek: number;
  levels: ProgramLevel[];
  sortOrder: number;
  active: boolean;
};

/** @deprecated legacy field — migrated to levels on load */
type LegacyHalaqaProgram = HalaqaProgram & {
  options?: string[];
  maxScore?: number;
};

export type HalaqaProgramsStore = Record<string, HalaqaProgram[]>;

/** studentId → weekNum → programId → slotKey → selected level label */
export type HalaqaProgramGradesStore = Record<
  string,
  Record<string, Record<number, Record<string, Record<string, string>>>>
>;

export const PROGRAM_DAYS = [
  { key: "sun", label: "الأحد" },
  { key: "mon", label: "الاثنين" },
  { key: "tue", label: "الثلاثاء" },
  { key: "wed", label: "الأربعاء" },
  { key: "thu", label: "الخميس" },
  { key: "fri", label: "الجمعة" },
  { key: "sat", label: "السبت" },
] as const;

const KEY_PROGRAMS = "qshatawi_halaqa_programs_v1";
const KEY_PROGRAM_GRADES = "qshatawi_halaqa_program_grades_v1";

const DEFAULT_LEVELS: ProgramLevel[] = [
  { label: "ممتاز", score: 100 },
  { label: "جيد", score: 75 },
  { label: "ضعيف", score: 50 },
];

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

export function normalizeProgram(raw: LegacyHalaqaProgram): HalaqaProgram {
  if (raw.levels?.length) {
    const { options: _o, maxScore: _m, ...rest } = raw;
    return {
      ...rest,
      levels: raw.levels.map((l) => ({
        label: l.label.trim(),
        score: Math.max(0, Number(l.score) || 0),
      })).filter((l) => l.label),
    };
  }
  const options = raw.options ?? [];
  const max = raw.maxScore ?? 100;
  const levels: ProgramLevel[] = options.map((label, i) => ({
    label: label.trim(),
    score:
      options.length === 1
        ? max
        : Math.round(max * (1 - i / Math.max(1, options.length - 1))),
  })).filter((l) => l.label);
  const { options: _o, maxScore: _m, ...rest } = raw;
  return {
    ...rest,
    levels: levels.length ? levels : [...DEFAULT_LEVELS],
  };
}

function normalizeStore(store: HalaqaProgramsStore): HalaqaProgramsStore {
  const out: HalaqaProgramsStore = {};
  for (const [id, list] of Object.entries(store)) {
    out[id] = (list ?? []).map((p) => normalizeProgram(p as LegacyHalaqaProgram));
  }
  return out;
}

export function loadAllHalaqaPrograms(): HalaqaProgramsStore {
  if (typeof window === "undefined") return {};
  const raw = localStorage.getItem(KEY_PROGRAMS);
  if (!raw) return {};
  try {
    return normalizeStore(JSON.parse(raw) as HalaqaProgramsStore);
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
  store[String(halaqaId)] = programs.map((p, i) => ({
    ...normalizeProgram(p),
    sortOrder: i,
  }));
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

export function programMaxSlotScore(program: HalaqaProgram): number {
  if (program.levels.length === 0) return 0;
  return Math.max(...program.levels.map((l) => l.score));
}

export function programLevelLabels(program: HalaqaProgram): string[] {
  return program.levels.map((l) => l.label);
}

export type ProgramSlot = { key: string; label: string };

/** Slots for a program in a given week — teacher-selected days, not semester working_days. */
export function programSlots(program: HalaqaProgram): ProgramSlot[] {
  if (program.scheduleMode === "weekdays") {
    return PROGRAM_DAYS.filter((d) => program.weekdays.includes(d.key)).map((d) => ({
      key: d.key,
      label: d.label,
    }));
  }
  const n = Math.max(1, Math.min(7, program.timesPerWeek || 1));
  return Array.from({ length: n }, (_, i) => ({
    key: `slot-${i}`,
    label: `المرة ${i + 1}`,
  }));
}

export function programLevelScore(program: HalaqaProgram, value: string): number {
  if (!value) return 0;
  const level = program.levels.find((l) => l.label === value);
  return level?.score ?? 0;
}

export type ProgramWeekTotals = {
  earned: number;
  maxPossible: number;
  percent: number;
  filledSlots: number;
  totalSlots: number;
};

/** Sum all programs for one student in one week (number + percentage). */
export function studentAllProgramsWeekTotals(
  programs: HalaqaProgram[],
  grades: HalaqaProgramGradesStore[string] | undefined,
  studentId: string,
  weekNum: number,
): ProgramWeekTotals {
  let earned = 0;
  let maxPossible = 0;
  let filledSlots = 0;
  let totalSlots = 0;

  for (const program of programs) {
    const slots = programSlots(program);
    const slotMax = programMaxSlotScore(program);
    const vals = grades?.[studentId]?.[weekNum]?.[program.id];
    for (const slot of slots) {
      totalSlots++;
      maxPossible += slotMax;
      const v = vals?.[slot.key];
      if (v) {
        filledSlots++;
        earned += programLevelScore(program, v);
      }
    }
  }

  const percent = maxPossible > 0 ? Math.round((earned / maxPossible) * 100) : 0;
  return { earned, maxPossible, percent, filledSlots, totalSlots };
}

/** Period totals across weeks (for export). */
export function studentAllProgramsPeriodTotals(
  programs: HalaqaProgram[],
  grades: HalaqaProgramGradesStore[string] | undefined,
  studentId: string,
  weekNums: number[],
): ProgramWeekTotals {
  let earned = 0;
  let maxPossible = 0;
  let filledSlots = 0;
  let totalSlots = 0;

  for (const weekNum of weekNums) {
    const w = studentAllProgramsWeekTotals(programs, grades, studentId, weekNum);
    earned += w.earned;
    maxPossible += w.maxPossible;
    filledSlots += w.filledSlots;
    totalSlots += w.totalSlots;
  }

  const percent = maxPossible > 0 ? Math.round((earned / maxPossible) * 100) : 0;
  return { earned, maxPossible, percent, filledSlots, totalSlots };
}

export const SCHEDULE_MODE_LABELS: Record<ProgramScheduleMode, string> = {
  weekdays: "أيام محددة",
  times_per_week: "عدد مرات في الأسبوع",
};

export function defaultNewProgram(sortOrder: number): HalaqaProgram {
  return {
    id: newProgramId(),
    name: "",
    scheduleMode: "weekdays",
    weekdays: ["sun", "mon", "tue", "wed", "thu"],
    timesPerWeek: 2,
    levels: DEFAULT_LEVELS.map((l) => ({ ...l })),
    sortOrder,
    active: true,
  };
}
