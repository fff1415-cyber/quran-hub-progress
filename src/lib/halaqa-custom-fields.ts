/** Per-halaqa custom grade columns configured by the manager. */

export interface HalaqaCustomField {
  id: string;
  label: string;
  /** Selectable values shown to the teacher (at least one). */
  options: string[];
  sortOrder: number;
}

export type HalaqaCustomFieldsStore = Record<string, HalaqaCustomField[]>;

const KEY = "qshatawi_halaqa_custom_fields_v1";

function persistShared(value: HalaqaCustomFieldsStore) {
  if (typeof window === "undefined" || !sessionStorage.getItem("qs_token")) return;
  if (sessionStorage.getItem("qs_syncing") === "1") return;
  void import("./cloud-sync").then((m) => m.pushAppState("halaqa_custom_fields", value)).catch(() => undefined);
}

export function loadAllHalaqaCustomFields(): HalaqaCustomFieldsStore {
  if (typeof window === "undefined") return {};
  const raw = localStorage.getItem(KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as HalaqaCustomFieldsStore;
  } catch {
    return {};
  }
}

export function saveAllHalaqaCustomFields(store: HalaqaCustomFieldsStore) {
  localStorage.setItem(KEY, JSON.stringify(store));
  persistShared(store);
}

export function loadHalaqaCustomFields(halaqaId: number): HalaqaCustomField[] {
  const list = loadAllHalaqaCustomFields()[String(halaqaId)] ?? [];
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function saveHalaqaCustomFields(halaqaId: number, fields: HalaqaCustomField[]) {
  const store = loadAllHalaqaCustomFields();
  store[String(halaqaId)] = fields.map((f, i) => ({ ...f, sortOrder: i }));
  saveAllHalaqaCustomFields(store);
}

export function parseOptionsInput(raw: string): string[] {
  return raw
    .split(/[\n,،|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function newFieldId(): string {
  return `cf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function formatOptionsForInput(options: string[]): string {
  return options.join("، ");
}
