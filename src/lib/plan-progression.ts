import type { EducationPlan, PlanTrack } from "@/lib/plan-types";
import {
  findPlanByGlobalPhase,
  globalPhaseFromPlanLevel,
  nextGlobalPhase,
  murajaStartSegment,
} from "@/lib/plan-level-ranges";
import { normalizeTaskQuotas } from "@/lib/plan-daily-faces";
import { fetchPlans, assignStudentPlan, fetchStudentPlanSheet } from "@/lib/plans-service";

export interface PlanAdvanceResult {
  closedPlanTitle?: string;
  newPlanTitle?: string;
  newPlanId?: string;
  newGlobalPhase?: number;
  newPlanStartDate?: string | null;
  newPlanAssignedAt?: string | null;
}

export async function completePlanAndAdvance(
  studentId: string,
  assignedBy: string,
  track: PlanTrack,
  options?: { planStartDate?: string; expectedAssignmentId?: string; sardResult?: { id: string; percent: number; phase: string } },
): Promise<PlanAdvanceResult> {
  const sheet = await fetchStudentPlanSheet(studentId);
  if (options?.expectedAssignmentId && sheet.assignment?.id !== options.expectedAssignmentId) {
    throw new Error("تغيّرت خطة الطالب — حدّث الصفحة قبل إعادة الاعتماد");
  }
  const result: PlanAdvanceResult = {};

  if (sheet.plan) {
    result.closedPlanTitle = sheet.plan.title;
  }

  if (!sheet.plan || !sheet.assignment) throw new Error("لا توجد خطة حالية مؤكدة للطالب");

  const currentGlobal = globalPhaseFromPlanLevel(track, sheet.plan.level_number);
  if (currentGlobal === null) throw new Error("مرحلة الخطة الحالية غير صالحة");

  const nextPhase = nextGlobalPhase(track, currentGlobal);
  if (nextPhase === null) {
    return result; // Keep the final plan visible for the supervisor.
  }

  const plans = await fetchPlans(track);
  const next = findPlanByGlobalPhase(plans, track, nextPhase);
  if (!next) throw new Error("الخطة التالية غير موجودة — لم تُغلق الخطة الحالية");

  const prevQuotas = sheet.assignment ? normalizeTaskQuotas(sheet.assignment) : undefined;
  const startDate = options?.planStartDate ?? new Date().toISOString().slice(0, 10);

  await assignStudentPlan(studentId, next.id, 1, assignedBy, {
    expected_assignment_id: sheet.assignment?.id,
    sard_result: options?.sardResult,
    plan_start_date: startDate,
    start_muraja_segment: murajaStartSegment(nextPhase),
    face_quotas: prevQuotas,
  });

  const sheetAfter = await fetchStudentPlanSheet(studentId);
  if (sheetAfter.assignment) {
    result.newPlanStartDate = sheetAfter.assignment.plan_start_date ?? startDate;
    result.newPlanAssignedAt = sheetAfter.assignment.assigned_at ?? null;
  }

  result.newPlanTitle = next.title;
  result.newPlanId = next.id;
  result.newGlobalPhase = nextPhase;
  return result;
}

/** @deprecated use completePlanAndAdvance with global phase */
export function findNextPlan(plans: EducationPlan[], current: EducationPlan): EducationPlan | null {
  const track = current.track;
  const global = globalPhaseFromPlanLevel(track, current.level_number);
  if (global === null) return null;
  const next = nextGlobalPhase(track, global);
  if (next === null) return null;
  return findPlanByGlobalPhase(plans, track, next);
}
