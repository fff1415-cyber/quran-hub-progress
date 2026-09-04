/** Teacher-entered numeric grades — separate from core week percentage. */
import { hasAuthToken } from "@/lib/auth-session";
import type { DayEntry } from "@/lib/mock-data";

import {
  SCIENTIFIC_PROGRAM_ID,
  ensureScientificHalaqaProgram,
  type ScientificGradeField,
} from "@/lib/scientific-grades-program";

export type { ScientificGradeField };

export type ScientificFieldsConfig = Record<ScientificGradeField, boolean>;

export type ScientificDefaultScores = Partial<Record<ScientificGradeField, string>>;

export type ScientificGradesConfig = {
  /** Show grade columns in التحضير والدرجات table */
  visible: boolean;
  fields: ScientificFieldsConfig;
  /** Auto-filled numeric score per field when the teacher activates that task (per halaqa). */
  defaultScores: ScientificDefaultScores;
};

export type ScientificDayScores = Partial<Record<ScientificGradeField, string>>;

/** halaqaId → studentId → weekNum → dayKey → scores */
export type ScientificGradesDataStore = Record<
  string,
  Record<string, Record<number, Record<string, ScientificDayScores>>>
>;

export type ScientificGradesStore = {
  configs: Record<string, ScientificGradesConfig>;
  data: ScientificGradesDataStore;
};

const KEY = "qshatawi_scientific_grades_v1";

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

export function defaultScientificFields(): ScientificFieldsConfig {
  return { attendance: false, hifz: false, rabt: false, muraja: false };
}

export function defaultScientificConfig(): ScientificGradesConfig {
  return { visible: false, fields: defaultScientificFields(), defaultScores: {} };
}

function normalizeDefaultScores(raw: ScientificDefaultScores | undefined): ScientificDefaultScores {
  const out: ScientificDefaultScores = {};
  if (!raw) return out;
  for (const field of ALL_SCIENTIFIC_FIELDS) {
    const v = raw[field];
    if (typeof v === "string" && v.trim() !== "") {
      out[field] = v.trim();
    }
  }
  return out;
}

export function scientificDefaultScore(
  config: ScientificGradesConfig,
  field: ScientificGradeField,
): string {
  return config.defaultScores[field]?.trim() ?? "";
}

function persist(store: ScientificGradesStore) {
  if (typeof window === "undefined" || !hasAuthToken()) return;
  if (sessionStorage.getItem("qs_syncing") === "1") return;
  void import("./cloud-sync").then((m) => m.pushAppState("scientific_grades", store)).catch(() => undefined);
}

export function loadScientificGradesStore(): ScientificGradesStore {
  if (typeof window === "undefined") {
    return { configs: {}, data: {} };
  }
  const raw = localStorage.getItem(KEY);
  if (!raw) return { configs: {}, data: {} };
  try {
    const parsed = JSON.parse(raw) as Partial<ScientificGradesStore>;
    return {
      configs: parsed.configs ?? {},
      data: parsed.data ?? {},
    };
  } catch {
    return { configs: {}, data: {} };
  }
}

export function saveScientificGradesStore(store: ScientificGradesStore) {
  localStorage.setItem(KEY, JSON.stringify(store));
  persist(store);
}

export function loadScientificConfig(halaqaId: number): ScientificGradesConfig {
  const cfg = loadScientificGradesStore().configs[String(halaqaId)];
  if (!cfg) return defaultScientificConfig();
  return {
    visible: !!cfg.visible,
    fields: { ...defaultScientificFields(), ...cfg.fields },
    defaultScores: normalizeDefaultScores(cfg.defaultScores),
  };
}

export function saveScientificConfig(halaqaId: number, config: ScientificGradesConfig) {
  const store = loadScientificGradesStore();
  store.configs[String(halaqaId)] = {
    visible: config.visible,
    fields: { ...config.fields },
    defaultScores: normalizeDefaultScores(config.defaultScores),
  };
  const enabled = enabledScientificFields(config.fields);
  if (enabled.length > 0) {
    ensureScientificHalaqaProgram(halaqaId, enabled);
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

/** Apply or clear per-halaqa default scientific scores after a day-entry patch. */
export function syncScientificScoresFromDayPatch(
  halaqaId: number,
  studentId: string,
  weekNum: number,
  dayKey: string,
  config: ScientificGradesConfig,
  patch: Partial<DayEntry>,
  entry: DayEntry,
): void {
  const applyField = (
    field: ScientificGradeField,
    active: boolean,
  ) => {
    if (!config.fields[field]) {
      if (!active) {
        setScientificDayScore(halaqaId, studentId, weekNum, dayKey, field, "");
      }
      return;
    }
    if (active) {
      const def = scientificDefaultScore(config, field);
      if (def) {
        setScientificDayScore(halaqaId, studentId, weekNum, dayKey, field, def);
      }
    } else {
      setScientificDayScore(halaqaId, studentId, weekNum, dayKey, field, "");
    }
  };

  if ("hifz" in patch) {
    applyField("hifz", entry.hifz !== "");
  }

  if ("rabt" in patch) {
    applyField("rabt", entry.rabt === "pass");
  }

  if ("muraja" in patch) {
    applyField("muraja", entry.muraja === "pass");
  }

  if ("attendance" in patch) {
    const att = entry.attendance;
    const active = att === "present" || att === "late" || att === "excused";
    applyField("attendance", active);
  }
}

export function setScientificDayScore(
  halaqaId: number,
  studentId: string,
  weekNum: number,
  dayKey: string,
  field: ScientificGradeField,
  value: string,
) {
  const all = loadScientificData(halaqaId);
  if (!all[studentId]) all[studentId] = {};
  if (!all[studentId][weekNum]) all[studentId][weekNum] = {};
  if (!all[studentId][weekNum][dayKey]) all[studentId][weekNum][dayKey] = {};

  const trimmed = value.trim();
  if (trimmed === "") {
    delete all[studentId][weekNum][dayKey][field];
    if (Object.keys(all[studentId][weekNum][dayKey]).length === 0) {
      delete all[studentId][weekNum][dayKey];
    }
  } else {
    all[studentId][weekNum][dayKey][field] = trimmed;
  }
  saveScientificData(halaqaId, all);
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

export function isScientificProgramId(id: string): boolean {
  return id === SCIENTIFIC_PROGRAM_ID;
}

export function replaceScientificGradesStore(store: ScientificGradesStore) {
  saveScientificGradesStore(store);
}
