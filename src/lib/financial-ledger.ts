import { hasAuthToken } from "@/lib/auth-session";
import { getActiveComplexId } from "@/lib/tenant";

/**
 * Semester-scoped financial ledger — income & expense entries per complex.
 */

export type FinancialEntryType = "income" | "expense";

export interface FinancialIncomeEntry {
  id: string;
  type: "income";
  semesterId: string;
  donorName: string;
  amount: number;
  date: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export interface FinancialExpenseEntry {
  id: string;
  type: "expense";
  semesterId: string;
  programName: string;
  beneficiariesCount: number;
  amount: number;
  date: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export type FinancialEntry = FinancialIncomeEntry | FinancialExpenseEntry;

export interface FinancialLedgerStore {
  entries: FinancialEntry[];
  /** Tombstones so deletes survive cloud merge. */
  deletedIds?: string[];
}

const KEY_PREFIX = "qshatawi_financial_ledger_v1";
const LEGACY_KEY = KEY_PREFIX;
const MAX_DELETED_IDS = 5000;

function storageKey(): string {
  const cid = getActiveComplexId();
  return cid && cid > 0 ? `${KEY_PREFIX}_c${cid}` : LEGACY_KEY;
}

/** Accept { entries } or legacy array / loose shapes from cloud JSON. */
export function parseFinancialLedgerRaw(raw: unknown): FinancialLedgerStore {
  if (raw == null) return { entries: [] };
  if (Array.isArray(raw)) {
    return normalizeFinancialLedger({ entries: raw });
  }
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.entries)) {
      return normalizeFinancialLedger({
        entries: obj.entries,
        deletedIds: obj.deletedIds,
      });
    }
  }
  return { entries: [] };
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function entryTimestamp(entry: FinancialEntry): string {
  return entry.updatedAt ?? entry.createdAt;
}

function normalizeFinancialLedger(raw: Partial<FinancialLedgerStore> | null | undefined): FinancialLedgerStore {
  const base = raw && Array.isArray(raw.entries) ? raw : parseFinancialLedgerRaw(raw);
  if (!Array.isArray(base.entries)) return { entries: [] };
  const deleted = new Set(
    Array.isArray(base.deletedIds) ? base.deletedIds.filter((id) => typeof id === "string") : [],
  );
  const entries = base.entries
    .map((e) => coerceFinancialEntry(e))
    .filter((e): e is FinancialEntry => e !== null)
    .filter((e) => !deleted.has(e.id))
    .sort((a, b) => b.date.localeCompare(a.date) || entryTimestamp(b).localeCompare(entryTimestamp(a)));
  const deletedIds = deleted.size > 0 ? [...deleted].slice(-MAX_DELETED_IDS) : undefined;
  return deletedIds ? { entries, deletedIds } : { entries };
}

function readLocalLedger(): FinancialLedgerStore {
  if (typeof window === "undefined") return { entries: [] };
  const key = storageKey();
  try {
    const raw = localStorage.getItem(key);
    if (raw) return parseFinancialLedgerRaw(JSON.parse(raw));
    if (key !== LEGACY_KEY) {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) return parseFinancialLedgerRaw(JSON.parse(legacy));
    }
    return { entries: [] };
  } catch {
    return { entries: [] };
  }
}

function persist(store: FinancialLedgerStore, sync = true) {
  if (typeof window === "undefined") return;
  const normalized = normalizeFinancialLedger(store);
  try {
    localStorage.setItem(storageKey(), JSON.stringify(normalized));
  } catch {
    /* ignore */
  }
  if (!sync) return;
  if (!hasAuthToken()) return;
  if (sessionStorage.getItem("qs_syncing") === "1") return;
  void import("./cloud-sync")
    .then((m) => m.pushMergedFinancialLedger(normalized))
    .catch(() => undefined);
}

export function loadFinancialLedger(): FinancialLedgerStore {
  return readLocalLedger();
}

