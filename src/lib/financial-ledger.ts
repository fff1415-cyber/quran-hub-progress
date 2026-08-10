import { hasAuthToken } from "@/lib/auth-session";

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
}

const KEY = "qshatawi_financial_ledger_v1";

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function persist(store: FinancialLedgerStore) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
  if (!hasAuthToken()) return;
  if (sessionStorage.getItem("qs_syncing") === "1") return;
  void import("./cloud-sync")
    .then((m) => m.pushAppState("financial_ledger", store))
    .catch(() => undefined);
}

export function loadFinancialLedger(): FinancialLedgerStore {
  if (typeof window === "undefined") return { entries: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { entries: [] };
    const parsed = JSON.parse(raw) as Partial<FinancialLedgerStore>;
    if (!parsed || !Array.isArray(parsed.entries)) return { entries: [] };
    return { entries: parsed.entries.filter(isFinancialEntry) };
  } catch {
    return { entries: [] };
  }
}

export function saveFinancialLedger(store: FinancialLedgerStore): void {
  persist(store);
}

function isFinancialEntry(raw: unknown): raw is FinancialEntry {
  if (!raw || typeof raw !== "object") return false;
  const e = raw as Record<string, unknown>;
  if (e.type !== "income" && e.type !== "expense") return false;
  if (typeof e.id !== "string" || typeof e.semesterId !== "string") return false;
  if (typeof e.amount !== "number" || !Number.isFinite(e.amount)) return false;
  if (typeof e.date !== "string" || typeof e.createdBy !== "string") return false;
  if (e.type === "income") return typeof e.donorName === "string";
  return typeof e.programName === "string" && typeof e.beneficiariesCount === "number";
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
  saveFinancialLedger({ entries: next });
  return true;
}

export function formatMoney(amount: number): string {
  return `${amount.toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ر.س`;
}
