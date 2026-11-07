import type { PlanTrack } from "@/lib/plan-types";
import { hasAuthToken, getToken, decodeAuthTokenPayload } from "@/lib/auth-session";
import { loadSardHistory, loadNotifications, saveNotifications, mergeNotifications } from "@/lib/mock-data";

export interface AcademicPhaseRecord {
  id: string;
  studentId: string;
  halaqaId: number;
  week: number;
  attempt: number;
  result: "passed" | "failed";
  percent: number;
  hifzScore: number;
  reviewScore: number;
  testDate: string;
  planId?: string;
  planTitle?: string;
  levelNumber?: number;
  track?: PlanTrack;
  assignmentId?: string;
  newPlanTitle?: string;
}

const KEY = "qshatawi_academic_records_v1";
function recordStorageKey(): string {
  if (!hasAuthToken()) return KEY;
  const auth = decodeAuthTokenPayload(getToken());
  if (!auth?.complexId || !auth.role) throw new Error("تعذّر تثبيت هوية السجل الأكاديمي؛ أعد تسجيل الدخول");
  return KEY + ":account:" + encodeURIComponent(JSON.stringify([auth.complexId, auth.role, auth.accountId ?? [auth.halaqaId, auth.name], auth.studentId]));
}

function persistShared(value: AcademicPhaseRecord[]) {
  if (typeof window === "undefined" || !hasAuthToken()) return;
  if (sessionStorage.getItem("qs_syncing") === "1") return;
  void import("./cloud-sync").then((m) => m.pushAppState("academic_records", value)).catch((error) => {
    void import("sonner").then(({ toast }) => toast.error(`لم يتأكد حفظ السجل الأكاديمي على الخادم: ${error instanceof Error ? error.message : "تعذّرت المزامنة"}`));
  });
}

export function loadAcademicRecords(): AcademicPhaseRecord[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(recordStorageKey());
  return raw ? JSON.parse(raw) : [];
}

export function saveAcademicRecords(list: AcademicPhaseRecord[], options?: { sync?: boolean }) {
  const key = recordStorageKey(), previous = localStorage.getItem(key);
  if (previous && !localStorage.getItem(`${key}:before-history-repair`)) localStorage.setItem(`${key}:before-history-repair`, previous);
  localStorage.setItem(key, JSON.stringify(list));
  const notices = list.filter(record => record.newPlanTitle && record.assignmentId).map(record => ({ id: `n-academic-${record.assignmentId}`, message: `بعد اجتياز السرد — انتقل الطالب إلى ${record.newPlanTitle}`, type: "info" as const, targetHalaqaId: record.halaqaId, createdAt: record.testDate, read: false }));
  if (notices.length) saveNotifications(mergeNotifications(notices, loadNotifications()));
  if (options?.sync !== false) persistShared(list);
}

/** Refresh is read-only remotely and cannot re-upload an old device's history. */
export async function refreshConfirmedAcademicRecords(): Promise<void> {
  const token = getToken(), key = recordStorageKey(); if (!token) return;
  const { secureListAppState } = await import("./secure-data.functions");
  const rows = await secureListAppState({ data: { token, key: "academic_records" } });
  if (getToken() !== token || recordStorageKey() !== key) return;
  const row = rows.find(row => row.key === "academic_records");
  if (!row) return;
  if (!Array.isArray(row.value)) throw new Error("صيغة السجل الأكاديمي تحتاج مراجعة؛ بقيت نسخة الجهاز");
  mergeConfirmedAcademicRecords(row.value as AcademicPhaseRecord[]);
}
export function mergeConfirmedAcademicRecords(cloud: AcademicPhaseRecord[]): void {
  const hasId = (record: AcademicPhaseRecord) => typeof record.id === "string" && record.id !== "";
  const ids = new Set(cloud.filter(hasId).map(record => record.id)), anonymous = new Map<string, number>();
  for (const record of cloud.filter(record => !hasId(record))) { const key = JSON.stringify(record); anonymous.set(key, (anonymous.get(key) ?? 0) + 1); }
  const retained = loadAcademicRecords().filter(record => {
    if (hasId(record)) return !ids.has(record.id);
    const key = JSON.stringify(record), copies = anonymous.get(key) ?? 0;
    if (copies > 0) { anonymous.set(key, copies - 1); return false; }
    return true;
  });
  // Preserve every server row, including ambiguous duplicate IDs and anonymous legacy records.
  saveAcademicRecords([...cloud, ...retained].sort((a, b) => String(b.testDate ?? "").localeCompare(String(a.testDate ?? ""))), { sync: false });
}

export function pushAcademicRecord(record: AcademicPhaseRecord, options?: { sync?: boolean }) {
  const list = loadAcademicRecords();
  const existing = list.findIndex(item => item.id === record.id);
  if (existing !== -1) list.splice(existing, 1);
  list.unshift(record);
  saveAcademicRecords(list, options);
}

export function studentAcademicRecords(studentId: string): AcademicPhaseRecord[] {
  return loadAcademicRecords().filter((r) => r.studentId === studentId);
}

/** Includes passed sard history entries not yet migrated to academic records. */
export function studentAcademicRecordsWithLegacy(studentId: string): AcademicPhaseRecord[] {
  const records = studentAcademicRecords(studentId);
  const seen = new Set(records.map((r) => `${r.week}-${r.attempt}`));
  const legacy = loadSardHistory()
    .filter((h) => h.studentId === studentId && h.result === "passed" && !seen.has(`${h.week}-${h.attempt}`))
    .map((h): AcademicPhaseRecord => ({
      id: h.id,
      studentId: h.studentId,
      halaqaId: h.halaqaId,
      week: h.week,
      attempt: h.attempt,
      result: "passed",
      percent: h.percent,
      hifzScore: 0,
      reviewScore: 0,
      testDate: h.at,
    }));
  return [...records, ...legacy].sort((a, b) => b.testDate.localeCompare(a.testDate));
}

export function studentPassedPhases(studentId: string): AcademicPhaseRecord[] {
  return studentAcademicRecordsWithLegacy(studentId).filter((r) => r.result === "passed");
}
