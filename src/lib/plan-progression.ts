import type { EducationPlan, PlanTrack } from "@/lib/plan-types";
import { fetchPlans, assignStudentPlan, fetchStudentPlanSheet, patchStudentAssignment } from "@/lib/plans-service";

export function findNextPlan(plans: EducationPlan[], current: EducationPlan): EducationPlan | null {
  const sameTrack = plans
    .filter((p) => p.track === current.track)
    .sort((a, b) => a.level_number - b.level_number);
  const idx = sameTrack.findIndex((p) => p.id === current.id);
  if (idx < 0) {
    const nextLevel = current.level_number + 1;
    return sameTrack.find((p) => p.level_number === nextLevel) ?? null;
  }
  return sameTrack[idx + 1] ?? null;
}

export interface PlanAdvanceResult {
  closedPlanTitle?: string;
  newPlanTitle?: string;
  newPlanId?: string;
}

export async function completePlanAndAdvance(
  studentId: string,
  assignedBy: string,
  track: PlanTrack,
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

  const plans = await fetchPlans(track);
  const next = findNextPlan(plans, sheet.plan);
  if (!next) {
    return result;
  }

  const today = new Date().toISOString().slice(0, 10);
  await assignStudentPlan(studentId, next.id, 1, assignedBy, {
    plan_start_date: today,
    start_muraja_segment: next.level_number % 1000 === 1 ? 1 : null,
  });

  result.newPlanTitle = next.title;
  result.newPlanId = next.id;
  return result;
}
