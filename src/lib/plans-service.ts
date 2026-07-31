import { buildRphpUrl } from "@/lib/api-base";
import type {
  EducationPlan,
  ImportPlanPayload,
  PlanTaskType,
  StudentPlanSheetData,
  TapValue,
  DailyFaceQuotas,
} from "@/lib/plan-types";
import { getToken } from "@/lib/cloud-sync";
import {
  localApplyInput,
  localAssignPlan,
  localClearPlansCache,
  localDeletePlan,
  localGetStudentSheet,
  localImportPlans,
  localListPlans,
  localPatchAssignment,
  localPatchAssignmentQuotas,
  localPlanDetail,
} from "@/lib/plans-store";

function apiUrl(path: string): string {
  return buildRphpUrl(path);
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

function isPlansDbUnavailableError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const m = e.message;
  return (
    m.includes("migrate-education-plans") ||
    m.includes("جداول الخطط") ||
    m.includes("جداول الربط تحتاج") ||
    m.includes("بنية قاعدة البيانات") ||
    m.includes("HTTP 503")
  );
}

function assertPlanLinkConfirmed(sheet: StudentPlanSheetData): void {
  if (sheet.assignment && !sheet.plan) {
    throw new Error("الربط موجود لكن الخطة غير موجودة على السيرفر — أعد استيراد Excel ثم الربط");
  }
  if (!sheet.assignment || !sheet.plan) {
    throw new Error("لم يُؤكَّد الربط على السيرفر — حدّث الصفحة (Ctrl+F5) ثم أعد المحاولة");
  }
}

export async function fetchPlans(track?: "gold" | "silver"): Promise<EducationPlan[]> {
  try {
    const q = track ? `?track=${track}` : "";
    return await planFetch<EducationPlan[]>(`/plans${q}`);
  } catch (e) {
    if (isPlansDbUnavailableError(e)) {
      return filterTrack(localListPlans(), track);
    }
    throw e;
  }
}

export async function fetchStudentPlanSheet(studentId: string): Promise<StudentPlanSheetData> {
  try {
    return await planFetch<StudentPlanSheetData>(`/plans/student-sheet?student_id=${encodeURIComponent(studentId)}`);
  } catch (e) {
    if (isPlansDbUnavailableError(e)) {
      return localGetStudentSheet(studentId);
    }
    throw e;
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
  } catch (e) {
    if (isPlansDbUnavailableError(e)) {
      const r = localImportPlans(plans);
      return { plans_imported: r.plans, segments_imported: r.segments, stored_locally: true };
    }
    throw e;
  }
}

export async function assignStudentPlan(
  studentId: string,
  planId: string,
  startSegment: number,
  assignedBy: string,
  options?: {
    plan_start_date?: string;
    start_muraja_segment?: number | null;
    face_quotas?: Partial<DailyFaceQuotas>;
  },
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
        ...options?.face_quotas,
      }),
    });
    localClearPlansCache();
    const sheet = await fetchStudentPlanSheet(studentId);
    assertPlanLinkConfirmed(sheet);
  } catch (e) {
    if (isPlansDbUnavailableError(e)) {
      localAssignPlan(studentId, planId, startSegment, assignedBy, options);
      return;
    }
    throw e;
  }
}

export async function patchAssignmentFaceQuotas(
  studentId: string,
  quotas: Partial<DailyFaceQuotas>,
): Promise<void> {
  try {
    await planFetch("/plans/assignment-quotas", {
      method: "PATCH",
      body: JSON.stringify({ student_id: studentId, ...quotas }),
    });
  } catch (e) {
    if (isPlansDbUnavailableError(e)) {
      localPatchAssignmentQuotas(studentId, quotas);
      return;
    }
    throw e;
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
  } catch (e) {
    if (isPlansDbUnavailableError(e)) {
      localPatchAssignment(studentId, status);
      return;
    }
    throw e;
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

export async function deletePlan(planId: string): Promise<{ assignments_removed: number }> {
  try {
    const result = await planFetch<{ ok: boolean; assignments_removed: number }>(
      `/plans?plan_id=${encodeURIComponent(planId)}`,
      { method: "DELETE" },
    );
    localDeletePlan(planId);
    localClearPlansCache();
    return { assignments_removed: result.assignments_removed ?? 0 };
  } catch (e) {
    if (isPlansDbUnavailableError(e)) {
      const r = localDeletePlan(planId);
      return { assignments_removed: r.assignmentsRemoved };
    }
    throw e;
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
