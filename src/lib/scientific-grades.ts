/** Teacher-configured numeric scores — reflected in halaqa program totals only. */
import { hasAuthToken } from "@/lib/auth-session";
import { ATTENDANCE_OPTION_LABELS, type AttendanceOption } from "@/lib/grade-input-settings";
import type { DayEntry, GradesStore } from "@/lib/mock-data";

import {
  SCIENTIFIC_PROGRAM_ID,
  ensureScientificHalaqaProgram,
  removeScientificHalaqaProgram,
  type ScientificGradeField,
} from "@/lib/scientific-grades-program";

export type { ScientificGradeField };

export type ScientificFieldsConfig = Record<ScientificGradeField, boolean>;

export type ScientificAttendanceScores = Partial<Record<AttendanceOption, string>>;

export type ScientificDefaultScores = {
  attendance?: ScientificAttendanceScores;
  hifz?: string;
  rabt?: string;
  muraja?: string;
};

export type ScientificGradesConfig = {
  /** Teacher enabled the scientific program for this halaqa. */
  visible: boolean;
  fields: ScientificFieldsConfig;
  /** Fixed scores per halaqa — set by teacher when enabling the program. */
  defaultScores: ScientificDefaultScores;
};

export type ScientificDayScores = Partial<Record<ScientificGradeField, string>>;

/** halaqaId → studentId → weekNum → dayKey → scores */
export type ScientificGradesDataStore = Record<
  string,
  Record<string, Record<number, Record<string, ScientificDayScores>>>
>;

export type ScientificOverrideStore = Record<
  string,
  Record<string, Record<number, Record<string, Partial<Record<ScientificGradeField, true>>>>>
>;

export type ScientificGradesStore = {
  configs: Record<string, ScientificGradesConfig>;
  data: ScientificGradesDataStore;
  /** Teacher manually edited scores — skip auto-default until prep changes. */
  overrides?: ScientificOverrideStore;
};

const KEY = "qshatawi_scientific_grades_v1";
export const SCIENTIFIC_GRADES_CHANGED_EVENT = "qs-scientific-grades-changed";

const SCIENTIFIC_CLOUD_DEBOUNCE_MS = 800;
let scientificCloudTimer: ReturnType<typeof setTimeout> | null = null;
let pendingScientificCloud: ScientificGradesStore | null = null;

function notifyScientificGradesChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SCIENTIFIC_GRADES_CHANGED_EVENT));
}

export const SCIENTIFIC_FIELD_LABELS: Record<ScientificGradeField, string> = {
  attendance: "الحضور",
  hifz: "الحفظ",
  rabt: "الربط",
  muraja: "المراجعة",
};

export const SCIENTIFIC_TOTAL_LABELS: Record<ScientificGradeField, string> = {
  attendance: "مجموع الحضور",
  hifz: "مجموع الحفظ",
  rabt: "مجموع الربط",
  muraja: "مجموع المراجعة",
};

export const ALL_SCIENTIFIC_FIELDS: ScientificGradeField[] = [
  "attendance",
  "hifz",
  "rabt",
  "muraja",
];

export const ALL_SCIENTIFIC_ATTENDANCE_OPTIONS: AttendanceOption[] = [
  "present",
  "late",
  "excused",
  "absent",
];

export function defaultScientificFields(): ScientificFieldsConfig {
  return { attendance: false, hifz: false, rabt: false, muraja: false };
}

export function defaultScientificConfig(): ScientificGradesConfig {
  return { visible: false, fields: defaultScientificFields(), defaultScores: {} };
}

function normalizeAttendanceScores(raw: unknown): ScientificAttendanceScores {
  const out: ScientificAttendanceScores = {};
  if (!raw || typeof raw !== "object") return out;
  for (const opt of ALL_SCIENTIFIC_ATTENDANCE_OPTIONS) {
    const v = (raw as Record<string, unknown>)[opt];
    if (typeof v === "string" && v.trim() !== "") {
      out[opt] = v.trim();
    }
  }
  return out;
}

