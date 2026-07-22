export interface EvaluationSettings {
  hifz_max_score: number;
  review_max_score: number;
  error_deduction: number;
  warning_deduction: number;
  review_error_deduction: number;
  review_warning_deduction: number;
  hifz_max_errors: number;
  hifz_max_warnings: number;
  review_max_errors_per_segment: number;
  review_max_warnings_per_segment: number;
  pass_percent: number;
  max_minutes_per_face: number;
  review_segments_under_10: number;
  review_segments_10_to_20: number;
  review_segments_over_20: number;
}

export interface SegmentTally {
  errors: number;
  warnings: number;
}

export interface EvaluationResult {
  hifzScore: number;
  reviewScore: number;
  totalScore: number;
  maxTotal: number;
  percent: number;
  hifzFailed: boolean;
  reviewFailed: boolean;
  passed: boolean;
  failed: boolean;
}

export const DEFAULT_EVALUATION_SETTINGS: EvaluationSettings = {
  hifz_max_score: 45,
  review_max_score: 50,
  error_deduction: 5,
  warning_deduction: 2,
  review_error_deduction: 2,
  review_warning_deduction: 1,
  hifz_max_errors: 3,
  hifz_max_warnings: 5,
  review_max_errors_per_segment: 3,
  review_max_warnings_per_segment: 5,
  pass_percent: 80,
  max_minutes_per_face: 2,
  review_segments_under_10: 3,
  review_segments_10_to_20: 4,
  review_segments_over_20: 5,
};
