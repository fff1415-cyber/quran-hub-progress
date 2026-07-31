import {
  enqueuePlanCompleted,
  loadSardQueue,
  type Student,
} from "@/lib/mock-data";
import { fetchStudentPlanSheet } from "@/lib/plans-service";
import { notifyTeacherHalaqa } from "@/lib/teacher-notifications";

export function isPlanHifzComplete(sheet: Awaited<ReturnType<typeof fetchStudentPlanSheet>>): boolean {
  if (!sheet.assignment || !sheet.plan || sheet.segments.length === 0) return false;
  const start = sheet.assignment.start_segment_index;
  const visible = sheet.segments.filter((s) => s.segment_index >= start);
  if (visible.length === 0) return false;
  const hifzDone = new Set(
    sheet.completions.filter((c) => c.task_type === "hifz").map((c) => c.segment_index),
  );
  return visible.every((s) => hifzDone.has(s.segment_index));
}

function alreadyQueuedForPlan(studentId: string): boolean {
  return loadSardQueue().some(
    (q) =>
      q.studentId === studentId &&
      (q.status === "plan_completed" ||
        q.status === "pending" ||
        q.status === "scheduled" ||
        q.status === "awaiting_review" ||
        q.status === "approved_third" ||
        q.status === "awaiting_supervisor"),
  );
}

/** After plan input — if hifz complete, queue for supervisor and notify teacher. */
export async function checkAndHandlePlanCompletion(
  student: Student,
  weekNum: number,
): Promise<boolean> {
  if (alreadyQueuedForPlan(student.id)) return false;

  const sheet = await fetchStudentPlanSheet(student.id);
  if (!isPlanHifzComplete(sheet)) return false;

  const planTitle = sheet.plan?.title ?? "الخطة التعليمية";
  enqueuePlanCompleted(student.id, student.halaqaId, weekNum, planTitle);

  notifyTeacherHalaqa(
    student.halaqaId,
    `الطالب ${student.name} أنهى ${planTitle} — بانتظار تحويل المشرف للسرد`,
    "info",
  );

  return true;
}
