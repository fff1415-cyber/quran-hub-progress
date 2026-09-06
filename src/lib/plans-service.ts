import { buildRphpUrl } from "@/lib/api-base";
import type {
  EducationPlan,
  HalaqaPlanStatusEntry,
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
  localClearPlansCatalogCache,
  localDeletePlan,
  localGetStudentSheet,
  localGetHalaqaPlanStatuses,
  localImportPlans,
  localListPlans,
  localPatchAssignment,
  localPatchAssignmentQuotas,
  localPlanDetail,
  localRemoveHifzCompletions,
} from "@/lib/plans-store";
import { syncStudentPhaseFromPlan } from "@/lib/student-phase-promote";
import {
  compensationHifzSegmentTarget,
  compensationHifzTap,
} from "@/lib/plan-translator";
import type { Student } from "@/lib/mock-data";

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

/** One request for all plan link statuses in a halaqa (replaces per-student sheet prefetch). */
async function fetchHalaqaPlanStatusesLegacy(studentIds: string[]): Promise<HalaqaPlanStatusEntry[]> {
  const out: HalaqaPlanStatusEntry[] = [];
  const batchSize = 5;
  for (let i = 0; i < studentIds.length; i += batchSize) {
    const chunk = studentIds.slice(i, i + batchSize);
    await Promise.all(
      chunk.map(async (studentId) => {
        try {
          const sheet = await fetchStudentPlanSheet(studentId);
          const status = sheet.assignment?.status;
          if (status === "active" || status === "frozen") {
            out.push({ student_id: studentId, status });
          }
        } catch {
          /* optional UI hint */
        }
      }),
    );
  }
  return out;
}

export async function fetchHalaqaPlanStatuses(
  halaqaId: number,
  studentIds: string[] = [],
): Promise<HalaqaPlanStatusEntry[]> {
  try {
    const res = await planFetch<{ statuses: HalaqaPlanStatusEntry[] }>(
      `/plans/halaqa-status?halaqa_id=${encodeURIComponent(String(halaqaId))}`,
    );
    return res.statuses ?? [];
  } catch (e) {
    if (isPlansDbUnavailableError(e)) {
      return localGetHalaqaPlanStatuses(halaqaId);
    }
    const msg = e instanceof Error ? e.message : "";
    if (studentIds.length > 0 && (msg.includes("404") || msg.includes("Not Found"))) {
      return fetchHalaqaPlanStatusesLegacy(studentIds);
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
    localClearPlansCatalogCache();
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
    const sheet = await fetchStudentPlanSheet(studentId);
    assertPlanLinkConfirmed(sheet);
    if (sheet.plan) {
      await syncStudentPhaseFromPlan(studentId, sheet.plan.track, sheet.plan.level_number);
    }
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
  } catch (e) {
    if (isPlansDbUnavailableError(e)) {
      return localApplyInput(studentId, taskType, tap, recordedBy, completedAt);
    }
    throw e;
  }
}

export async function removePlanHifzCompletions(
  studentId: string,
  segmentIndexes: number[],
): Promise<void> {
  if (segmentIndexes.length === 0) return;
  try {
    await planFetch<{ ok: boolean }>("/plans/remove-completions", {
      method: "POST",
      body: JSON.stringify({
        student_id: studentId,
        task_type: "hifz",
        segment_indexes: segmentIndexes,
      }),
    });
  } catch (e) {
    if (isPlansDbUnavailableError(e)) {
      localRemoveHifzCompletions(studentId, segmentIndexes);
      return;
    }
    throw e;
  }
  localRemoveHifzCompletions(studentId, segmentIndexes);
}

/** Sync plan hifz completions to match weekly compensation faces (add or revert). */
export async function syncCompensationToPlan(
  student: Student,
  faces: number,
  trackedSegments: number[],
  recordedBy: string,
): Promise<number[]> {
  const target = compensationHifzSegmentTarget(faces, student.levelType);
  const tracked = [...trackedSegments];

  if (target > tracked.length) {
    const tap = compensationHifzTap(student.levelType);
    for (let i = tracked.length; i < target; i += 1) {
      const applied = await applyPlanInput(student.id, "hifz", tap, recordedBy);
      tracked.push(...applied);
    }
  } else if (target < tracked.length) {
    const toRemove = tracked.splice(target);
    await removePlanHifzCompletions(student.id, toRemove);
  }

  return tracked;
}

export async function deletePlan(planId: string): Promise<{ assignments_removed: number }> {
  try {
    const result = await planFetch<{ ok: boolean; assignments_removed: number }>(
      `/plans?plan_id=${encodeURIComponent(planId)}`,
      { method: "DELETE" },
    );
    localDeletePlan(planId);
    localClearPlansCatalogCache();
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
  } catch (e) {
    if (isPlansDbUnavailableError(e)) {
      const { plan, segments } = localPlanDetail(planId);
      if (!plan) throw new Error("الخطة غير موجودة");
      return { plan, segments };
    }
    throw e;
  }
}
