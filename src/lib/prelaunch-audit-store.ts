/**
 * Temporary pre-launch audit storage (localStorage) — delete with the feature after launch QA.
 */

import {
  PRELAUNCH_AUDIT_CATALOG,
  type PrelaunchAuditItem,
} from "@/lib/prelaunch-audit-catalog";

const STORAGE_KEY = "msht_prelaunch_audit_v1";

export type PrelaunchScore = 1 | 2 | 3 | 4 | 5;
export type PrelaunchStatus = "pending" | "pass" | "issue" | "skip";

export type PrelaunchAuditRecord = {
  score?: PrelaunchScore;
  status: PrelaunchStatus;
  notes: string;
  updatedAt?: string;
};

export type PrelaunchAuditStore = Record<string, PrelaunchAuditRecord>;

function emptyRecord(): PrelaunchAuditRecord {
  return { status: "pending", notes: "" };
}

export function loadPrelaunchAuditStore(): PrelaunchAuditStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PrelaunchAuditStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function savePrelaunchAuditStore(store: PrelaunchAuditStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getPrelaunchRecord(
  store: PrelaunchAuditStore,
  id: string,
): PrelaunchAuditRecord {
  return store[id] ?? emptyRecord();
}

export function upsertPrelaunchRecord(
  store: PrelaunchAuditStore,
  id: string,
  patch: Partial<PrelaunchAuditRecord>,
): PrelaunchAuditStore {
  const prev = getPrelaunchRecord(store, id);
  return {
    ...store,
    [id]: {
      ...prev,
      ...patch,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function clearPrelaunchAuditStore(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export type PrelaunchAuditSummary = {
  total: number;
  pending: number;
  pass: number;
  issue: number;
  skip: number;
  scored: number;
  avgScore: number | null;
};

export function summarizePrelaunchAudit(store: PrelaunchAuditStore): PrelaunchAuditSummary {
  const total = PRELAUNCH_AUDIT_CATALOG.length;
  let pending = 0;
  let pass = 0;
  let issue = 0;
  let skip = 0;
  let scored = 0;
  let scoreSum = 0;

  for (const item of PRELAUNCH_AUDIT_CATALOG) {
    const rec = getPrelaunchRecord(store, item.id);
    if (rec.status === "pass") pass += 1;
    else if (rec.status === "issue") issue += 1;
    else if (rec.status === "skip") skip += 1;
    else pending += 1;
    if (rec.score) {
      scored += 1;
      scoreSum += rec.score;
    }
  }

  return {
    total,
    pending,
    pass,
    issue,
    skip,
    scored,
    avgScore: scored > 0 ? Math.round((scoreSum / scored) * 10) / 10 : null,
  };
}

export function groupPrelaunchCatalog(items: PrelaunchAuditItem[] = PRELAUNCH_AUDIT_CATALOG) {
  const groups = new Map<string, PrelaunchAuditItem[]>();
  for (const item of items) {
    const list = groups.get(item.group) ?? [];
    list.push(item);
    groups.set(item.group, list);
  }
  return [...groups.entries()];
}

export function buildPrelaunchExport(store: PrelaunchAuditStore) {
  return {
    exportedAt: new Date().toISOString(),
    summary: summarizePrelaunchAudit(store),
    items: PRELAUNCH_AUDIT_CATALOG.map((item) => ({
      ...item,
      record: getPrelaunchRecord(store, item.id),
    })),
  };
}

export function downloadPrelaunchExport(store: PrelaunchAuditStore): void {
  const payload = buildPrelaunchExport(store);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `prelaunch-audit-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
