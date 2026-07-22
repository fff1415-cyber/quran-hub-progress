import type {
  EducationPlan,
  ImportPlanPayload,
  PlanTaskType,
  StudentPlanSheetData,
  TapValue,
} from "@/lib/plan-types";
import { getToken } from "@/lib/cloud-sync";
import {
  localApplyInput,
  localAssignPlan,
  localClearPlansCache,
  localGetStudentSheet,
  localImportPlans,
  localListPlans,
  localPatchAssignment,
  localPlanDetail,
} from "@/lib/plans-store";

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

function apiUrl(path: string): string {
  if (!API_BASE) throw new Error("VITE_API_URL is not configured");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}/api/r.php?path=${encodeURIComponent(p)}`;
}

async function planFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  if (!token) throw new Error("غير مسجل الدخول");
  const res = await fetch(apiUrl(path), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const text = await res.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`HTTP ${res.status}`);
    }
  }
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return body as T;
}

function filterTrack(plans: EducationPlan[], track?: "gold" | "silver"): EducationPlan[] {
  return track ? plans.filter((p) => p.track === track) : plans;
}

export async function fetchPlans(track?: "gold" | "silver"): Promise<EducationPlan[]> {
  try {
    const q = track ? `?track=${track}` : "";
    return await planFetch<EducationPlan[]>(`/plans${q}`);
  } catch {
    return filterTrack(localListPlans(), track);
  }
}

export async function fetchStudentPlanSheet(studentId: string): Promise<StudentPlanSheetData> {
  try {
    return await planFetch<StudentPlanSheetData>(`/plans/student-sheet?student_id=${encodeURIComponent(studentId)}`);
  } catch {
    return localGetStudentSheet(studentId);
  }
}

export async function importPlans(plans: ImportPlanPayload[]): Promise<{
  plans_imported: number;
  segments_imported: number;
  stored_locally?: boolean;
}> {
  try {
    const result = await planFetch("/plans/import", { method: "POST", body: JSON.stringify({ plans }) });
    localClearPlansCache();
    return result;
  } catch {
    const r = localImportPlans(plans);
    return { plans_imported: r.plans, segments_imported: r.segments, stored_locally: true };
  }
}

export async function assignStudentPlan(
  studentId: string,
  planId: string,
  startSegment: number,
  assignedBy: string,
  options?: { plan_start_date?: string; start_muraja_segment?: number | null },
): Promise<void> {
  try {
    await planFetch("/plans/assign", {
      method: "POST",
      body: JSON.stringify({
        student_id: studentId,
        plan_id: planId,
        start_segment_index: startSegment,
        plan_start_date: options?.plan_start_date,
        start_muraja_segment: options?.start_muraja_segment,
      }),
    });
    localClearPlansCache();
  } catch {
    localAssignPlan(studentId, planId, startSegment, assignedBy, options);
  }
}

export async function patchStudentAssignment(
  studentId: string,
  status: "active" | "frozen" | "transferred",
): Promise<void> {
  try {
    await planFetch("/plans/assignment", {
      method: "PATCH",
      body: JSON.stringify({ student_id: studentId, status }),
    });
  } catch {
    localPatchAssignment(studentId, status);
  }
}

export async function applyPlanInput(
  studentId: string,
  taskType: PlanTaskType,
  tap: TapValue,
  recordedBy: string,
  completedAt?: string,
): Promise<number[]> {
  try {
    const res = await planFetch<{ applied_segments: number[] }>("/plans/apply-input", {
      method: "POST",
      body: JSON.stringify({
        student_id: studentId,
        task_type: taskType,
        tap,
        completed_at: completedAt,
      }),
    });
    return res.applied_segments;
  } catch {
    return localApplyInput(studentId, taskType, tap, recordedBy, completedAt);
  }
}

export async function fetchPlanDetail(planId: string) {
  try {
    return await planFetch<{ plan: EducationPlan; segments: import("@/lib/plan-types").PlanSegment[] }>(
      `/plans/detail?plan_id=${encodeURIComponent(planId)}`,
    );
  } catch {
    const { plan, segments } = localPlanDetail(planId);
    if (!plan) throw new Error("الخطة غير موجودة");
    return { plan, segments };
  }
}
