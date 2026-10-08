import { buildRphpUrl } from "@/lib/api-base";
import { getToken } from "@/lib/auth-session";
import type { AcademicReport } from "@/lib/academic-reports";

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const token = getToken();
  if (!token) throw new Error("سجّل الدخول أولاً");
  const res = await fetch(buildRphpUrl(path), {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await res.json();
  if (!res.ok) throw new Error(value.error ?? "تعذّر تحميل التقرير");
  return value as T;
}

export function reportSnapshotJson(report: AcademicReport): string {
  const { generatedAt: _generatedAt, ...payload } = report;
  void _generatedAt;
  return JSON.stringify(payload);
}
export async function reportFingerprint(report: AcademicReport): Promise<string> {
  const bytes = new TextEncoder().encode(reportSnapshotJson(report));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

export async function getReportNotes(): Promise<Record<string, string>> {
  return (await call<{ notes: Record<string, string> }>("/academic-reports/notes")).notes;
}
export async function saveReportNote(studentId: string, note: string): Promise<void> {
  await call("/academic-reports/notes", "POST", { studentId, note });
}
export type ReportApproval = {
  by: string;
  at: string;
  snapshot: Omit<AcademicReport, "generatedAt">;
} | null;
export async function getReportApproval(fingerprint: string): Promise<ReportApproval> {
  return (
    await call<{ approval: ReportApproval }>(
      `/academic-reports/approval?fingerprint=${fingerprint}`,
    )
  ).approval;
}
export async function approveReport(
  report: AcademicReport,
  fingerprint: string,
): Promise<ReportApproval> {
  const { scope, from, to } = report.options;
  return (
    await call<{ approval: ReportApproval }>("/academic-reports/approval", "POST", {
      fingerprint,
      scope,
      from,
      to,
      snapshotJson: reportSnapshotJson(report),
    })
  ).approval;
}
export type ArchivedAcademicReport = {
  fingerprint: string;
  scope: string;
  period_from: string;
  period_to: string;
  approved_by: string;
  approved_at: string;
};
export async function listReportArchive(): Promise<ArchivedAcademicReport[]> {
  return (await call<{ items: ArchivedAcademicReport[] }>("/academic-reports/archive")).items;
}
