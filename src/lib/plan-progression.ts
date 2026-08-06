import type { EducationPlan, PlanTrack } from "@/lib/plan-types";
import {
  findPlanByGlobalPhase,
  globalPhaseFromPlanLevel,
  nextGlobalPhase,
  murajaStartSegment,
} from "@/lib/plan-level-ranges";
import { normalizeTaskQuotas } from "@/lib/plan-daily-faces";
import { fetchPlans, assignStudentPlan, fetchStudentPlanSheet, patchStudentAssignment } from "@/lib/plans-service";

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
  options?: { planStartDate?: string },
): Promise<PlanAdvanceResult> {
  const sheet = await fetchStudentPlanSheet(studentId);
  const result: PlanAdvanceResult = {};

  if (sheet.plan) {
    result.closedPlanTitle = sheet.plan.title;
  }

  if (sheet.assignment?.status === "active") {
    await patchStudentAssignment(studentId, "transferred");
  }

  if (!sheet.plan) {
    return result;
  }

  const currentGlobal = globalPhaseFromPlanLevel(track, sheet.plan.level_number);
  if (currentGlobal === null) {
    return result;
  }

  const nextPhase = nextGlobalPhase(track, currentGlobal);
  if (nextPhase === null) {
    return result;
  }

  const plans = await fetchPlans(track);
  const next = findPlanByGlobalPhase(plans, track, nextPhase);
  if (!next) {
    return result;
  }

  const prevQuotas = sheet.assignment ? normalizeTaskQuotas(sheet.assignment) : undefined;
  const startDate = options?.planStartDate ?? new Date().toISOString().slice(0, 10);

  await assignStudentPlan(studentId, next.id, 1, assignedBy, {
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
