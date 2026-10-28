import { fetchActiveCalendar } from "@/lib/academic-context";
import {
  findPlanByGlobalPhase,
  murajaStartSegment,
  validateLevelAndPhase,
  type InstituteLevel,
} from "@/lib/plan-level-ranges";
import { resolveFaceQuotas } from "@/lib/plan-daily-faces";
import type { EducationPlan, PlanTrack } from "@/lib/plan-types";
import { assignStudentPlan, fetchPlans, fetchStudentPlanSheet } from "@/lib/plans-service";

export interface LinkStudentPlanOptions {
  studentId: string;
  track: PlanTrack;
  instituteLevel: string;
  globalPhase: number;
  startHifzSegment?: number;
  dailyRabtFaces?: number;
  dailyMurajaFaces?: number;
  planStartDate?: string | null;
  assignedBy: string;
  /** Skip plan link if plan not found (import continues). */
  optional?: boolean;
  /** Pre-loaded catalog (bulk import — one fetchPlans per track). */
  plansCache?: EducationPlan[];
}

export async function linkStudentToPlan(opts: LinkStudentPlanOptions): Promise<{ ok: boolean; message?: string }> {
  const check = validateLevelAndPhase(opts.track, opts.instituteLevel, opts.globalPhase);
  if (!check.ok) {
    if (opts.optional) return { ok: false, message: check.message };
    throw new Error(check.message);
  }

  const plans = opts.plansCache ?? (await fetchPlans(opts.track));
  const plan = findPlanByGlobalPhase(plans, opts.track, opts.globalPhase, opts.instituteLevel);
  if (!plan) {
    const msg = `لا توجد خطة للمسار ${opts.track === "gold" ? "ذهبي" : "فضي"} — مرحلة ${opts.globalPhase}`;
    if (opts.optional) return { ok: false, message: msg };
    throw new Error(msg);
  }

  const current = await fetchStudentPlanSheet(opts.studentId);
  if (current.assignment) {
    // Roster import must never replace an existing link (even if phase fields changed).
    if (current.plan?.track === opts.track && current.plan.level_number === plan.level_number) return { ok: true };
    return { ok: false, message: "حُفظت بيانات الطالب؛ تغيير خطته الحالية يحتاج اعتمادًا منفصلًا من المشرف" };
  }

  let planStartDate = opts.planStartDate ?? null;
  if (!planStartDate) {
    try {
      const cal = await fetchActiveCalendar(true);
      planStartDate = cal.semester?.start_date ?? cal.operationalDate;
    } catch {
      planStartDate = new Date().toISOString().slice(0, 10);
    }
  }

  const quotas = resolveFaceQuotas(opts.track);

  await assignStudentPlan(
    opts.studentId,
    plan.id,
    Math.max(1, opts.startHifzSegment ?? 1),
    opts.assignedBy,
    {
      expected_assignment_id: "",
      plan_start_date: planStartDate ?? undefined,
      start_muraja_segment: murajaStartSegment(opts.globalPhase),
      face_quotas: quotas,
    },
  );

  return { ok: true };
}

export function instituteLevelLabel(level: InstituteLevel | string): string {
  return String(level);
}
