import { getDataSemester } from "@/lib/shared-state";
import { getCalendarIsoDate } from "@/lib/operational-date";
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
  studentPhase?: number;
  assignedBy?: string;
  hifzErrors?:number;hifzWarnings?:number;reviewErrors?:number[];reviewWarnings?:number[];
}

export interface PostPassResult extends PlanAdvanceResult {
  record: AcademicPhaseRecord;
}

export async function runPostPassAutomation(payload: SardPassPayload): Promise<PostPassResult> {
  const semesterId=getDataSemester();
  if(!semesterId)throw new Error("مرجع فصل التقييم غير مؤكد؛ أعد تحميل الصفحة قبل الاعتماد");
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
    planStartDate: getCalendarIsoDate(),
    expectedAssignmentId: payload.assignmentId ?? sheet.assignment?.id,
    studentPhase: payload.studentPhase,
    sardResult: payload.queueItemId ? { id: payload.queueItemId, percent: payload.percent, phase: payload.phase ?? "full",semesterId,hifzScore:payload.hifzScore,reviewScore:payload.reviewScore,hifzErrors:payload.hifzErrors,hifzWarnings:payload.hifzWarnings,reviewErrors:payload.reviewErrors,reviewWarnings:payload.reviewWarnings } : undefined,
  });
  if(!advance.record)throw new Error("لم يؤكد الخادم السجل الأكاديمي؛ لم يُعلن نجاح العملية");
  if (advance.newPlanTitle)
    notifyTeacherHalaqa(
      payload.halaqaId,
      `بعد اجتياز السرد — انتقل الطالب إلى ${advance.newPlanTitle}`,
      "info",
    );

  return { ...advance, record:advance.record };
}
