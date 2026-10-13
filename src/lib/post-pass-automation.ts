import { pushAcademicRecord, type AcademicPhaseRecord } from "@/lib/academic-record";
import { completePlanAndAdvance, type PlanAdvanceResult } from "@/lib/plan-progression";
import { syncStudentToGlobalPhase } from "@/lib/student-phase-promote";
import { fetchStudentPlanSheet } from "@/lib/plans-service";
import type { PlanTrack } from "@/lib/plan-types";
import { notifyTeacherHalaqa } from "@/lib/teacher-notifications";

export interface SardPassPayload {
  studentId: string;
  assignmentId?: string;
  queueItemId?: string;
  phase?: "full" | "review_only";
  halaqaId: number;
  week: number;
  attempt: number;
  percent: number;
  hifzScore: number;
  reviewScore: number;
  track: PlanTrack;
  assignedBy?: string;
}

export interface PostPassResult extends PlanAdvanceResult {
  record: AcademicPhaseRecord;
}

export async function runPostPassAutomation(payload: SardPassPayload): Promise<PostPassResult> {
  const assignedBy = payload.assignedBy ?? "النظام";
  const sheet = await fetchStudentPlanSheet(payload.studentId);

  const record: AcademicPhaseRecord = {
    id: payload.assignmentId ? `ar-assignment-${payload.assignmentId}` : `ar-${Date.now()}`,
    studentId: payload.studentId,
    halaqaId: payload.halaqaId,
    week: payload.week,
    attempt: payload.attempt,
    result: "passed",
    percent: payload.percent,
    hifzScore: payload.hifzScore,
    reviewScore: payload.reviewScore,
    testDate: new Date().toISOString(),
    planId: sheet.plan?.id,
    planTitle: sheet.plan?.title,
    levelNumber: sheet.plan?.level_number,
    track: sheet.plan?.track ?? payload.track,
  };

  const advance = await completePlanAndAdvance(payload.studentId, assignedBy, payload.track, {
    planStartDate: record.testDate.slice(0, 10),
    expectedAssignmentId: payload.assignmentId,
    sardResult: payload.queueItemId ? { id: payload.queueItemId, percent: payload.percent, phase: payload.phase ?? "full" } : undefined,
  });
  pushAcademicRecord(record);
  if (advance.newGlobalPhase)
    await syncStudentToGlobalPhase(payload.studentId, advance.newGlobalPhase);
  if (advance.newPlanTitle)
    notifyTeacherHalaqa(
      payload.halaqaId,
      `بعد اجتياز السرد — انتقل الطالب إلى ${advance.newPlanTitle}`,
      "info",
    );

  return { ...advance, record };
}
