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

export async function fetchPlans(track?: "gold" | "silver", includeArchived = false): Promise<EducationPlan[]> {
  const params = new URLSearchParams();
  if (track) params.set("track", track);
  if (includeArchived) params.set("include_archived", "1");
  const q = params.size ? `?${params}` : "";
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

export interface PlanAssignmentResult {
  assignment_id:string;
  sard_queue?: unknown[] | null;
  advance?: import("./plan-progression").PlanAdvanceResult;
  profile?: {id:string;level:string;phaseNumber:number;instituteLevel:string};
  academic_records?: import("./academic-record").AcademicPhaseRecord[];
  sard_history?: import("./mock-data").SardHistoryItem[];
}
const pendingAssignmentKey=(studentId:string)=>`qs_pending_plan_assignment:${studentId}`;
async function submitPlanAssignment(payload: Record<string, unknown>): Promise<PlanAssignmentResult> {
  const studentId=String(payload.student_id);
  const result=await planFetch<PlanAssignmentResult>("/plans/assign",{method:"POST",body:JSON.stringify(payload)});
  if(result.sard_queue)localStorage.setItem("qshatawi_sard_queue_v2",JSON.stringify(result.sard_queue));
  const sheet=await fetchStudentPlanSheet(studentId);
  if(!result.assignment_id||sheet.assignment?.id!==result.assignment_id||sheet.plan?.id!==payload.plan_id)throw new Error("استجاب الخادم، لكن تعذّر تأكيد التعيين الحالي؛ عملية الربط محفوظة لإعادة المحاولة");
  if(result.profile){
    const {loadStudents,saveStudents}=await import("./mock-data");
    saveStudents(loadStudents().map(student=>student.id===studentId?{...student,...result.profile}:student));
  }
  if(result.academic_records||result.sard_history){
    const previous=sessionStorage.getItem("qs_syncing");sessionStorage.setItem("qs_syncing","1");
    try{
      if(result.academic_records)(await import("./academic-record")).saveAcademicRecords(result.academic_records);
      if(result.sard_history)(await import("./mock-data")).saveSardHistory(result.sard_history);
    }finally{if(previous)sessionStorage.setItem("qs_syncing",previous);else sessionStorage.removeItem("qs_syncing");}
  }
  localStorage.removeItem(pendingAssignmentKey(studentId));
  return result;
}
export async function retryPendingPlanAdvance(studentId:string,queueId?:string):Promise<import("./plan-progression").PlanAdvanceResult|null>{
  const raw=localStorage.getItem(pendingAssignmentKey(studentId));if(!raw)return null;
  const payload=JSON.parse(raw);
  if(!queueId||payload.sard_result?.id!==queueId)throw new Error("عملية تعيين أخرى معلقة؛ يلزم تأكيدها أولًا");
  const result=await submitPlanAssignment(payload);if(!result.advance)throw new Error("استجابة الانتقال غير مكتملة");return result.advance;
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
    sard_result?: { id: string; percent: number; phase: string; semesterId?:string;hifzScore?:number;reviewScore?:number;hifzErrors?:number;hifzWarnings?:number;reviewErrors?:number[];reviewWarnings?:number[] };
    finalize_only?:boolean;
    operation_id?: string;
  },
): Promise<PlanAssignmentResult> {
  const operationId = options?.operation_id ?? crypto.randomUUID();
  const expectedSheet = options?.expected_assignment_id !== undefined ? null : await fetchStudentPlanSheet(studentId);
  const expectedAssignmentId = options?.expected_assignment_id ?? expectedSheet?.assignment?.id ?? "";
  const payload:Record<string,unknown>={
    student_id:studentId,expected_assignment_id:expectedAssignmentId,operation_id:operationId,sard_result:options?.sard_result,
    plan_id:planId,start_segment_index:startSegment,plan_start_date:options?.plan_start_date,start_muraja_segment:options?.start_muraja_segment,finalize_only:options?.finalize_only,...options?.face_quotas,
  };
  const raw=localStorage.getItem(pendingAssignmentKey(studentId));
  if(raw){
    const pending=JSON.parse(raw);
    if(pending.plan_id!==planId||pending.start_segment_index!==startSegment||pending.sard_result?.id!==options?.sard_result?.id)throw new Error("عملية تعيين سابقة معلقة؛ أكدها قبل اختيار تعيين آخر");
    return submitPlanAssignment(pending);
  }
  localStorage.setItem(pendingAssignmentKey(studentId),JSON.stringify(payload));
  return submitPlanAssignment(payload);
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
): Promise<void> {
  await planFetch("/plans/assignment-quotas", {
      method: "PATCH",
      body: JSON.stringify({ student_id: studentId, ...quotas }),
    });
}

export async function patchStudentAssignment(
  studentId: string,
  status: "active" | "frozen" | "transferred",
): Promise<void> {
  await planFetch("/plans/assignment", {
      method: "PATCH",
      body: JSON.stringify({ student_id: studentId, assignment_id: (await fetchStudentPlanSheet(studentId)).assignment?.id, status }),
    });
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
        operation_id: crypto.randomUUID(),
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
  assignmentId?: string,
): Promise<void> {
  if (segmentIndexes.length === 0) return;
  if (!assignmentId) throw new Error("تعيين إنجاز اليوم غير محفوظ — افتح الاستمارة للمراجعة؛ لن نلغِ من الخطة الحالية بالتخمين");
  await planFetch<{ ok: boolean }>("/plans/remove-completions", {
      method: "POST",
      body: JSON.stringify({
        student_id: studentId,
        task_type: "hifz",
        assignment_id: assignmentId,
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
  const assignmentId = (await fetchStudentPlanSheet(student.id)).assignment?.id;
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
    await removePlanHifzCompletions(student.id, toRemove, assignmentId);
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
