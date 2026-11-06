import type { SardHistoryItem } from "./mock-data";
import type { AcademicPhaseRecord } from "./academic-record";
import type { EducationPlan, PlanTrack } from "@/lib/plan-types";
import {
  followingPlan,
  globalPhaseFromPlanLevel,
  instituteLevelFromPlanLevel,
  legacyGlobalPhaseFromPlanLevel,
  maxGlobalPhase,
  murajaStartSegment,
} from "@/lib/plan-level-ranges";
import { normalizeTaskQuotas } from "@/lib/plan-daily-faces";
import { fetchPlans, assignStudentPlan, fetchStudentPlanSheet } from "@/lib/plans-service";

export interface PlanAdvanceResult {
  academicRecord?: AcademicPhaseRecord;
  historyRecord?: SardHistoryItem;
  completedAssignmentId?: string;
  closedPlanTitle?: string;
  newPlanTitle?: string;
  newPlanId?: string;
  newGlobalPhase?: number;
  newInstituteLevel?: string;
  newPlanStartDate?: string | null;
  newPlanAssignedAt?: string | null;
}

export async function completePlanAndAdvance(
  studentId: string,
  assignedBy: string,
  track: PlanTrack,
  options?: { planStartDate?: string; expectedAssignmentId?: string; studentPhase?: number; sardResult?: { id: string; percent: number; phase: string; academic_record?: { hifzScore: number; reviewScore: number }; write_protocol?: 2; history_record?: SardHistoryItem } },
): Promise<PlanAdvanceResult> {
  if (options?.sardResult?.write_protocol === 2) {
    const { resumePendingPlanTransition } = await import("./plans-service");
    const recovered = await resumePendingPlanTransition(studentId, options.expectedAssignmentId, options.sardResult);
    if (recovered) {
      const { sheet, receipt } = recovered, plan = sheet.plan!;
      const catalog = await fetchPlans(plan.track), phase = globalPhaseFromPlanLevel(plan.track, plan.level_number, catalog);
      const final = receipt.academic_record?.finalPlanCompleted === true;
      return { academicRecord: receipt.academic_record ?? undefined, historyRecord: receipt.sard_history_record ?? undefined, completedAssignmentId: receipt.academic_record?.assignmentId, closedPlanTitle: receipt.academic_record?.planTitle, newPlanId: final ? undefined : plan.id, newPlanTitle: final ? undefined : plan.title, newGlobalPhase: phase ?? undefined, newInstituteLevel: instituteLevelFromPlanLevel(plan.level_number) ?? undefined, newPlanStartDate: sheet.assignment?.plan_start_date, newPlanAssignedAt: sheet.assignment?.assigned_at };
    }
  }
  const sheet = await fetchStudentPlanSheet(studentId);
  if (options?.expectedAssignmentId && sheet.assignment?.id !== options.expectedAssignmentId) {
    throw new Error("تغيّرت خطة الطالب — حدّث الصفحة قبل إعادة الاعتماد");
  }
  const result: PlanAdvanceResult = { completedAssignmentId: sheet.assignment?.id };

  if (sheet.plan) {
    result.closedPlanTitle = sheet.plan.title;
  }

  if (!sheet.plan || !sheet.assignment) throw new Error("لا توجد خطة حالية مؤكدة للطالب");

  const assignmentTrack = sheet.plan.track;
  const plans = await fetchPlans(assignmentTrack);
  const currentGlobal = globalPhaseFromPlanLevel(assignmentTrack, sheet.plan.level_number, plans);
  if (currentGlobal === null) throw new Error("مرحلة الخطة الحالية غير صالحة");

  const legacy = legacyGlobalPhaseFromPlanLevel(assignmentTrack, sheet.plan.level_number);
  const effectivePhase = options?.studentPhase && options.studentPhase === legacy && options.studentPhase !== currentGlobal
    ? options.studentPhase
    : currentGlobal;
  if (effectivePhase >= maxGlobalPhase(assignmentTrack)) {
    if (options?.sardResult?.write_protocol === 2) {
      const transition = await assignStudentPlan(studentId, sheet.plan.id, sheet.assignment.start_segment_index, assignedBy, { expected_assignment_id: sheet.assignment.id, sard_result: options.sardResult, finalize_only: true });
      result.academicRecord = transition.academic_record ?? undefined; result.historyRecord = transition.sard_history_record ?? undefined;
    }
    return result; // Keep the final assignment visible; record the pass atomically without inventing a successor.
  }

  const following = followingPlan(plans, sheet.plan, options?.studentPhase);
  if (!following) throw new Error("الخطة التالية غير موجودة — لم تُغلق الخطة الحالية");
  const { plan: next, phase: nextPhase } = following;

  const prevQuotas = sheet.assignment ? normalizeTaskQuotas(sheet.assignment) : undefined;
  const startDate = options?.planStartDate ?? new Date().toISOString().slice(0, 10);

  const transition = await assignStudentPlan(studentId, next.id, 1, assignedBy, {
    expected_assignment_id: sheet.assignment?.id,
    sard_result: options?.sardResult,
    plan_start_date: startDate,
    start_muraja_segment: murajaStartSegment(nextPhase),
    face_quotas: prevQuotas,
  });

  result.academicRecord = transition?.academic_record ?? undefined;
  result.historyRecord = transition?.sard_history_record ?? undefined;
  const sheetAfter = await fetchStudentPlanSheet(studentId);
  if (sheetAfter.assignment) {
    result.newPlanStartDate = sheetAfter.assignment.plan_start_date ?? startDate;
    result.newPlanAssignedAt = sheetAfter.assignment.assigned_at ?? null;
  }

  result.newPlanTitle = next.title;
  result.newPlanId = next.id;
  result.newGlobalPhase = nextPhase;
  result.newInstituteLevel = instituteLevelFromPlanLevel(next.level_number) ?? undefined;
  return result;
}

/** @deprecated use completePlanAndAdvance with global phase */
export function findNextPlan(plans: EducationPlan[], current: EducationPlan): EducationPlan | null {
  return followingPlan(plans, current)?.plan ?? null;
}
