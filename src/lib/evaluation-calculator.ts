import type { EvaluationResult, EvaluationSettings, SegmentTally } from "@/lib/evaluation-types";

/** Parse memorized juz count from student fields. */
export function parseMemorizedJuzCount(memorized?: string | null, level?: string | null): number {
  if (memorized?.trim()) {
    const direct = parseInt(memorized.trim(), 10);
    if (!Number.isNaN(direct) && direct > 0) return direct;
    const match = memorized.match(/(\d+)/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > 0) return n;
    }
  }
  const lv = parseInt(level ?? "1", 10);
  return Number.isNaN(lv) || lv < 1 ? 1 : lv;
}

export function reviewSegmentCount(juzCount: number, settings: EvaluationSettings): number {
  if (juzCount < 10) return settings.review_segments_under_10;
  if (juzCount <= 20) return settings.review_segments_10_to_20;
  return settings.review_segments_over_20;
}

export function maxAllowedMinutes(faceCount: number, settings: EvaluationSettings): number {
  return Math.round(faceCount * settings.max_minutes_per_face * 10) / 10;
}

export function emptyReviewSegments(count: number): SegmentTally[] {
  return Array.from({ length: count }, () => ({ errors: 0, warnings: 0 }));
}

/** Migrate legacy reviewErrors number[] to SegmentTally[]. */
export function normalizeReviewSegments(
  legacy: number[] | SegmentTally[] | undefined,
  segmentCount: number,
): SegmentTally[] {
  const base = emptyReviewSegments(segmentCount);
  if (!legacy?.length) return base;
  if (typeof legacy[0] === "object" && legacy[0] !== null && "errors" in legacy[0]) {
    return (legacy as SegmentTally[]).slice(0, segmentCount).concat(base).slice(0, segmentCount);
  }
  return (legacy as number[]).slice(0, segmentCount).map((errors) => ({ errors, warnings: 0 }))
    .concat(base)
    .slice(0, segmentCount);
}

export function computeHifzScore(
  errors: number,
  warnings: number,
  settings: EvaluationSettings,
): { score: number; failed: boolean } {
  if (errors >= settings.hifz_max_errors) {
    return { score: 0, failed: true };
  }
  const deduction = errors * settings.error_deduction + warnings * settings.warning_deduction;
  return {
    score: Math.max(0, settings.hifz_max_score - deduction),
    failed: false,
  };
}

export function computeReviewScore(
  segments: SegmentTally[],
  settings: EvaluationSettings,
): { score: number; failed: boolean } {
  for (const seg of segments) {
    if (seg.errors >= settings.review_max_errors_per_segment) {
      return { score: 0, failed: true };
    }
  }
  const totalDeduction = segments.reduce(
    (sum, seg) =>
      sum + seg.errors * settings.review_error_deduction + seg.warnings * settings.review_warning_deduction,
    0,
  );
  return {
    score: Math.max(0, settings.review_max_score - totalDeduction),
    failed: false,
  };
}

export function computeEvaluation(
  hifzErrors: number,
  hifzWarnings: number,
  reviewSegments: SegmentTally[],
  settings: EvaluationSettings,
): EvaluationResult {
  const hifz = computeHifzScore(hifzErrors, hifzWarnings, settings);
  const review = computeReviewScore(reviewSegments, settings);
  const totalScore = hifz.score + review.score;
  const maxTotal = settings.hifz_max_score + settings.review_max_score;
  const percent = maxTotal > 0 ? Math.round((totalScore / maxTotal) * 100) : 0;
  const failed = hifz.failed || review.failed || percent < settings.pass_percent;
  return {
    hifzScore: hifz.score,
    reviewScore: review.score,
    totalScore,
    maxTotal,
    percent,
    hifzFailed: hifz.failed,
    reviewFailed: review.failed,
    passed: !failed,
    failed,
  };
}
