export type PlanTrack = "gold" | "silver";
export type PlanTaskType = "hifz" | "rabt" | "muraja";
export type TapValue = "half" | "one" | "two";
export type AssignmentStatus = "active" | "frozen" | "transferred";

/** Daily face quotas + tap→face mapping (plan defaults, copied to assignment on link). */
export interface DailyFaceQuotas {
  daily_hifz_faces: number;
  daily_rabt_faces: number;
  daily_muraja_faces: number;
  faces_per_half: number;
  faces_per_one: number;
  faces_per_two: number;
}

export interface EducationPlan extends DailyFaceQuotas {
  id: string;
  track: PlanTrack;
  level_number: number;
  title: string;
  segment_count: number;
  created_at?: string | null;
}

export interface PlanSegment {
  id: string;
  plan_id: string;
  segment_index: number;
  hifz_plan: string;
  rabt_plan: string;
  muraja_plan: string;
}

export interface StudentPlanAssignment extends DailyFaceQuotas {
  id: string;
  student_id: string;
  plan_id: string;
  start_segment_index: number;
  plan_start_date?: string | null;
  start_muraja_segment?: number | null;
  status: AssignmentStatus;
  assigned_by: string;
  assigned_at?: string;
  frozen_at?: string | null;
  transferred_at?: string | null;
}

export interface SegmentCompletion {
  segment_index: number;
  task_type: PlanTaskType;
  completed_at: string;
  recorded_by?: string;
}

export interface StudentPlanSheetData {
  assignment: StudentPlanAssignment | null;
  plan: EducationPlan | null;
  segments: PlanSegment[];
  completions: SegmentCompletion[];
}

export interface ImportPlanPayload {
  track: PlanTrack;
  level_number: number;
  /** Institute tier, e.g. التأهيل */
  tier_name?: string;
  /** Phase within tier (column B in Excel) */
  phase_number?: number;
  title?: string;
  segments: {
    segment_index?: number;
    hifz_plan: string;
    rabt_plan: string;
    muraja_plan: string;
  }[];
}