function normalizeDefaultScores(raw: unknown): ScientificDefaultScores {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const out: ScientificDefaultScores = {};

  if (typeof obj.attendance === "string" && obj.attendance.trim() !== "") {
    out.attendance = { present: obj.attendance.trim() };
  } else if (obj.attendance && typeof obj.attendance === "object") {
    out.attendance = normalizeAttendanceScores(obj.attendance);
  }

  for (const field of ["hifz", "rabt", "muraja"] as const) {
    const v = obj[field];
    if (typeof v === "string" && v.trim() !== "") {
      out[field] = v.trim();
    }
  }

  return out;
}

/** Resolve the manager-configured score for one field given the day's entry. */
export function resolveScientificScore(
  config: ScientificGradesConfig,
  field: ScientificGradeField,
  entry: DayEntry,
): string {
  if (!config.fields[field]) return "";

  switch (field) {
    case "attendance": {
      const att = entry.attendance;
      if (!att) return "";
      return config.defaultScores.attendance?.[att]?.trim() ?? "";
    }
    case "hifz":
      return entry.hifz !== "" ? (config.defaultScores.hifz?.trim() ?? "") : "";
    case "rabt":
      return entry.rabt !== "" ? (config.defaultScores.rabt?.trim() ?? "") : "";
    case "muraja":
      return entry.muraja !== "" ? (config.defaultScores.muraja?.trim() ?? "") : "";
    default:
      return "";
  }
}

function persist(store: ScientificGradesStore) {
  if (typeof window === "undefined" || !hasAuthToken()) return;
  if (sessionStorage.getItem("qs_syncing") === "1") return;
  pendingScientificCloud = store;
  if (scientificCloudTimer) clearTimeout(scientificCloudTimer);
  scientificCloudTimer = setTimeout(() => {
    scientificCloudTimer = null;
    const payload = pendingScientificCloud;
    pendingScientificCloud = null;
    if (!payload) return;
    void import("./cloud-sync")
      .then((m) => m.pushMergedScientificGrades(payload))
      .catch(() => undefined);
  }, SCIENTIFIC_CLOUD_DEBOUNCE_MS);
}

export function loadScientificGradesStore(): ScientificGradesStore {
  if (typeof window === "undefined") {
    return { configs: {}, data: {}, overrides: {} };
  }
  const raw = localStorage.getItem(KEY);
  if (!raw) return { configs: {}, data: {}, overrides: {} };
  try {
    const parsed = JSON.parse(raw) as Partial<ScientificGradesStore>;
    return {
      configs: parsed.configs ?? {},
      data: parsed.data ?? {},
      overrides: parsed.overrides ?? {},
    };
  } catch {
    return { configs: {}, data: {}, overrides: {} };
  }
}

export function saveScientificGradesStore(store: ScientificGradesStore) {
  localStorage.setItem(KEY, JSON.stringify(store));
  notifyScientificGradesChanged();
  persist(store);
}

export function loadScientificConfig(halaqaId: number): ScientificGradesConfig {
  const cfg = loadScientificGradesStore().configs[String(halaqaId)];
  if (!cfg) return defaultScientificConfig();
  const fields = { ...defaultScientificFields(), ...cfg.fields };
  const enabled = enabledScientificFields(fields);
  return {
    // Legacy rows may have fields enabled before visible was persisted.
    visible: !!cfg.visible || enabled.length > 0,
    fields,
    defaultScores: normalizeDefaultScores(cfg.defaultScores),
  };
}

export function pruneDefaultScoresForFields(
  scores: ScientificDefaultScores,
  fields: ScientificFieldsConfig,
): ScientificDefaultScores {
  const normalized = normalizeDefaultScores(scores);
  const out: ScientificDefaultScores = {};
  if (fields.attendance && normalized.attendance) {
    out.attendance = { ...normalized.attendance };
  }
  if (fields.hifz && normalized.hifz?.trim()) out.hifz = normalized.hifz;
  if (fields.rabt && normalized.rabt?.trim()) out.rabt = normalized.rabt;
  if (fields.muraja && normalized.muraja?.trim()) out.muraja = normalized.muraja;
  return out;
}

