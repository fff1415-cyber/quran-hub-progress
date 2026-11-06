import type { SardHistoryItem } from "./mock-data";
import { pushAcademicRecord, type AcademicPhaseRecord } from "@/lib/academic-record";
import { completePlanAndAdvance, type PlanAdvanceResult } from "@/lib/plan-progression";
import { syncStudentToGlobalPhase } from "@/lib/student-phase-promote";
import { fetchStudentPlanSheet } from "@/lib/plans-service";
import type { PlanTrack } from "@/lib/plan-types";
import { notifyTeacherHalaqa } from "@/lib/teacher-notifications";

export interface SardPassPayload {
  historyRecord?: SardHistoryItem;
  planStartDate?: string;
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
}

export interface PostPassResult extends PlanAdvanceResult {
  record: AcademicPhaseRecord;
}

export async function runPostPassAutomation(payload: SardPassPayload): Promise<PostPassResult> {
  let pending: { journal: import("./plan-transition-journal").PlanTransitionJournal; intent: import("./plan-transition-journal").PlanPassIntent } | undefined;
  if (payload.historyRecord) {
    const { currentPlanTransitionJournal } = await import("./plan-transition-journal");
    const journal = currentPlanTransitionJournal(); if (!journal) throw Error("تعذّر تثبيت هوية الاجتياز؛ لم يبدأ طلب");
    const intent = journal.prepare(payload); pending = { journal, intent }; payload = intent.payload;
    if (intent.status === "blocked") throw Error(intent.message);
  }
  try {
  // Freeze the complete result first, even if flushing older queue edits fails offline.
  if (pending) { const { flushSardQueue } = await import("./mock-data"); await flushSardQueue(); }
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
    planStartDate: payload.planStartDate ?? record.testDate.slice(0, 10),
    expectedAssignmentId: payload.assignmentId ?? sheet.assignment?.id,
    studentPhase: payload.studentPhase,
    sardResult: payload.queueItemId ? { id: payload.queueItemId, percent: payload.percent, phase: payload.phase ?? "full", academic_record: { hifzScore: payload.hifzScore, reviewScore: payload.reviewScore }, ...(payload.historyRecord ? { write_protocol: 2 as const, history_record: payload.historyRecord } : {}) } : undefined,
  });
  if (payload.queueItemId && advance.newPlanId && !advance.academicRecord) throw new Error("لم يؤكد الخادم السجل الأكاديمي؛ افتح سجل الطالب قبل إعادة الانتقال");
  if (payload.historyRecord && !advance.historyRecord) throw new Error("لم يؤكد الخادم تفاصيل الاختبار مع الخطة؛ بقي الطلب للاستعادة");
  const confirmedRecord = advance.academicRecord ?? record;
  if (!advance.historyRecord) pushAcademicRecord(confirmedRecord, { sync: !advance.academicRecord });
  // The server commits the profile phase with its assignment; no independent late PATCH can regress it.
  if (advance.newPlanTitle && !advance.academicRecord)
    notifyTeacherHalaqa(
      payload.halaqaId,
      `بعد اجتياز السرد — انتقل الطالب إلى ${advance.newPlanTitle}`,
      "info",
    );

  return { ...advance, record: confirmedRecord };
  } catch (error) { if (pending) pending.journal.noteIntent(pending.intent, error instanceof Error ? error.message : "لم يتأكد الاجتياز"); throw error; }
}
