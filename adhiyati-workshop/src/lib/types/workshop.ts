import type { WorkshopStageKey } from "@/lib/content/presentation";

export interface WorkshopState {
  id: string;
  current_stage: WorkshopStageKey;
  current_slide: number;
  voting_active: boolean;
  improvement_voting_active: boolean;
  results_visible: boolean;
  locked_topics: number[];
  updated_at: string;
}

export interface Team { id: string; name: string; created_at: string; }
export interface TeamMember { id: string; team_id: string; name: string; created_at: string; }
export interface TopicReservation { id: string; team_id: string; topic_id: number; team?: Team; }
export interface Challenge { id: string; team_id: string; topic_id: number; custom_text: string; sort_order: number; created_at: string; team?: Team; }
export interface Vote { id: string; challenge_id: string; stars: number; voter_id: string; voter_type: "participant" | "public"; created_at: string; }
export interface Improvement { id: string; team_id: string; text: string; created_at: string; team?: Team; }
export interface ImprovementVote { id: string; improvement_id: string; stars: number; voter_id: string; voter_type: "participant" | "public"; created_at: string; }

export const DEFAULT_WORKSHOP_STATE: Omit<WorkshopState, "id" | "updated_at"> = {
  current_stage: "registration",
  current_slide: 1,
  voting_active: false,
  improvement_voting_active: false,
  results_visible: false,
  locked_topics: [],
};
