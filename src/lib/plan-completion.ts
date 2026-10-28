import { planHifzProgress } from "@/lib/plan-progress";
import { enqueuePlanCompleted, loadSardQueue, flushSardQueue, type Student } from "@/lib/mock-data";
import { fetchStudentPlanSheet } from "@/lib/plans-service";
import { notifyTeacherHalaqa } from "@/lib/teacher-notifications";

export function isPlanHifzComplete(
  sheet: Awaited<ReturnType<typeof fetchStudentPlanSheet>>,
): boolean {
  return planHifzProgress(sheet).complete;
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
  if (loadSardQueue().some((q) => q.assignmentId === sheet.assignment?.id
    && !(q.status === "archived" && q.archiveReason === "supervisor_hifz_removed"))) return false;

  const planTitle = sheet.plan?.title ?? "الخطة التعليمية";
  enqueuePlanCompleted(student.id, student.halaqaId, weekNum, planTitle, sheet.assignment?.id);

  await flushSardQueue();
  notifyTeacherHalaqa(
    student.halaqaId,
    `الطالب ${student.name} أنهى ${planTitle} — بانتظار تحويل المشرف للسرد`,
    "info",
  );

  return true;
}
