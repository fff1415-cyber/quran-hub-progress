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
import { localGetStudentSheet } from "@/lib/plans-store";
import { syncStudentPhaseFromPlan } from "@/lib/student-phase-promote";
import { compensationHifzSegmentTarget, compensationHifzTap } from "@/lib/plan-translator";
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

export async function fetchPlans(track?: "gold" | "silver"): Promise<EducationPlan[]> {
  const q = track ? `?track=${track}` : "";
  return planFetch<EducationPlan[]>(`/plans${q}`);
}

export async function fetchStudentPlanSheet(studentId: string): Promise<StudentPlanSheetData> {
  return planFetch<StudentPlanSheetData>(
    `/plans/student-sheet?student_id=${encodeURIComponent(studentId)}`,
  );
}

/** Older versions could confirm a link in browser storage without writing it to the server. */
export function unconfirmedLocalPlanLink(studentId: string, serverSheet: StudentPlanSheetData) {
  if (serverSheet.assignment) return null;
  const local = localGetStudentSheet(studentId);
  return local.assignment ? { assignment: local.assignment, plan: local.plan } : null;
}

/** One request for all plan link statuses in a halaqa (replaces per-student sheet prefetch). */
async function fetchHalaqaPlanStatusesLegacy(
  studentIds: string[],
): Promise<HalaqaPlanStatusEntry[]> {
  const out: HalaqaPlanStatusEntry[] = [];
  const batchSize = 5;
  for (let i = 0; i < studentIds.length; i += batchSize) {
    const chunk = studentIds.slice(i, i + batchSize);
    await Promise.all(
      chunk.map(async (studentId) => {
        const sheet = await fetchStudentPlanSheet(studentId);
        const status = sheet.assignment?.status;
        if (status === "active" || status === "frozen") {
          out.push({ student_id: studentId, status });
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
}> {
  return planFetch("/plans/import", {
    method: "POST",
    body: JSON.stringify({ plans }),
  });
}

export async function assignStudentPlan(
  studentId: string,
  planId: string,
  startSegment: number,
  _assignedBy: string,
  options?: {
    plan_start_date?: string;
    start_muraja_segment?: number | null;
    face_quotas?: Partial<DailyFaceQuotas>;
    expected_assignment_id?: string;
    only_if_unassigned?: boolean;
    sard_result?: { id: string; percent: number; phase: string };
  },
): Promise<void> {
  if (!Number.isInteger(startSegment) || startSegment < 1) throw new Error("مقطع البداية يجب أن يكون عددًا صحيحًا موجبًا");
  const expectedAssignment = options?.expected_assignment_id ?? (await fetchStudentPlanSheet(studentId)).assignment?.id ?? "";
  const result = await planFetch<{ assignment_id: string; sard_queue?: unknown[] | null }>("/plans/assign", {
      method: "POST",
      body: JSON.stringify({
        student_id: studentId,
        expected_assignment_id: expectedAssignment,
        only_if_unassigned: options?.only_if_unassigned,
        sard_result: options?.sard_result,
        plan_id: planId,
        start_segment_index: startSegment,
        plan_start_date: options?.plan_start_date,
        start_muraja_segment: options?.start_muraja_segment,
        ...options?.face_quotas,
      }),
    });
  if (result.sard_queue) localStorage.setItem("qshatawi_sard_queue_v2", JSON.stringify(result.sard_queue));
  let sheet: StudentPlanSheetData;
  try {
    sheet = await fetchStudentPlanSheet(studentId);
  } catch {
    throw new Error("استجاب الخادم لطلب الربط، لكن تعذّر التحقق من الخطة؛ افتح استمارة الطالب قبل إعادة المحاولة");
  }
  if (!result.assignment_id || sheet.assignment?.id !== result.assignment_id || sheet.plan?.id !== planId) {
    throw new Error("تعذّر تأكيد الخطة المرتبطة من الخادم؛ افتح استمارة الطالب قبل إعادة المحاولة");
  }
  try {
    const catalog = await fetchPlans(sheet.plan.track);
    await syncStudentPhaseFromPlan(studentId, sheet.plan.track, sheet.plan.level_number, catalog);
  } catch {
    // The assignment is already confirmed on the server; avoid reporting a failed link.
  }
}

/** Only the educational supervisor can change an individual hifz row. */
export async function updateSupervisorPlanHifz(
  studentId: string,
  assignmentId: string,
  segmentIndex: number,
  action: "complete" | "remove",
  completedAt: string,
  week: number,
): Promise<StudentPlanSheetData> {
  const result = await planFetch<{ ok: boolean; sard_queue: unknown[] }>("/plans/supervisor-hifz", {
    method: "POST",
    body: JSON.stringify({
      student_id: studentId,
      assignment_id: assignmentId,
      segment_index: segmentIndex,
      action,
      completed_at: completedAt,
      week,
    }),
  });
  if (!result.ok || !Array.isArray(result.sard_queue)) throw new Error("تعذّر تأكيد تعديل الحفظ من الخادم");
  localStorage.setItem("qshatawi_sard_queue_v2", JSON.stringify(result.sard_queue));
  const sheet = await fetchStudentPlanSheet(studentId);
  if (sheet.assignment?.id !== assignmentId) throw new Error("تغيّرت الخطة؛ أعد فتح استمارة الطالب");
  return sheet;
}

export async function patchAssignmentFaceQuotas(
  studentId: string,
  quotas: Partial<DailyFaceQuotas>,
  assignmentId: string,
): Promise<void> {
  if (!assignmentId) throw new Error("حدّث الاستمارة لتحديد التعيين قبل تحديث الكميات");
  const result = await planFetch<{ok:boolean; assignment_id:string}>("/plans/assignment-quotas", {
      method: "PATCH",
      body: JSON.stringify({ ...quotas, student_id: studentId, assignment_id: assignmentId }),
    });
  if (!result.ok || result.assignment_id !== assignmentId) throw new Error("تعذّر تأكيد كميات التعيين من الخادم");
}

export async function patchStudentAssignment(
  studentId: string,
  status: "active" | "frozen" | "transferred",
  assignmentId: string,
): Promise<void> {
  if (!assignmentId) throw new Error("حدّث استمارة الطالب لتحديد التعيين");
  const result = await planFetch<{ok: boolean; assignment_id: string; status: string}>("/plans/assignment", {
      method: "PATCH",
      body: JSON.stringify({ student_id: studentId, assignment_id: assignmentId, status }),
    });
  if (!result.ok || result.assignment_id !== assignmentId || result.status !== status) throw new Error("تعذّر تأكيد حالة التعيين من الخادم");
}

export async function applyPlanInput(
  studentId: string,
  taskType: PlanTaskType,
  tap: TapValue,
  _recordedBy: string,
  completedAt?: string,
): Promise<number[]> {
  const currentSheet = await fetchStudentPlanSheet(studentId);
  const res = await planFetch<{ applied_segments: number[] }>("/plans/apply-input", {
      method: "POST",
      body: JSON.stringify({
        student_id: studentId,
        expected_assignment_id: currentSheet.assignment?.id,
        task_type: taskType,
        tap,
        completed_at: completedAt,
      }),
    });
  return res.applied_segments;
}

export async function removePlanHifzCompletions(
  studentId: string,
  segmentIndexes: number[],
): Promise<void> {
  if (segmentIndexes.length === 0) return;
  await planFetch<{ ok: boolean }>("/plans/remove-completions", {
      method: "POST",
      body: JSON.stringify({
        student_id: studentId,
        task_type: "hifz",
        segment_indexes: segmentIndexes,
      }),
    });
}

export async function lastCompletedHifzSegments(
  studentId: string,
  count: number,
): Promise<number[]> {
  if (count <= 0) return [];
  const sheet = await fetchStudentPlanSheet(studentId);
  const done = sheet.completions
    .filter((c) => c.task_type === "hifz")
    .sort((a, b) => {
      const dt = (a.completed_at ?? "").localeCompare(b.completed_at ?? "");
      if (dt !== 0) return dt;
      return a.segment_index - b.segment_index;
    });
  return done.slice(-count).map((c) => c.segment_index);
}

/** Sync plan hifz completions to match weekly compensation faces (add or revert). */
export async function syncCompensationToPlan(
  student: Student,
  faces: number,
  trackedSegments: number[],
  recordedBy: string,
  previousFaces?: number,
): Promise<number[]> {
  const target = compensationHifzSegmentTarget(faces, student.levelType);
  const tracked = [...trackedSegments];

  if (tracked.length === 0 && previousFaces != null) {
    const prevTarget = compensationHifzSegmentTarget(previousFaces, student.levelType);
    if (prevTarget > target) {
      tracked.push(...(await lastCompletedHifzSegments(student.id, prevTarget - target)));
    }
  }

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
  const result = await planFetch<{ ok: boolean; assignments_removed: number }>(
      `/plans?plan_id=${encodeURIComponent(planId)}`,
      { method: "DELETE" },
    );
  return { assignments_removed: result.assignments_removed ?? 0 };
}

export async function fetchPlanDetail(planId: string) {
  return planFetch<{
      plan: EducationPlan;
      segments: import("@/lib/plan-types").PlanSegment[];
    }>(`/plans/detail?plan_id=${encodeURIComponent(planId)}`);
}
