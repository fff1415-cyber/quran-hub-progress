import type { PlanTaskType, PlanTrack, TapValue, SegmentCompletion, StudentPlanAssignment, EducationPlan } from "@/lib/plan-types";
import { getCalendarIsoDate } from "@/lib/operational-date";
import { phaseFromLevelNumber } from "@/lib/plan-phase";

/** How many plan segments a quick-tap completes. */
export function segmentsForTap(track: PlanTrack, tap: TapValue): number {
  if (track === "gold") {
    if (tap === "one") return 1;
    if (tap === "two") return 2;
    return 0;
  }
  if (tap === "half") return 1;
  if (tap === "one") return 2;
  if (tap === "two") return 4;
  return 0;
}

export function tapsForTrack(track: PlanTrack): TapValue[] {
  return track === "gold" ? ["one", "two"] : ["half", "one", "two"];
}

export function tapLabel(tap: TapValue): string {
  return tap === "half" ? "½" : tap === "one" ? "1" : "2";
}

export function taskLabel(task: PlanTaskType): string {
  return task === "hifz" ? "حفظ" : task === "rabt" ? "ربط" : "مراجعة";
}

export function trackLabel(track: PlanTrack): string {
  return track === "gold" ? "ذهبي" : "فضي";
}

export function levelUnit(track: PlanTrack): string {
  return track === "gold" ? "جزء" : "مرحلة";
}

/** Hifz plan segments owed by weekly compensation faces. */
export function compensationHifzSegmentTarget(faces: number, track: PlanTrack): number {
  if (faces <= 0) return 0;
  if (track === "gold") return Math.floor(faces);
  return Math.round(faces * 2);
}

/** Tap used to advance one compensation hifz segment on the plan. */
export function compensationHifzTap(track: PlanTrack): TapValue {
  return track === "gold" ? "one" : "half";
}

/** Next segment indices to complete for a task (client-side preview). */
export function nextSegmentsToApply(
  track: PlanTrack,
  tap: TapValue,
  startSegment: number,
  allSegmentIndexes: number[],
  completedIndexes: number[],
): number[] {
  const count = segmentsForTap(track, tap);
  if (count < 1) return [];
  const done = new Set(completedIndexes);
  const ordered = allSegmentIndexes.filter((i) => i >= startSegment).sort((a, b) => a - b);
  const next: number[] = [];
  for (const seg of ordered) {
    if (!done.has(seg)) {
      next.push(seg);
      if (next.length >= count) break;
    }
  }
  return next;
}

/** Calendar-day delay since last hifz completion before current segment. */
export function computeDelayDays(
  currentSegmentIndex: number | null,
  completions: { segment_index: number; task_type: PlanTaskType; completed_at: string }[],
  today: string = getCalendarIsoDate(),
): number {
  if (currentSegmentIndex === null) return 0;
  const hifzDone = completions.some(
    (c) => c.task_type === "hifz" && c.segment_index === currentSegmentIndex,
  );
  if (hifzDone) return 0;
  const prior = completions
    .filter((c) => c.task_type === "hifz")
    .map((c) => c.completed_at)
    .sort()
    .pop();
  if (!prior) return 0;
  const diff = Math.floor(
    (new Date(today).getTime() - new Date(prior).getTime()) / 86400000,
  );
  return diff > 0 ? diff : 0;
}

export function findCurrentSegmentIndex(
  startSegment: number,
  segmentIndexes: number[],
  completions: { segment_index: number; task_type: PlanTaskType }[],
): number | null {
  const ordered = segmentIndexes.filter((i) => i >= startSegment).sort((a, b) => a - b);
  for (const seg of ordered) {
    const hasHifz = completions.some((c) => c.segment_index === seg && c.task_type === "hifz");
    if (!hasHifz) return seg;
  }
  return ordered.length > 0 ? ordered[ordered.length - 1] : null;
}

export function completionMap(
  completions: { segment_index: number; task_type: PlanTaskType; completed_at: string }[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const c of completions) {
    map[`${c.segment_index}:${c.task_type}`] = c.completed_at;
  }
  return map;
}

/** Next single segment for rabt/muraja (or hifz pass-fail style). */
export function nextSegmentForTask(
  task: PlanTaskType,
  assignment: StudentPlanAssignment,
  plan: EducationPlan,
  allSegmentIndexes: number[],
  completions: SegmentCompletion[],
): number | null {
  const phase = phaseFromLevelNumber(plan.level_number);
  const hifzDone = new Set(
    completions.filter((c) => c.task_type === "hifz").map((c) => c.segment_index),
  );
  const taskDone = new Set(
    completions.filter((c) => c.task_type === task).map((c) => c.segment_index),
  );
  const ordered = allSegmentIndexes
    .filter((i) => i >= assignment.start_segment_index)
    .sort((a, b) => a - b);

  if (task === "hifz") {
    for (const seg of ordered) {
      if (!taskDone.has(seg)) return seg;
    }
    return null;
  }

  if (task === "muraja" && phase === 1) {
    const officialStart = assignment.start_muraja_segment ?? 16;
    // Before segment 16: muraja follows completed hifz (same as rabt).
    for (const seg of ordered) {
      if (seg >= officialStart) break;
      if (!hifzDone.has(seg)) continue;
      if (!taskDone.has(seg)) return seg;
    }
    // Official muraja track from segment 16+.
    for (const seg of allSegmentIndexes.filter((i) => i >= officialStart).sort((a, b) => a - b)) {
      if (!taskDone.has(seg)) return seg;
    }
    return null;
  }

  for (const seg of ordered) {
    if (!hifzDone.has(seg)) continue;
    if (!taskDone.has(seg)) return seg;
  }
  return null;
}