/** Pull cloud ledger, merge with local, save — never overwrites cloud on read. */
export async function refreshFinancialLedgerFromCloud(): Promise<FinancialLedgerStore> {
  if (typeof window === "undefined") return { entries: [] };
  const local = readLocalLedger();
  if (!hasAuthToken()) return local;
  const { fetchCloudFinancialLedger } = await import("./cloud-sync");
  let cloud: FinancialLedgerStore = { entries: [] };
  try {
    cloud = await fetchCloudFinancialLedger();
  } catch {
    return local;
  }
  const { merged } = mergeFinancialLedgerStores(cloud, local);
  saveFinancialLedger(merged, { sync: false });
  return merged;
}

export function saveFinancialLedger(store: FinancialLedgerStore, options?: { sync?: boolean }): void {
  persist(store, options?.sync !== false);
}

/** Merge cloud + local — union by entry id, newer timestamp wins; honor deletedIds. */
export function mergeFinancialLedgerStores(
  cloud: FinancialLedgerStore,
  local: FinancialLedgerStore,
): { merged: FinancialLedgerStore; pushToCloud: boolean } {
  const cloudNorm = normalizeFinancialLedger(cloud);
  const localNorm = normalizeFinancialLedger(local);
  const deletedIds = [
    ...new Set([...(cloudNorm.deletedIds ?? []), ...(localNorm.deletedIds ?? [])]),
  ].slice(-MAX_DELETED_IDS);
  const deleted = new Set(deletedIds);
  const byId = new Map<string, FinancialEntry>();

  for (const source of [cloudNorm.entries, localNorm.entries]) {
    for (const entry of source) {
      if (deleted.has(entry.id)) continue;
      const prev = byId.get(entry.id);
      if (!prev || entryTimestamp(entry) >= entryTimestamp(prev)) {
        byId.set(entry.id, entry);
      }
    }
  }

  const merged = normalizeFinancialLedger({
    entries: Array.from(byId.values()),
    deletedIds: deletedIds.length > 0 ? deletedIds : undefined,
  });

  const cloudById = new Map(cloudNorm.entries.map((e) => [e.id, e]));
  let pushToCloud = false;
  for (const entry of localNorm.entries) {
    const remote = cloudById.get(entry.id);
    if (!remote || entryTimestamp(entry) > entryTimestamp(remote)) {
      pushToCloud = true;
      break;
    }
  }
  if (!pushToCloud) {
    for (const id of localNorm.deletedIds ?? []) {
      if (!(cloudNorm.deletedIds ?? []).includes(id)) {
        pushToCloud = true;
        break;
      }
    }
  }
  if (!pushToCloud && merged.entries.length > cloudNorm.entries.length) {
    pushToCloud = true;
  }

  return { merged, pushToCloud };
}

