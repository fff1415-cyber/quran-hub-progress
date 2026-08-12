"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  Challenge,
  Improvement,
  ImprovementVote,
  Team,
  TeamMember,
  TopicReservation,
  Vote,
  WorkshopState,
} from "@/lib/types/workshop";
import { DEFAULT_WORKSHOP_STATE } from "@/lib/types/workshop";

const TEAM_ID_KEY = "adhiyati_team_id";
const VOTER_ID_KEY = "adhiyati_voter_id";

export function getStoredTeamId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TEAM_ID_KEY);
}

export function setStoredTeamId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TEAM_ID_KEY, id);
}

function getOrCreateVoterId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(VOTER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VOTER_ID_KEY, id);
  }
  return id;
}

export function useVoterId(): string {
  const [voterId, setVoterId] = useState("");

  useEffect(() => {
    setVoterId(getOrCreateVoterId());
  }, []);

  return voterId;
}

function fallbackState(): WorkshopState {
  return {
    id: "local",
    ...DEFAULT_WORKSHOP_STATE,
    updated_at: new Date().toISOString(),
  };
}

export function useWorkshopState() {
  const [state, setState] = useState<WorkshopState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setState(fallbackState());
      setLoading(false);
      return;
    }

    const { data, error: fetchError } = await supabase
      .from("workshop_state")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      setError(fetchError.message);
      setState(fallbackState());
    } else if (data) {
      setState(data as WorkshopState);
    } else {
      setState(fallbackState());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchState();
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel("workshop_state_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workshop_state" },
        (payload) => {
          if (payload.new) setState(payload.new as WorkshopState);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchState]);

  const updateState = useCallback(
    async (updates: Partial<Omit<WorkshopState, "id" | "updated_at">>) => {
      const supabase = getSupabaseClient();
      if (!supabase || !state?.id || state.id === "local") {
        setState((prev) =>
          prev ? { ...prev, ...updates, updated_at: new Date().toISOString() } : prev
        );
        return { error: null };
      }

      const { error: updateError } = await supabase
        .from("workshop_state")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", state.id);

      if (updateError) return { error: updateError.message };
      return { error: null };
    },
    [state]
  );

  return { state, loading, error, updateState, refetch: fetchState };
}

export function useTeams() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTeams = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    const [teamsRes, membersRes] = await Promise.all([
      supabase.from("teams").select("*").order("created_at"),
      supabase.from("team_members").select("*").order("created_at"),
    ]);

    if (teamsRes.data) setTeams(teamsRes.data as Team[]);
    if (membersRes.data) setMembers(membersRes.data as TeamMember[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTeams();
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel("teams_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, fetchTeams)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_members" }, fetchTeams)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTeams]);

  const createTeam = useCallback(
    async (name: string, memberNames: string[]) => {
      const supabase = getSupabaseClient();
      if (!supabase) return { team: null, error: "Supabase غير مهيأ" };

      const { data: team, error: teamError } = await supabase
        .from("teams")
        .insert({ name })
        .select()
        .single();

      if (teamError || !team) return { team: null, error: teamError?.message ?? "فشل إنشاء الفريق" };

      if (memberNames.length > 0) {
        await supabase.from("team_members").insert(
          memberNames.map((memberName) => ({ team_id: team.id, name: memberName }))
        );
      }

      setStoredTeamId(team.id);
      await fetchTeams();
      return { team: team as Team, error: null };
    },
    [fetchTeams]
  );

  const getTeamMembers = useCallback(
    (teamId: string) => members.filter((m) => m.team_id === teamId),
    [members]
  );

  return { teams, members, loading, createTeam, getTeamMembers, refetch: fetchTeams };
}

