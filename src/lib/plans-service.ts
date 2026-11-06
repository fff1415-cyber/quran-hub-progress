import type { PlanTransitionDraft, PlanTransitionJournal, PlanTransitionReceipt } from "./plan-transition-journal";
import type { SardHistoryItem } from "./mock-data";
import type { AcademicPhaseRecord } from "./academic-record";
import { fetchWithTimeout } from "@/lib/request-timeout";
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
import { capturePlanResponse, assertPlanResponseCurrent, applyPlanSardResponse } from "@/lib/plan-response-cache";
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
  const res = await fetchWithTimeout(apiUrl(path), {
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
    throw Object.assign(new Error((body as { error?: string }).error ?? `HTTP ${res.status}`), { status: res.status });
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
          out.push({ student_id: studentId, status, assignment_id: sheet.assignment?.id });
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
    finalize_only?: boolean;
    sard_result?: { id: string; percent: number; phase: string; academic_record?: { hifzScore: number; reviewScore: number }; write_protocol?: 2; history_record?: SardHistoryItem };
  },
): Promise<{ academic_record?: AcademicPhaseRecord | null; sard_history_record?: SardHistoryItem | null }> {
  if (!Number.isInteger(startSegment) || startSegment < 1) throw new Error("مقطع البداية يجب أن يكون عددًا صحيحًا موجبًا");
  const responseSnapshot = capturePlanResponse();
  const expectedAssignment = options?.expected_assignment_id ?? (await fetchStudentPlanSheet(studentId)).assignment?.id ?? "";
  assertPlanResponseCurrent(responseSnapshot);
  const request = { method: "POST", body: JSON.stringify({ student_id: studentId, expected_assignment_id: expectedAssignment, only_if_unassigned: options?.only_if_unassigned, finalize_only: options?.finalize_only, sard_result: options?.sard_result, plan_id: planId, start_segment_index: startSegment, plan_start_date: options?.plan_start_date, start_muraja_segment: options?.start_muraja_segment, ...options?.face_quotas }) };
  if (options?.sard_result?.write_protocol === 2 && options.sard_result.history_record) {
    const { currentPlanTransitionJournal } = await import("./plan-transition-journal");
    assertPlanResponseCurrent(responseSnapshot);
    const journal = currentPlanTransitionJournal(); if (!journal) throw Error("تعذّر تثبيت هوية انتقال الخطة؛ لم يُرسل الطلب");
    const entry = journal.begin(studentId, expectedAssignment, request.body);
    return (await executePlanTransition(journal, entry)).receipt;
  }
  type AssignmentResult = { academic_record?: AcademicPhaseRecord | null; assignment_id: string; sard_queue?: unknown[] | null; student_phase?: { phase_number: number; level: string; institute_level: string } };
  const send = () => planFetch<AssignmentResult>("/plans/assign", request);
  let result: AssignmentResult;
  try { result = await send(); }
  catch (error) {
    // Only packets carrying an academic result have a server-side immutable transition receipt.
    if (!options?.sard_result?.academic_record) throw error;
    assertPlanResponseCurrent(responseSnapshot);
    result = await send();
  }
  applyPlanSardResponse(responseSnapshot, result.sard_queue);
  let sheet: StudentPlanSheetData;
  try {
    sheet = await fetchStudentPlanSheet(studentId);
  } catch {
    throw new Error("استجاب الخادم لطلب الربط، لكن تعذّر التحقق من الخطة؛ افتح استمارة الطالب قبل إعادة المحاولة");
  }
  assertPlanResponseCurrent(responseSnapshot);
  if (!result.assignment_id || sheet.assignment?.id !== result.assignment_id || sheet.plan?.id !== planId) {
    throw new Error("تعذّر تأكيد الخطة المرتبطة من الخادم؛ افتح استمارة الطالب قبل إعادة المحاولة");
  }
  if (result.student_phase) {
    const { loadStudents, saveStudents } = await import("@/lib/mock-data");
    assertPlanResponseCurrent(responseSnapshot);
    const profile = result.student_phase;
    try {
      saveStudents(loadStudents().map(student => student.id === studentId ? { ...student, phaseNumber: profile.phase_number, level: profile.level, instituteLevel: profile.institute_level } : student));
    } catch {
      throw new Error("ثُبّت التعيين والمرحلة على الخادم؛ تعذّر تحديث ذاكرة هذا الجهاز. أعد تحميل البيانات بدل تكرار الانتقال");
    }
  }
  assertPlanResponseCurrent(responseSnapshot);
  return { academic_record: result.academic_record };
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
  const responseSnapshot = capturePlanResponse();
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
  applyPlanSardResponse(responseSnapshot, result.sard_queue);
  const sheet = await fetchStudentPlanSheet(studentId);
  assertPlanResponseCurrent(responseSnapshot);
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

/** Persisted requests are replayed verbatim; current sheet/profile/queue reads replace old receipt snapshots. */
async function runPlanTransition(journal: PlanTransitionJournal, entry: PlanTransitionDraft) {
  const before = capturePlanResponse();
  const { currentPlanTransitionJournal } = await import("./plan-transition-journal");
  const assertCurrent = () => { assertPlanResponseCurrent(before); if (currentPlanTransitionJournal()?.prefix !== journal.prefix) throw Error("تغيّرت هوية الانتقال؛ بقي طلب الحساب السابق محفوظًا"); };
  assertCurrent();
  if (entry.status === "conflict" || entry.status === "historical") throw Error(entry.message ?? "راجع ورقة الطالب قبل إعادة معالجة الطلب");
  let receipt = entry.receipt;
  if (!receipt) {
    try {
      const capability = await planFetch<{ context_complex_id: number; transition_write_protocol: number; immutable_receipts: boolean; academic_record: boolean; sard_history: boolean }>("/plans/capabilities");
      assertCurrent();
      if (capability.context_complex_id !== journal.cid || capability.transition_write_protocol !== 2 || capability.immutable_receipts !== true || capability.academic_record !== true || capability.sard_history !== true) throw Error("الخادم لا يؤكد بروتوكول الخطة وتفاصيل الاختبار؛ لم يُرسل الطلب");
    } catch (error) { assertCurrent(); journal.update(entry, "pending", error instanceof Error ? error.message : "تعذّر تأكيد قدرة الخادم؛ لم يُرسل الطلب"); throw error; }
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        receipt = await planFetch<PlanTransitionReceipt>("/plans/assign", { method: "POST", body: entry.body });
        assertCurrent(); journal.commit(entry, receipt); break;
      } catch (error) {
        assertCurrent(); const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
        const conflict = [400, 403, 409].includes(status);
        journal.update(entry, conflict ? "conflict" : "pending", error instanceof Error ? error.message : "لم يتأكد الانتقال");
        if (conflict || attempt === 1) throw error;
      }
    }
  }
  if (!receipt) throw Error("لم يُثبت إيصال الانتقال؛ بقي الطلب محفوظًا");
  try {
    const sheet = await fetchStudentPlanSheet(entry.student); assertCurrent();
    if (sheet.assignment?.id !== receipt.assignment_id || sheet.plan?.id !== entry.plan) {
      const message = "يوجد إيصال انتقال مؤكد، لكن الخطة الحالية مختلفة؛ راجع السجل دون إعادة ربط خطة قديمة";
      journal.update(entry, "historical", message, receipt); throw Error(message);
    }
    const { refreshSardQueueFromShared } = await import("./sard-queue-refresh");
    const { hasPendingSardWrites, loadStudents, saveStudents, pushSardHistory } = await import("./mock-data");
    assertCurrent(); if (hasPendingSardWrites()) throw Error("ثُبّت الانتقال؛ توجد تعديلات قائمة سرد معلقة يجب حسمها قبل تأكيد عرض النتيجة");
    await refreshSardQueueFromShared(); assertCurrent();
    const { secureListStudents } = await import("./secure-data.functions");
    const students = await secureListStudents({ data: { token: before.token! } }); assertCurrent();
    const row = students.find((item): item is Record<string, unknown> => !!item && typeof item === "object" && "id" in item && item.id === entry.student);
    if (!row || row.complex_id !== undefined && Number(row.complex_id) !== journal.cid || !Number.isInteger(Number(row.phase_number)) || Number(row.phase_number) < 1 || typeof row.level !== "string" || typeof row.institute_level !== "string") throw Error("ثُبّت الانتقال؛ تعذّر تأكيد بيانات الطالب الحالية من الخادم");
    if (!receipt.student_phase || Number(row.phase_number) !== receipt.student_phase.phase_number || row.level !== receipt.student_phase.level || row.institute_level !== receipt.student_phase.institute_level) throw Error("ثُبّت الانتقال، لكن بيانات المرحلة تغيّرت بعده؛ راجع الخطة الحالية دون إعادة كتابة ملف الطالب");
    saveStudents(loadStudents().map(student => student.id === entry.student ? { ...student, phaseNumber: Number(row.phase_number), level: String(row.level), instituteLevel: String(row.institute_level) } : student));
    const { pushAcademicRecord } = await import("./academic-record"); assertCurrent();
    if (receipt.academic_record) pushAcademicRecord(receipt.academic_record, { sync: false });
    if (receipt.sard_history_record) pushSardHistory(receipt.sard_history_record, { sync: false });
    journal.update(entry, "verified", undefined, receipt); return { receipt, sheet };
  } catch (error) {
    assertCurrent();
    if (journal.entries().find(e => e.id === entry.id)?.status !== "historical") journal.update(entry, "committed", error instanceof Error ? error.message : "ثُبّت الانتقال؛ تعذّر تحديث العرض", receipt);
    throw error;
  }
}
const transitionRuns = new Map<string, Promise<{ receipt: PlanTransitionReceipt; sheet: StudentPlanSheetData }>>();
function executePlanTransition(journal: PlanTransitionJournal, entry: PlanTransitionDraft) {
  const context = capturePlanResponse(), key = JSON.stringify([journal.prefix, entry.id, context.token, context.complex]);
  const existing = transitionRuns.get(key); if (existing) return existing;
  const pending = runPlanTransition(journal, entry).finally(() => { if (transitionRuns.get(key) === pending) transitionRuns.delete(key); });
  transitionRuns.set(key, pending); return pending;
}
export async function resumePendingPlanTransition(student: string, expected?: string, offered?: unknown) {
  const { currentPlanTransitionJournal } = await import("./plan-transition-journal");
  const journal = currentPlanTransitionJournal(); if (!journal) return null;
  const entry = journal.find(student, expected, offered); return entry ? executePlanTransition(journal, entry) : null;
}
export async function resumePlanTransitionById(id: string) {
  const { currentPlanTransitionJournal } = await import("./plan-transition-journal");
  const journal = currentPlanTransitionJournal(), entry = journal?.entries().find(e => e.id === id); if (!journal || !entry) throw Error("طلب الانتقال غير متاح للحساب الحالي");
  return executePlanTransition(journal, entry);
}