/** Validate teacher score setup for enabled fields. Returns Arabic error or null. */
export function validateDefaultScoresForFields(
  fields: ScientificFieldsConfig,
  scores: ScientificDefaultScores,
): string | null {
  const enabled = enabledScientificFields(fields);
  if (enabled.length === 0) return "فعّل بنداً واحداً على الأقل";

  if (fields.attendance) {
    for (const opt of ALL_SCIENTIFIC_ATTENDANCE_OPTIONS) {
      const raw = scores.attendance?.[opt];
      if (raw === undefined || raw.trim() === "" || parseScientificScore(raw) === null) {
        return `أدخل درجة «${ATTENDANCE_OPTION_LABELS[opt]}» للحضور`;
      }
    }
  }

  for (const field of ["hifz", "rabt", "muraja"] as const) {
    if (!fields[field]) continue;
    const raw = scores[field];
    if (!raw?.trim() || parseScientificScore(raw) === null) {
      return `أدخل درجة ${SCIENTIFIC_FIELD_LABELS[field]}`;
    }
  }

  return null;
}

export function saveScientificConfig(halaqaId: number, config: ScientificGradesConfig) {
  const store = loadScientificGradesStore();
  const incoming = pruneDefaultScoresForFields(
    normalizeDefaultScores(config.defaultScores),
    config.fields,
  );
  store.configs[String(halaqaId)] = {
    visible: config.visible,
    fields: { ...config.fields },
    defaultScores: incoming,
  };
  const enabled = enabledScientificFields(config.fields);
  if (config.visible && enabled.length > 0) {
    ensureScientificHalaqaProgram(halaqaId, enabled);
  } else {
    removeScientificHalaqaProgram(halaqaId);
  }
  saveScientificGradesStore(store);
}

export function loadScientificData(halaqaId: number): ScientificGradesDataStore[string] {
  return loadScientificGradesStore().data[String(halaqaId)] ?? {};
}

function saveScientificData(halaqaId: number, data: ScientificGradesDataStore[string]) {
  const store = loadScientificGradesStore();
  store.data[String(halaqaId)] = data;
  saveScientificGradesStore(store);
}

export function enabledScientificFields(fields: ScientificFieldsConfig): ScientificGradeField[] {
  return ALL_SCIENTIFIC_FIELDS.filter((f) => fields[f]);
}

export function isScientificProgramEnabled(config: ScientificGradesConfig): boolean {
  return !!config.visible && enabledScientificFields(config.fields).length > 0;
}

/** Ensure halaqa program registry matches enabled scientific config (self-heal after cloud sync). */
export function repairScientificHalaqaProgram(halaqaId: number): ScientificGradesConfig {
  const cfg = loadScientificConfig(halaqaId);
  if (isScientificProgramEnabled(cfg)) {
    ensureScientificHalaqaProgram(halaqaId, enabledScientificFields(cfg.fields));
  }
  return cfg;
}

