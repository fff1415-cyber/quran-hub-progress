import type { EvaluationSettings, SegmentTally } from "@/lib/evaluation-types";
import type { SardQueueItem } from "@/lib/mock-data";
import {
  computeHifzScore,
  computeReviewScore,
  emptyReviewSegments,
} from "@/lib/evaluation-calculator";

export type SardPhase = "full" | "review_only";

export function sardPhase(item: SardQueueItem): SardPhase {
  return item.phase === "review_only" ? "review_only" : "full";
}

export function isMusammiVisible(item: SardQueueItem, now = Date.now()): boolean {
  const due = item.scheduledAt ? new Date(item.scheduledAt).getTime() <= now : true;
  if (item.status === "pending" || item.status === "approved_third") return true;
  if (item.status === "scheduled" && due && sardPhase(item) === "full") return true;
  if (item.status === "awaiting_review" && due) return true;
  return false;
}

/** Scheduled full-sard retries visible to supervisor (not deferred review). */
export function isSupervisorScheduledRetry(item: SardQueueItem): boolean {
  return item.status === "scheduled" && sardPhase(item) === "full";
}

export function scheduleInTwoDays(): string {
  return new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
}

export interface MergedEvaluation {
  hifzScore: number;
  reviewScore: number;
  totalScore: number;
  maxTotal: number;
  percent: number;
  reviewFailed: boolean;
  passed: boolean;
  failed: boolean;
}

export function computeMergedEvaluation(
  lockedHifzScore: number,
  reviewSegments: SegmentTally[],
  settings: EvaluationSettings,
): MergedEvaluation {
  const review = computeReviewScore(reviewSegments, settings);
  const totalScore = lockedHifzScore + review.score;
  const maxTotal = settings.hifz_max_score + settings.review_max_score;
  const percent = maxTotal > 0 ? Math.round((totalScore / maxTotal) * 100) : 0;
  const failed = review.failed || percent < settings.pass_percent;
  return {
    hifzScore: lockedHifzScore,
    reviewScore: review.score,
    totalScore,
    maxTotal,
    percent,
    reviewFailed: review.failed,
    passed: !failed,
    failed,
  };
}

export function computeFullPhaseHifz(
  hifzErrors: number,
  hifzWarnings: number,
  settings: EvaluationSettings,
) {
  return computeHifzScore(hifzErrors, hifzWarnings, settings);
}

export function buildReviewOnlyPatch(
  item: SardQueueItem,
  lockedHifzScore: number,
  hifzErrors: number,
  hifzWarnings: number,
  segmentCount: number,
): Partial<SardQueueItem> {
  return {
    phase: "review_only",
    status: "awaiting_review",
    scheduledAt: scheduleInTwoDays(),
    lockedHifzScore,
    lockedHifzErrors: hifzErrors,
    lockedHifzWarnings: hifzWarnings,
    reviewSegmentCount: segmentCount,
    hifzErrors,
    hifzWarnings,
    reviewErrors: emptyReviewSegments(segmentCount).map((s) => s.errors),
    reviewWarnings: emptyReviewSegments(segmentCount).map((s) => s.warnings),
  };
}

export function resetFullSardAttempt(segmentCount: number): Partial<SardQueueItem> {
  const segs = emptyReviewSegments(segmentCount);
  return {
    phase: "full",
    lockedHifzScore: undefined,
    lockedHifzErrors: undefined,
    lockedHifzWarnings: undefined,
    reviewSegmentCount: undefined,
    hifzErrors: 0,
    hifzWarnings: 0,
    reviewErrors: segs.map((s) => s.errors),
    reviewWarnings: segs.map((s) => s.warnings),
  };
}
