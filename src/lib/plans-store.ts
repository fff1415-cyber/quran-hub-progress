/**
 * Local fallback store when plan API tables are not migrated yet.
 */
import type {
  EducationPlan,
  ImportPlanPayload,
  PlanSegment,
  SegmentCompletion,
  StudentPlanAssignment,
  StudentPlanSheetData,
  PlanTaskType,
  TapValue,
} from "@/lib/plan-types";
import { nextSegmentsToApply, segmentsForTap } from "@/lib/plan-translator";
import { getCalendarIsoDate } from "@/lib/operational-date";

const KEY_PLANS = "qshatawi_education_plans_v1";
const KEY_SEGMENTS = "qshatawi_plan_segments_v1";
const KEY_ASSIGNMENTS = "qshatawi_plan_assignments_v1";
const KEY_COMPLETIONS = "qshatawi_plan_completions_v1";

type StoredCompletion = SegmentCompletion & { student_id: string; plan_id: string };

function uid(): string {
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function localListPlans(): EducationPlan[] {
  return read<EducationPlan[]>(KEY_PLANS, []).sort(
    (a, b) => a.track.localeCompare(b.track) || a.level_number - b.level_number,
  );
}

export function localImportPlans(plans: ImportPlanPayload[]): { plans: number; segments: number } {
  const existing = localListPlans();
  const allSegs = read<PlanSegment[]>(KEY_SEGMENTS, []);
  let segCount = 0;

  for (const p of plans) {
    const title =
      p.title?.trim() ||
      (p.tier_name && p.phase_number
        ? `${p.tier_name} — المرحلة ${p.phase_number}`
        : p.track === "gold"
          ? `جزء ${p.level_number}`
          : `مرحلة ${p.level_number}`);
    let plan = existing.find((x) => x.track === p.track && x.level_number === p.level_number);
    if (!plan) {
      plan = {
        id: uid(),
        track: p.track,
        level_number: p.level_number,
        title,
        segment_count: p.segments.length,
      };
      existing.push(plan);
    } else {
      plan.title = title;
      plan.segment_count = p.segments.length;
    }
    const kept = allSegs.filter((s) => s.plan_id !== plan!.id);
    allSegs.length = 0;
    allSegs.push(...kept);
    p.segments.forEach((seg, i) => {
      allSegs.push({
        id: uid(),
        plan_id: plan!.id,
        segment_index: seg.segment_index ?? i + 1,
        hifz_plan: seg.hifz_plan,
        rabt_plan: seg.rabt_plan,
        muraja_plan: seg.muraja_plan,
      });
      segCount++;
    });
  }

  write(KEY_PLANS, existing);
  write(KEY_SEGMENTS, allSegs);
  return { plans: plans.length, segments: segCount };
}

export function localAssignPlan(
  studentId: string,
  planId: string,
  startSegment: number,
  assignedBy: string,
): void {
  const list = read<StudentPlanAssignment[]>(KEY_ASSIGNMENTS, []);
  const next = list.map((a) =>
    a.student_id === studentId && a.status === "active"
      ? { ...a, status: "transferred" as const }
      : a,
  );
  next.push({
    id: uid(),
    student_id: studentId,
    plan_id: planId,
    start_segment_index: Math.max(1, startSegment),
    status: "active",
    assigned_by: assignedBy,
    assigned_at: new Date().toISOString(),
  });
  write(KEY_ASSIGNMENTS, next);
}

export function localPatchAssignment(
  studentId: string,
  status: "active" | "frozen" | "transferred",
): void {
  const list = read<StudentPlanAssignment[]>(KEY_ASSIGNMENTS, []);
  write(
    KEY_ASSIGNMENTS,
    list.map((a) => {
      if (a.student_id !== studentId || !["active", "frozen"].includes(a.status)) return a;
      return {
        ...a,
        status,
        frozen_at: status === "frozen" ? new Date().toISOString() : null,
      };
    }),
  );
}

export function localGetStudentSheet(studentId: string): StudentPlanSheetData {
  const assignments = read<StudentPlanAssignment[]>(KEY_ASSIGNMENTS, []);
  const assignment =
    assignments
      .filter((a) => a.student_id === studentId && (a.status === "active" || a.status === "frozen"))
      .sort((a, b) => (b.assigned_at ?? "").localeCompare(a.assigned_at ?? ""))[0] ?? null;

  if (!assignment) {
    return { assignment: null, plan: null, segments: [], completions: [] };
  }

  const plan = localListPlans().find((p) => p.id === assignment.plan_id) ?? null;
  const segments = read<PlanSegment[]>(KEY_SEGMENTS, [])
    .filter((s) => s.plan_id === assignment.plan_id)
    .sort((a, b) => a.segment_index - b.segment_index);

  const allComp = read<StoredCompletion[]>(KEY_COMPLETIONS, []);
  const completions = allComp
    .filter((c) => c.student_id === studentId && c.plan_id === assignment.plan_id)
    .map(({ segment_index, task_type, completed_at, recorded_by }) => ({
      segment_index,
      task_type,
      completed_at,
      recorded_by,
    }));

  return { assignment, plan, segments, completions };
}

export function localApplyInput(
  studentId: string,
  taskType: PlanTaskType,
  tap: TapValue,
  recordedBy: string,
  completedAt: string = getCalendarIsoDate(),
): number[] {
  const sheet = localGetStudentSheet(studentId);
  if (!sheet.assignment || !sheet.plan) {
    throw new Error("الطالب غير مربوط بخطة نشطة");
  }
  const track = sheet.plan.track;
  if (segmentsForTap(track, tap) < 1) {
    throw new Error("هذا الإدخال غير متاح لمسار الطالب");
  }

  const indexes = sheet.segments.map((s) => s.segment_index);
  const done = sheet.completions.filter((c) => c.task_type === taskType).map((c) => c.segment_index);
  const toApply = nextSegmentsToApply(
    track,
    tap,
    sheet.assignment.start_segment_index,
    indexes,
    done,
  );
  if (toApply.length === 0) throw new Error("لا توجد مقاطع متبقية");

  const allComp = read<StoredCompletion[]>(KEY_COMPLETIONS, []);
  for (const seg of toApply) {
    const idx = allComp.findIndex(
      (c) =>
        c.student_id === studentId &&
        c.plan_id === sheet.plan!.id &&
        c.segment_index === seg &&
        c.task_type === taskType,
    );
    const row: StoredCompletion = {
      student_id: studentId,
      plan_id: sheet.plan!.id,
      segment_index: seg,
      task_type: taskType,
      completed_at: completedAt,
      recorded_by: recordedBy,
    };
    if (idx >= 0) allComp[idx] = row;
    else allComp.push(row);
  }
  write(KEY_COMPLETIONS, allComp);
  return toApply;
}

export function localPlanDetail(planId: string): { plan: EducationPlan | null; segments: PlanSegment[] } {
  const plan = localListPlans().find((p) => p.id === planId) ?? null;
  const segments = read<PlanSegment[]>(KEY_SEGMENTS, [])
    .filter((s) => s.plan_id === planId)
    .sort((a, b) => a.segment_index - b.segment_index);
  return { plan, segments };
}
