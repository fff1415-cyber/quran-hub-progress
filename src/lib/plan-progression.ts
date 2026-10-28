import { getCalendarIsoDate } from "@/lib/operational-date";
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
import { fetchPlans, assignStudentPlan, fetchStudentPlanSheet, retryPendingPlanAdvance } from "@/lib/plans-service";

export interface PlanAdvanceResult {
  record?: import("./academic-record").AcademicPhaseRecord;
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
  options?: { planStartDate?: string; expectedAssignmentId?: string; studentPhase?: number; sardResult?: { id: string; percent: number; phase: string; semesterId?:string;hifzScore?:number;reviewScore?:number;hifzErrors?:number;hifzWarnings?:number;reviewErrors?:number[];reviewWarnings?:number[] } },
): Promise<PlanAdvanceResult> {
  const pending=await retryPendingPlanAdvance(studentId,options?.sardResult?.id);
  if(pending)return pending;
  const sheet = await fetchStudentPlanSheet(studentId);
  if (options?.expectedAssignmentId && sheet.assignment?.id !== options.expectedAssignmentId) {
    throw new Error("تغيّرت خطة الطالب — حدّث الصفحة قبل إعادة الاعتماد");
  }
  const result: PlanAdvanceResult = { completedAssignmentId: sheet.assignment?.id };

  if (sheet.plan) {
    result.closedPlanTitle = sheet.plan.title;
  }

  if (!sheet.plan || !sheet.assignment) throw new Error("لا توجد خطة حالية مؤكدة للطالب");

  const plans = await fetchPlans(track, true);
  const currentGlobal = globalPhaseFromPlanLevel(track, sheet.plan.level_number, plans);
  if (currentGlobal === null) throw new Error("مرحلة الخطة الحالية غير صالحة");

  const legacy = legacyGlobalPhaseFromPlanLevel(track, sheet.plan.level_number);
  const effectivePhase = options?.studentPhase && options.studentPhase === legacy && options.studentPhase !== currentGlobal
    ? options.studentPhase
    : currentGlobal;
  if (effectivePhase >= maxGlobalPhase(track)) {
    const confirmed=await assignStudentPlan(studentId,sheet.plan.id,sheet.assignment.start_segment_index,assignedBy,{expected_assignment_id:sheet.assignment.id,sard_result:options?.sardResult,finalize_only:true});
    return confirmed?.advance ?? result; // Final sheet remains visible; result/history commit on the server.
  }

  const following = followingPlan(plans, sheet.plan, options?.studentPhase);
  if (!following) throw new Error("الخطة التالية غير موجودة — لم تُغلق الخطة الحالية");
  const { plan: next, phase: nextPhase } = following;

  const prevQuotas = sheet.assignment ? normalizeTaskQuotas(sheet.assignment) : undefined;
  const startDate = options?.planStartDate ?? getCalendarIsoDate();

  const confirmed=await assignStudentPlan(studentId, next.id, 1, assignedBy, {
    expected_assignment_id: sheet.assignment?.id,
    sard_result: options?.sardResult,
    plan_start_date: startDate,
    start_muraja_segment: murajaStartSegment(nextPhase),
    face_quotas: prevQuotas,
  });

  if(confirmed?.advance)return confirmed.advance;
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
