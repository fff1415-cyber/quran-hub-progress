import type { PlanTrack } from "@/lib/plan-types";
import { loadSardHistory } from "@/lib/mock-data";

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
}

const KEY = "qshatawi_academic_records_v1";

function persistShared(value: AcademicPhaseRecord[]) {
  if (typeof window === "undefined" || !sessionStorage.getItem("qs_token")) return;
  if (sessionStorage.getItem("qs_syncing") === "1") return;
  void import("./cloud-sync").then((m) => m.pushAppState("academic_records", value)).catch(() => undefined);
}

export function loadAcademicRecords(): AcademicPhaseRecord[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : [];
}

export function saveAcademicRecords(list: AcademicPhaseRecord[]) {
  const trimmed = list.slice(0, 500);
  localStorage.setItem(KEY, JSON.stringify(trimmed));
  persistShared(trimmed);
}

export function pushAcademicRecord(record: AcademicPhaseRecord) {
  const list = loadAcademicRecords();
  list.unshift(record);
  saveAcademicRecords(list);
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