export function useReservations() {
  const [reservations, setReservations] = useState<TopicReservation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReservations = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("topic_reservations")
      .select("*, team:teams(*)")
      .order("topic_id");

    if (data) setReservations(data as TopicReservation[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchReservations();
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel("reservations_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "topic_reservations" },
        fetchReservations
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchReservations]);

  const reserveTopic = useCallback(
    async (teamId: string, topicId: number) => {
      const supabase = getSupabaseClient();
      if (!supabase) return { error: "Supabase غير مهيأ" };

      const { error } = await supabase
        .from("topic_reservations")
        .insert({ team_id: teamId, topic_id: topicId });

      if (error) return { error: error.message };
      await fetchReservations();
      return { error: null };
    },
    [fetchReservations]
  );

  const reservedTopicIds = useMemo(
    () => new Set(reservations.map((r) => r.topic_id)),
    [reservations]
  );

  return { reservations, loading, reserveTopic, reservedTopicIds, refetch: fetchReservations };
}

export function useChallenges() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchChallenges = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("challenges")
      .select("*, team:teams(*)")
      .order("sort_order")
      .order("created_at");

    if (data) setChallenges(data as Challenge[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchChallenges();
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel("challenges_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "challenges" }, fetchChallenges)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchChallenges]);

  const addChallenge = useCallback(
    async (teamId: string, topicId: number, customText: string, sortOrder = 0) => {
      const supabase = getSupabaseClient();
      if (!supabase) return { error: "Supabase غير مهيأ" };

      const { error } = await supabase.from("challenges").insert({
        team_id: teamId,
        topic_id: topicId,
        custom_text: customText,
        sort_order: sortOrder,
      });

      if (error) return { error: error.message };
      await fetchChallenges();
      return { error: null };
    },
    [fetchChallenges]
  );

  const updateChallenge = useCallback(
    async (id: string, updates: Partial<Pick<Challenge, "custom_text" | "sort_order">>) => {
      const supabase = getSupabaseClient();
      if (!supabase) return { error: "Supabase غير مهيأ" };

      const { error } = await supabase.from("challenges").update(updates).eq("id", id);
      if (error) return { error: error.message };
      await fetchChallenges();
      return { error: null };
    },
    [fetchChallenges]
  );

  const deleteChallenge = useCallback(
    async (id: string) => {
      const supabase = getSupabaseClient();
      if (!supabase) return { error: "Supabase غير مهيأ" };

      const { error } = await supabase.from("challenges").delete().eq("id", id);
      if (error) return { error: error.message };
      await fetchChallenges();
      return { error: null };
    },
    [fetchChallenges]
  );

  const reorderChallenges = useCallback(
    async (orderedIds: string[]) => {
      const supabase = getSupabaseClient();
      if (!supabase) return { error: "Supabase غير مهيأ" };

      const updates = orderedIds.map((id, index) =>
        supabase.from("challenges").update({ sort_order: index }).eq("id", id)
      );
      await Promise.all(updates);
      await fetchChallenges();
      return { error: null };
    },
    [fetchChallenges]
  );

  return {
    challenges,
    loading,
    addChallenge,
    updateChallenge,
    deleteChallenge,
    reorderChallenges,
    refetch: fetchChallenges,
  };
}

export function useVotes() {
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVotes = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    const { data } = await supabase.from("votes").select("*").order("created_at");
    if (data) setVotes(data as Vote[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchVotes();
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel("votes_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "votes" }, fetchVotes)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchVotes]);

  const castVote = useCallback(
    async (
      challengeId: string,
      stars: number,
      voterId: string,
      voterType: "participant" | "public" = "participant"
    ) => {
      const supabase = getSupabaseClient();
      if (!supabase) return { error: "Supabase غير مهيأ" };

      const { error } = await supabase.from("votes").upsert(
        { challenge_id: challengeId, stars, voter_id: voterId, voter_type: voterType },
        { onConflict: "challenge_id,voter_id" }
      );

      if (error) return { error: error.message };
      await fetchVotes();
      return { error: null };
    },
    [fetchVotes]
  );

  const getChallengeAverage = useCallback(
    (challengeId: string) => {
      const challengeVotes = votes.filter((v) => v.challenge_id === challengeId);
      if (challengeVotes.length === 0) return 0;
      return challengeVotes.reduce((sum, v) => sum + v.stars, 0) / challengeVotes.length;
    },
    [votes]
  );

  const getChallengeVoteCount = useCallback(
    (challengeId: string) => votes.filter((v) => v.challenge_id === challengeId).length,
    [votes]
  );

  return { votes, loading, castVote, getChallengeAverage, getChallengeVoteCount, refetch: fetchVotes };
}

export function useImprovements() {
  const [improvements, setImprovements] = useState<Improvement[]>([]);
  const [improvementVotes, setImprovementVotes] = useState<ImprovementVote[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchImprovements = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    const [impRes, voteRes] = await Promise.all([
      supabase.from("improvements").select("*, team:teams(*)").order("created_at"),
      supabase.from("improvement_votes").select("*").order("created_at"),
    ]);

    if (impRes.data) setImprovements(impRes.data as Improvement[]);
    if (voteRes.data) setImprovementVotes(voteRes.data as ImprovementVote[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchImprovements();
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel("improvements_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "improvements" }, fetchImprovements)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "improvement_votes" },
        fetchImprovements
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchImprovements]);

  const addImprovement = useCallback(
    async (teamId: string, text: string) => {
      const supabase = getSupabaseClient();
      if (!supabase) return { error: "Supabase غير مهيأ" };

      const { error } = await supabase.from("improvements").insert({ team_id: teamId, text });
      if (error) return { error: error.message };
      await fetchImprovements();
      return { error: null };
    },
    [fetchImprovements]
  );

  const castImprovementVote = useCallback(
    async (
      improvementId: string,
      stars: number,
      voterId: string,
      voterType: "participant" | "public" = "participant"
    ) => {
      const supabase = getSupabaseClient();
      if (!supabase) return { error: "Supabase غير مهيأ" };

      const { error } = await supabase.from("improvement_votes").upsert(
        { improvement_id: improvementId, stars, voter_id: voterId, voter_type: voterType },
        { onConflict: "improvement_id,voter_id" }
      );

      if (error) return { error: error.message };
      await fetchImprovements();
      return { error: null };
    },
    [fetchImprovements]
  );

  const getImprovementAverage = useCallback(
    (improvementId: string) => {
      const iv = improvementVotes.filter((v) => v.improvement_id === improvementId);
      if (iv.length === 0) return 0;
      return iv.reduce((sum, v) => sum + v.stars, 0) / iv.length;
    },
    [improvementVotes]
  );

  return {
    improvements,
    improvementVotes,
    loading,
    addImprovement,
    castImprovementVote,
    getImprovementAverage,
    refetch: fetchImprovements,
  };
}
