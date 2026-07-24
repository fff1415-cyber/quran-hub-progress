import { fetchActiveCalendar } from "@/lib/academic-context";
import {
  findPlanByGlobalPhase,
  murajaStartSegment,
  validateLevelAndPhase,
  type InstituteLevel,
} from "@/lib/plan-level-ranges";
import { normalizeFaceQuotas } from "@/lib/plan-daily-faces";
import type { PlanTrack } from "@/lib/plan-types";
import { assignStudentPlan, fetchPlans } from "@/lib/plans-service";

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
}

export async function linkStudentToPlan(opts: LinkStudentPlanOptions): Promise<{ ok: boolean; message?: string }> {
  const check = validateLevelAndPhase(opts.track, opts.instituteLevel, opts.globalPhase);
  if (!check.ok) {
    if (opts.optional) return { ok: false, message: check.message };
    throw new Error(check.message);
  }

  const plans = await fetchPlans(opts.track);
  const plan = findPlanByGlobalPhase(plans, opts.track, opts.globalPhase);
  if (!plan) {
    const msg = `لا توجد خطة للمسار ${opts.track === "gold" ? "ذهبي" : "فضي"} — مرحلة ${opts.globalPhase}`;
    if (opts.optional) return { ok: false, message: msg };
    throw new Error(msg);
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

  const quotas = normalizeFaceQuotas({
    daily_rabt_faces: opts.dailyRabtFaces ?? 2,
    daily_muraja_faces: opts.dailyMurajaFaces ?? 2,
    daily_hifz_faces: 1,
    faces_per_half: 0.5,
    faces_per_one: 1,
    faces_per_two: 2,
  });

  await assignStudentPlan(
    opts.studentId,
    plan.id,
    Math.max(1, opts.startHifzSegment ?? 1),
    opts.assignedBy,
    {
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