function parseFiniteNumber(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number.parseFloat(raw.replace(",", ".").trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function coerceFinancialEntry(raw: unknown): FinancialEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (e.type !== "income" && e.type !== "expense") return null;
  if (typeof e.id !== "string" || typeof e.semesterId !== "string") return null;
  const amount = parseFiniteNumber(e.amount);
  if (amount === null) return null;
  if (typeof e.date !== "string" || typeof e.createdBy !== "string") return null;
  const createdAt = typeof e.createdAt === "string" ? e.createdAt : new Date().toISOString();
  const updatedAt = typeof e.updatedAt === "string" ? e.updatedAt : undefined;

  if (e.type === "income") {
    if (typeof e.donorName !== "string") return null;
    return {
      id: e.id,
      type: "income",
      semesterId: e.semesterId,
      donorName: e.donorName,
      amount,
      date: e.date,
      createdBy: e.createdBy,
      createdAt,
      updatedAt,
    };
  }

  const beneficiaries = parseFiniteNumber(e.beneficiariesCount);
  if (typeof e.programName !== "string" || beneficiaries === null) return null;
  return {
    id: e.id,
    type: "expense",
    semesterId: e.semesterId,
    programName: e.programName,
    beneficiariesCount: Math.max(0, Math.round(beneficiaries)),
    amount,
    date: e.date,
    createdBy: e.createdBy,
    createdAt,
    updatedAt,
  };
}

function isFinancialEntry(raw: unknown): raw is FinancialEntry {
  return coerceFinancialEntry(raw) !== null;
}

export function entriesForSemester(
  store: FinancialLedgerStore,
  semesterId: string,
  type?: FinancialEntryType,
): FinancialEntry[] {
  return store.entries
    .filter((e) => e.semesterId === semesterId && (!type || e.type === type))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export function sumAmounts(entries: FinancialEntry[]): number {
  return entries.reduce((acc, e) => acc + e.amount, 0);
}

export type IncomeDraft = {
  donorName: string;
  amount: number;
  date: string;
};

export type ExpenseDraft = {
  programName: string;
  beneficiariesCount: number;
  amount: number;
  date: string;
};

export function addIncomeEntry(
  semesterId: string,
  draft: IncomeDraft,
  createdBy: string,
): FinancialIncomeEntry {
  const store = loadFinancialLedger();
  const entry: FinancialIncomeEntry = {
    id: newId("fin-inc"),
    type: "income",
    semesterId,
    donorName: draft.donorName.trim(),
    amount: draft.amount,
    date: draft.date,
    createdBy,
    createdAt: new Date().toISOString(),
  };
  store.entries.unshift(entry);
  saveFinancialLedger(store);
  return entry;
}

export function addExpenseEntry(
  semesterId: string,
  draft: ExpenseDraft,
  createdBy: string,
): FinancialExpenseEntry {
  const store = loadFinancialLedger();
  const entry: FinancialExpenseEntry = {
    id: newId("fin-exp"),
    type: "expense",
    semesterId,
    programName: draft.programName.trim(),
    beneficiariesCount: draft.beneficiariesCount,
    amount: draft.amount,
    date: draft.date,
    createdBy,
    createdAt: new Date().toISOString(),
  };
  store.entries.unshift(entry);
  saveFinancialLedger(store);
  return entry;
}

export function updateIncomeEntry(id: string, draft: IncomeDraft): boolean {
  const store = loadFinancialLedger();
  const idx = store.entries.findIndex((e) => e.id === id && e.type === "income");
  if (idx < 0) return false;
  const prev = store.entries[idx] as FinancialIncomeEntry;
  store.entries[idx] = {
    ...prev,
    donorName: draft.donorName.trim(),
    amount: draft.amount,
    date: draft.date,
    updatedAt: new Date().toISOString(),
  };
  saveFinancialLedger(store);
  return true;
}

export function updateExpenseEntry(id: string, draft: ExpenseDraft): boolean {
  const store = loadFinancialLedger();
  const idx = store.entries.findIndex((e) => e.id === id && e.type === "expense");
  if (idx < 0) return false;
  const prev = store.entries[idx] as FinancialExpenseEntry;
  store.entries[idx] = {
    ...prev,
    programName: draft.programName.trim(),
    beneficiariesCount: draft.beneficiariesCount,
    amount: draft.amount,
    date: draft.date,
    updatedAt: new Date().toISOString(),
  };
  saveFinancialLedger(store);
  return true;
}

export function deleteFinancialEntry(id: string): boolean {
  const store = loadFinancialLedger();
  const next = store.entries.filter((e) => e.id !== id);
  if (next.length === store.entries.length) return false;
  const deletedIds = [...(store.deletedIds ?? [])];
  if (!deletedIds.includes(id)) deletedIds.push(id);
  saveFinancialLedger({
    entries: next,
    deletedIds: deletedIds.slice(-MAX_DELETED_IDS),
  });
  return true;
}

export function formatMoney(amount: number): string {
  return `${amount.toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ر.س`;
}