export function parseScientificScore(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number.parseFloat(raw.replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
}

export function getScientificDayScore(
  data: ScientificGradesDataStore[string],
  studentId: string,
  weekNum: number,
  dayKey: string,
  field: ScientificGradeField,
): string {
  return data[studentId]?.[weekNum]?.[dayKey]?.[field] ?? "";
}

function halaqaOverrideRoot(store: ScientificGradesStore, halaqaId: number) {
  const key = String(halaqaId);
  if (!store.overrides) store.overrides = {};
  if (!store.overrides[key]) store.overrides[key] = {};
  return store.overrides[key];
}

function halaqaDataRoot(store: ScientificGradesStore, halaqaId: number) {
  const key = String(halaqaId);
  if (!store.data[key]) store.data[key] = {};
  return store.data[key];
}

function writeScientificDayScoreInPlace(
  data: ScientificGradesDataStore[string],
  studentId: string,
  weekNum: number,
  dayKey: string,
  field: ScientificGradeField,
  value: string,
): boolean {
  if (!data[studentId]) data[studentId] = {};
  if (!data[studentId][weekNum]) data[studentId][weekNum] = {};
  if (!data[studentId][weekNum][dayKey]) data[studentId][weekNum][dayKey] = {};

  const trimmed = value.trim();
  const prev = data[studentId][weekNum][dayKey][field] ?? "";
  if (trimmed === "") {
    if (prev === "") return false;
    delete data[studentId][weekNum][dayKey][field];
    if (Object.keys(data[studentId][weekNum][dayKey]).length === 0) {
      delete data[studentId][weekNum][dayKey];
    }
    return true;
  }
  if (prev === trimmed) return false;
  data[studentId][weekNum][dayKey][field] = trimmed;
  return true;
}

function isScientificScoreOverriddenInStore(
  store: ScientificGradesStore,
  halaqaId: number,
  studentId: string,
  weekNum: number,
  dayKey: string,
  field: ScientificGradeField,
): boolean {
  return !!store.overrides?.[String(halaqaId)]?.[studentId]?.[weekNum]?.[dayKey]?.[field];
}

export function isScientificScoreOverridden(
  halaqaId: number,
  studentId: string,
  weekNum: number,
  dayKey: string,
  field: ScientificGradeField,
): boolean {
  return isScientificScoreOverriddenInStore(
    loadScientificGradesStore(),
    halaqaId,
    studentId,
    weekNum,
    dayKey,
    field,
  );
}

function clearScientificScoreOverrideInStore(
  store: ScientificGradesStore,
  halaqaId: number,
  studentId: string,
  weekNum: number,
  dayKey: string,
  field: ScientificGradeField,
): boolean {
  const cell = store.overrides?.[String(halaqaId)]?.[studentId]?.[weekNum]?.[dayKey];
  if (!cell?.[field]) return false;
  delete cell[field];
  if (Object.keys(cell).length === 0) {
    delete store.overrides![String(halaqaId)]![studentId]![weekNum]![dayKey];
  }
  return true;
}

export function clearScientificScoreOverride(
  halaqaId: number,
  studentId: string,
  weekNum: number,
  dayKey: string,
  field: ScientificGradeField,
): void {
  const store = loadScientificGradesStore();
  if (!clearScientificScoreOverrideInStore(store, halaqaId, studentId, weekNum, dayKey, field)) return;
  saveScientificGradesStore(store);
}

function setScientificScoreOverrideInStore(
  store: ScientificGradesStore,
  halaqaId: number,
  studentId: string,
  weekNum: number,
  dayKey: string,
  field: ScientificGradeField,
): void {
  const halaqaOverrides = halaqaOverrideRoot(store, halaqaId);
  if (!halaqaOverrides[studentId]) halaqaOverrides[studentId] = {};
  if (!halaqaOverrides[studentId][weekNum]) halaqaOverrides[studentId][weekNum] = {};
  if (!halaqaOverrides[studentId][weekNum][dayKey]) halaqaOverrides[studentId][weekNum][dayKey] = {};
  halaqaOverrides[studentId][weekNum][dayKey][field] = true;
}

function setScientificScoreOverride(
  halaqaId: number,
  studentId: string,
  weekNum: number,
  dayKey: string,
  field: ScientificGradeField,
): void {
  const store = loadScientificGradesStore();
  setScientificScoreOverrideInStore(store, halaqaId, studentId, weekNum, dayKey, field);
  saveScientificGradesStore(store);
}

export function clearScientificOverridesForHalaqa(halaqaId: number): void {
  const store = loadScientificGradesStore();
  if (!store.overrides?.[String(halaqaId)]) return;
  delete store.overrides[String(halaqaId)];
  saveScientificGradesStore(store);
}

function clearScientificOverridesForPatchInStore(
  store: ScientificGradesStore,
  halaqaId: number,
  studentId: string,
  weekNum: number,
  dayKey: string,
  patch: Partial<DayEntry>,
): boolean {
  let changed = false;
  if ("hifz" in patch) {
    changed =
      clearScientificScoreOverrideInStore(store, halaqaId, studentId, weekNum, dayKey, "hifz") ||
      changed;
  }
  if ("rabt" in patch) {
    changed =
      clearScientificScoreOverrideInStore(store, halaqaId, studentId, weekNum, dayKey, "rabt") ||
      changed;
  }
  if ("muraja" in patch) {
    changed =
      clearScientificScoreOverrideInStore(store, halaqaId, studentId, weekNum, dayKey, "muraja") ||
      changed;
  }
  if ("attendance" in patch) {
    changed =
      clearScientificScoreOverrideInStore(store, halaqaId, studentId, weekNum, dayKey, "attendance") ||
      changed;
  }
  return changed;
}

function syncScientificFieldInStore(
  store: ScientificGradesStore,
  halaqaId: number,
  data: ScientificGradesDataStore[string],
  studentId: string,
  weekNum: number,
  dayKey: string,
  config: ScientificGradesConfig,
  field: ScientificGradeField,
  entry: DayEntry,
): boolean {
  if (!config.fields[field]) {
    const overrideChanged = clearScientificScoreOverrideInStore(
      store,
      halaqaId,
      studentId,
      weekNum,
      dayKey,
      field,
    );
    const dataChanged = writeScientificDayScoreInPlace(
      data,
      studentId,
      weekNum,
      dayKey,
      field,
      "",
    );
    return overrideChanged || dataChanged;
  }
  if (
    isScientificScoreOverriddenInStore(store, halaqaId, studentId, weekNum, dayKey, field)
  ) {
    return false;
  }
  return writeScientificDayScoreInPlace(
    data,
    studentId,
    weekNum,
    dayKey,
    field,
    resolveScientificScore(config, field, entry),
  );
}

/** Apply teacher default scores after a day-entry patch unless teacher overrode the score. */
export function syncScientificScoresFromDayPatch(
  halaqaId: number,
  studentId: string,
  weekNum: number,
  dayKey: string,
  config: ScientificGradesConfig,
  patch: Partial<DayEntry>,
  entry: DayEntry,
): void {
  const store = loadScientificGradesStore();
  const data = halaqaDataRoot(store, halaqaId);
  let changed = clearScientificOverridesForPatchInStore(
    store,
    halaqaId,
    studentId,
    weekNum,
    dayKey,
    patch,
  );
  if ("hifz" in patch) {
    changed =
      syncScientificFieldInStore(
        store,
        halaqaId,
        data,
        studentId,
        weekNum,
        dayKey,
        config,
        "hifz",
        entry,
      ) || changed;
  }
  if ("rabt" in patch) {
    changed =
      syncScientificFieldInStore(
        store,
        halaqaId,
        data,
        studentId,
        weekNum,
        dayKey,
        config,
        "rabt",
        entry,
      ) || changed;
  }
  if ("muraja" in patch) {
    changed =
      syncScientificFieldInStore(
        store,
        halaqaId,
        data,
        studentId,
        weekNum,
        dayKey,
        config,
        "muraja",
        entry,
      ) || changed;
  }
  if ("attendance" in patch) {
    changed =
      syncScientificFieldInStore(
        store,
        halaqaId,
        data,
        studentId,
        weekNum,
        dayKey,
        config,
        "attendance",
        entry,
      ) || changed;
  }
  if (changed) saveScientificGradesStore(store);
}

/** Recompute stored scientific scores from current grades (after teacher saves defaults). */
export function reapplyScientificScoresForHalaqa(
  halaqaId: number,
  grades: GradesStore,
  studentIds: string[],
  config: ScientificGradesConfig,
  options?: { preserveOverrides?: boolean },
): void {
  const store = loadScientificGradesStore();
  let changed = false;
  if (!options?.preserveOverrides && store.overrides?.[String(halaqaId)]) {
    delete store.overrides[String(halaqaId)];
    changed = true;
  }
  const data = halaqaDataRoot(store, halaqaId);

  for (const studentId of studentIds) {
    const weeks = grades[studentId];
    if (!weeks) continue;
    for (const [wkStr, week] of Object.entries(weeks)) {
      const weekNum = Number(wkStr);
      if (!week?.days) continue;
      for (const [dayKey, entry] of Object.entries(week.days)) {
        if (!entry) continue;
        for (const field of ALL_SCIENTIFIC_FIELDS) {
          if (
            syncScientificFieldInStore(
              store,
              halaqaId,
              data,
              studentId,
              weekNum,
              dayKey,
              config,
              field,
              entry,
            )
          ) {
            changed = true;
          }
        }
      }
    }
  }

  if (changed) saveScientificGradesStore(store);
}

/** Fill empty scientific scores from existing prep — preserves teacher overrides and prior scores. */
export function backfillMissingScientificScoresForHalaqa(
  halaqaId: number,
  grades: GradesStore,
  studentIds: string[],
  config: ScientificGradesConfig,
): boolean {
  if (!isScientificProgramEnabled(config)) return false;

  const store = loadScientificGradesStore();
  const data = halaqaDataRoot(store, halaqaId);
  let changed = false;

  for (const studentId of studentIds) {
    const weeks = grades[studentId];
    if (!weeks) continue;
    for (const [wkStr, week] of Object.entries(weeks)) {
      const weekNum = Number(wkStr);
      if (!week?.days) continue;
      for (const [dayKey, entry] of Object.entries(week.days)) {
        if (!entry) continue;
        for (const field of ALL_SCIENTIFIC_FIELDS) {
          if (!config.fields[field]) continue;
          if (
            isScientificScoreOverriddenInStore(
              store,
              halaqaId,
              studentId,
              weekNum,
              dayKey,
              field,
            )
          ) {
            continue;
          }
          const existing = getScientificDayScore(data, studentId, weekNum, dayKey, field);
          if (existing.trim() !== "") continue;
          const score = resolveScientificScore(config, field, entry);
          if (score.trim() === "") continue;
          if (
            writeScientificDayScoreInPlace(data, studentId, weekNum, dayKey, field, score)
          ) {
            changed = true;
          }
        }
      }
    }
  }

  if (changed) saveScientificGradesStore(store);
  return changed;
}

export function setScientificDayScore(
  halaqaId: number,
  studentId: string,
  weekNum: number,
  dayKey: string,
  field: ScientificGradeField,
  value: string,
) {
  const store = loadScientificGradesStore();
  const data = halaqaDataRoot(store, halaqaId);
  if (!writeScientificDayScoreInPlace(data, studentId, weekNum, dayKey, field, value)) return;
  saveScientificGradesStore(store);
}

/** Teacher manual score edit — preserved until prep changes or manager re-applies defaults. */
export function setTeacherScientificDayScore(
  halaqaId: number,
  studentId: string,
  weekNum: number,
  dayKey: string,
  field: ScientificGradeField,
  value: string,
): void {
  setScientificDayScore(halaqaId, studentId, weekNum, dayKey, field, value);
  // Mark overridden even when clearing — prevents auto-backfill from refilling while retyping.
  setScientificScoreOverride(halaqaId, studentId, weekNum, dayKey, field);
}

export type ScientificWeekTotals = Record<ScientificGradeField, number> & { total: number };

export function emptyScientificWeekTotals(): ScientificWeekTotals {
  return { attendance: 0, hifz: 0, rabt: 0, muraja: 0, total: 0 };
}

/** Sum numeric scores for one student in one week (optionally limited to day keys). */
export function studentScientificWeekTotals(
  data: ScientificGradesDataStore[string],
  studentId: string,
  weekNum: number,
  enabledFields: ScientificGradeField[],
  dayKeys?: string[],
): ScientificWeekTotals {
  const week = data[studentId]?.[weekNum];
  const totals = emptyScientificWeekTotals();
  if (!week) return totals;

  const days = dayKeys ?? Object.keys(week);
  for (const dayKey of days) {
    const entry = week[dayKey];
    if (!entry) continue;
    for (const field of enabledFields) {
      const n = parseScientificScore(entry[field]);
      if (n !== null) {
        totals[field] += n;
        totals.total += n;
      }
    }
  }
  return totals;
}

/** Period totals across multiple weeks. */
export function studentScientificPeriodTotals(
  data: ScientificGradesDataStore[string],
  studentId: string,
  weekNums: number[],
  enabledFields: ScientificGradeField[],
  dayKeys?: string[],
): ScientificWeekTotals {
  const totals = emptyScientificWeekTotals();
  for (const weekNum of weekNums) {
    const w = studentScientificWeekTotals(data, studentId, weekNum, enabledFields, dayKeys);
    for (const field of enabledFields) {
      totals[field] += w[field];
    }
    totals.total += w.total;
  }
  return totals;
}

/** Best-case points per working day from manager defaults (for cumulative % denominator). */
export function scientificDailyMaxPossible(config: ScientificGradesConfig): number {
  const fields = enabledScientificFields(config.fields);
  if (fields.length === 0) return 0;

  let daily = 0;
  for (const field of fields) {
    if (field === "attendance") {
      const att = config.defaultScores.attendance ?? {};
      let best = 0;
      for (const opt of ALL_SCIENTIFIC_ATTENDANCE_OPTIONS) {
        const n = parseScientificScore(att[opt]);
        if (n !== null && n > best) best = n;
      }
      daily += best;
    } else {
      daily += parseScientificScore(config.defaultScores[field]) ?? 0;
    }
  }
  return daily;
}

export function scientificPeriodMaxPossible(
  config: ScientificGradesConfig,
  weekNums: number[],
  workingDayKeys: string[],
): number {
  const daily = scientificDailyMaxPossible(config);
  if (daily <= 0 || weekNums.length === 0 || workingDayKeys.length === 0) return 0;
  return daily * weekNums.length * workingDayKeys.length;
}

export function isScientificProgramId(id: string): boolean {
  return id === SCIENTIFIC_PROGRAM_ID;
}

function mergeDefaultScores(
  base: ScientificDefaultScores,
  overlay: ScientificDefaultScores,
): ScientificDefaultScores {
  const out: ScientificDefaultScores = { ...base };
  if (overlay.hifz?.trim()) out.hifz = overlay.hifz.trim();
  if (overlay.rabt?.trim()) out.rabt = overlay.rabt.trim();
  if (overlay.muraja?.trim()) out.muraja = overlay.muraja.trim();
  const att: ScientificAttendanceScores = { ...(base.attendance ?? {}), ...(overlay.attendance ?? {}) };
  if (Object.keys(att).length > 0) out.attendance = att;
  else delete out.attendance;
  return out;
}

function mergeScientificConfigs(
  base: ScientificGradesConfig | undefined,
  overlay: ScientificGradesConfig | undefined,
): ScientificGradesConfig | undefined {
  if (!base && !overlay) return undefined;
  if (!base) return overlay;
  if (!overlay) return base;
  const fields = { ...defaultScientificFields(), ...base.fields, ...overlay.fields };
  const enabled = enabledScientificFields(fields);
  return {
    visible: base.visible || overlay.visible || enabled.length > 0,
    fields,
    defaultScores: mergeDefaultScores(base.defaultScores, overlay.defaultScores),
  };
}

function mergeScientificHalaqaData(
  base: ScientificGradesDataStore[string] | undefined,
  overlay: ScientificGradesDataStore[string] | undefined,
): ScientificGradesDataStore[string] {
  const out: ScientificGradesDataStore[string] = {};
  const studentIds = new Set([...Object.keys(base ?? {}), ...Object.keys(overlay ?? {})]);
  for (const studentId of studentIds) {
    const bWeeks = base?.[studentId] ?? {};
    const oWeeks = overlay?.[studentId] ?? {};
    const weekKeys = new Set([...Object.keys(bWeeks), ...Object.keys(oWeeks)]);
    if (weekKeys.size === 0) continue;
    out[studentId] = {};
    for (const wk of weekKeys) {
      const weekNum = Number(wk);
      const bDays = bWeeks[weekNum] ?? bWeeks[wk as unknown as number] ?? {};
      const oDays = oWeeks[weekNum] ?? oWeeks[wk as unknown as number] ?? {};
      const dayKeys = new Set([...Object.keys(bDays), ...Object.keys(oDays)]);
      out[studentId][weekNum] = {};
      for (const dayKey of dayKeys) {
        out[studentId][weekNum][dayKey] = {
          ...(bDays[dayKey] ?? {}),
          ...(oDays[dayKey] ?? {}),
        };
      }
    }
  }
  return out;
}

function mergeScientificHalaqaOverrides(
  base: ScientificOverrideStore[string] | undefined,
  overlay: ScientificOverrideStore[string] | undefined,
): ScientificOverrideStore[string] {
  const out: ScientificOverrideStore[string] = {};
  const studentIds = new Set([...Object.keys(base ?? {}), ...Object.keys(overlay ?? {})]);
  for (const studentId of studentIds) {
    const bWeeks = base?.[studentId] ?? {};
    const oWeeks = overlay?.[studentId] ?? {};
    const weekKeys = new Set([...Object.keys(bWeeks), ...Object.keys(oWeeks)]);
    if (weekKeys.size === 0) continue;
    out[studentId] = {};
    for (const wk of weekKeys) {
      const weekNum = Number(wk);
      const bDays = bWeeks[weekNum] ?? bWeeks[wk as unknown as number] ?? {};
      const oDays = oWeeks[weekNum] ?? oWeeks[wk as unknown as number] ?? {};
      const dayKeys = new Set([...Object.keys(bDays), ...Object.keys(oDays)]);
      out[studentId][weekNum] = {};
      for (const dayKey of dayKeys) {
        out[studentId][weekNum][dayKey] = {
          ...(bDays[dayKey] ?? {}),
          ...(oDays[dayKey] ?? {}),
        };
      }
    }
  }
  return out;
}

/** Merge cloud + local scientific grades — overlay (local) wins per cell. */
export function mergeScientificGradesStores(
  base: ScientificGradesStore,
  overlay: ScientificGradesStore,
): ScientificGradesStore {
  const halaqaIds = new Set([
    ...Object.keys(base.configs ?? {}),
    ...Object.keys(overlay.configs ?? {}),
    ...Object.keys(base.data ?? {}),
    ...Object.keys(overlay.data ?? {}),
    ...Object.keys(base.overrides ?? {}),
    ...Object.keys(overlay.overrides ?? {}),
  ]);

  const configs: Record<string, ScientificGradesConfig> = {};
  const data: ScientificGradesDataStore = {};
  const overrides: ScientificOverrideStore = {};

  for (const halaqaId of halaqaIds) {
    const mergedConfig = mergeScientificConfigs(base.configs?.[halaqaId], overlay.configs?.[halaqaId]);
    if (mergedConfig) configs[halaqaId] = mergedConfig;
    data[halaqaId] = mergeScientificHalaqaData(base.data?.[halaqaId], overlay.data?.[halaqaId]);
    const mergedOverrides = mergeScientificHalaqaOverrides(
      base.overrides?.[halaqaId],
      overlay.overrides?.[halaqaId],
    );
    if (Object.keys(mergedOverrides).length > 0) overrides[halaqaId] = mergedOverrides;
  }

  return { configs, data, overrides };
}

export function replaceScientificGradesStore(store: ScientificGradesStore) {
  saveScientificGradesStore(store);
}
