"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import ProgressBar from "@/components/ProgressBar";
import StarRating from "@/components/StarRating";
import ZadLogo from "@/components/ZadLogo";
import { CHALLENGE_TOPICS, WORKSHOP_STAGES } from "@/lib/content/presentation";
import {
  getStoredTeamId,
  useChallenges,
  useImprovements,
  useReservations,
  useTeams,
  useVotes,
  useVoterId,
  useWorkshopState,
} from "@/hooks/useWorkshop";

export default function ParticipantPage() {
  const { state, loading: stateLoading } = useWorkshopState();
  const { teams, createTeam, getTeamMembers, loading: teamsLoading } = useTeams();
  const { reservations, reserveTopic, reservedTopicIds } = useReservations();
  const { challenges, addChallenge, deleteChallenge, reorderChallenges } = useChallenges();
  const { castVote, votes, getChallengeAverage } = useVotes();
  const {
    improvements,
    improvementVotes,
    addImprovement,
    castImprovementVote,
    getImprovementAverage,
  } = useImprovements();
  const voterId = useVoterId();

  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  const [memberInput, setMemberInput] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [challengeText, setChallengeText] = useState("");
  const [improvementText, setImprovementText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setTeamId(getStoredTeamId());
  }, []);

  const myTeam = useMemo(
    () => teams.find((t) => t.id === teamId) ?? null,
    [teams, teamId]
  );

  const myReservation = useMemo(
    () => reservations.find((r) => r.team_id === teamId) ?? null,
    [reservations, teamId]
  );

  const myChallenges = useMemo(
    () => challenges.filter((c) => c.team_id === teamId).sort((a, b) => a.sort_order - b.sort_order),
    [challenges, teamId]
  );

  const myImprovements = useMemo(
    () => improvements.filter((i) => i.team_id === teamId),
    [improvements, teamId]
  );

  const stageIndex = WORKSHOP_STAGES.findIndex((s) => s.key === state?.current_stage);
  const currentStage = WORKSHOP_STAGES[stageIndex] ?? WORKSHOP_STAGES[0];

  const handleCreateTeam = useCallback(async () => {
    if (!teamName.trim()) {
      setError("يرجى إدخال اسم الفريق");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { team, error: err } = await createTeam(teamName.trim(), members);
    if (err) setError(err);
    else if (team) setTeamId(team.id);
    setSubmitting(false);
  }, [teamName, members, createTeam]);

  const handleReserve = useCallback(
    async (topicId: number) => {
      if (!teamId) return;
      if (state?.locked_topics.includes(topicId)) {
        setError("هذا المحور مقفل");
        return;
      }
      setSubmitting(true);
      const { error: err } = await reserveTopic(teamId, topicId);
      if (err) setError(err);
      setSubmitting(false);
    },
    [teamId, reserveTopic, state?.locked_topics]
  );

  const handleAddChallenge = useCallback(async () => {
    if (!teamId || !myReservation || !challengeText.trim()) return;
    setSubmitting(true);
    const { error: err } = await addChallenge(
      teamId,
      myReservation.topic_id,
      challengeText.trim(),
      myChallenges.length
    );
    if (err) setError(err);
    else setChallengeText("");
    setSubmitting(false);
  }, [teamId, myReservation, challengeText, myChallenges.length, addChallenge]);

  const handleAddImprovement = useCallback(async () => {
    if (!teamId || !improvementText.trim()) return;
    setSubmitting(true);
    const { error: err } = await addImprovement(teamId, improvementText.trim());
    if (err) setError(err);
    else setImprovementText("");
    setSubmitting(false);
  }, [teamId, improvementText, addImprovement]);

  const moveChallenge = useCallback(
    async (index: number, direction: "up" | "down") => {
      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= myChallenges.length) return;
      const ids = myChallenges.map((c) => c.id);
      [ids[index], ids[newIndex]] = [ids[newIndex], ids[index]];
      await reorderChallenges(ids);
    },
    [myChallenges, reorderChallenges]
  );

  if (stateLoading || teamsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-primary">جاري التحميل...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 bg-primary px-4 py-4 text-white shadow-md">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <Link href="/" className="text-sm text-white/80">
            ← الرئيسية
          </Link>
          <ZadLogo variant="white" width={80} height={32} />
        </div>
        <div className="mx-auto mt-3 max-w-lg">
          <ProgressBar
            current={stageIndex + 1}
            total={WORKSHOP_STAGES.length}
            label={currentStage.label}
          />
        </div>
      </header>

      <main className="mx-auto max-w-lg p-4">
        {error && (
          <div className="mb-4 rounded-xl bg-red-50 p-3 text-red-700">{error}</div>
        )}

        {state?.current_stage === "registration" && (
          <section className="card">
            <h2 className="mb-4 text-xl font-bold text-primary">تسجيل الفريق</h2>
            {myTeam ? (
              <div>
                <p className="text-lg font-semibold">{myTeam.name}</p>
                <ul className="mt-2 space-y-1 text-gray-600">
                  {getTeamMembers(myTeam.id).map((m) => (
                    <li key={m.id}>• {m.name}</li>
                  ))}
                </ul>
                <p className="mt-4 text-sm text-green-600">تم التسجيل بنجاح ✓</p>
              </div>
            ) : (
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="اسم الفريق"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="w-full"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="اسم عضو"
                    value={memberInput}
                    onChange={(e) => setMemberInput(e.target.value)}
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && memberInput.trim()) {
                        setMembers([...members, memberInput.trim()]);
                        setMemberInput("");
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (memberInput.trim()) {
                        setMembers([...members, memberInput.trim()]);
                        setMemberInput("");
                      }
                    }}
                    className="btn-outline px-4"
                  >
                    +
                  </button>
                </div>
                {members.length > 0 && (
                  <ul className="space-y-1">
                    {members.map((m, i) => (
                      <li key={i} className="flex justify-between rounded bg-gray-50 px-3 py-2">
                        {m}
                        <button
                          type="button"
                          onClick={() => setMembers(members.filter((_, j) => j !== i))}
                          className="text-red-500"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={handleCreateTeam}
                  disabled={submitting}
                  className="btn-primary w-full"
                >
                  {submitting ? "جاري التسجيل..." : "تسجيل الفريق"}
                </button>
              </div>
            )}
          </section>
        )}

        {state?.current_stage === "topic-reservation" && (
          <section className="card">
            <h2 className="mb-4 text-xl font-bold text-primary">حجز المحور</h2>
            {!myTeam ? (
              <p className="text-gray-600">يرجى تسجيل الفريق أولاً</p>
            ) : myReservation ? (
              <div className="rounded-xl bg-green-50 p-4">
                <p className="font-semibold text-green-800">تم حجز المحور:</p>
                <p className="mt-1 text-lg">
                  {CHALLENGE_TOPICS.find((t) => t.id === myReservation.topic_id)?.title}
                </p>
              </div>
            ) : (
              <div className="grid gap-2">
                {CHALLENGE_TOPICS.map((topic) => {
                  const taken = reservedTopicIds.has(topic.id);
                  const locked = state.locked_topics.includes(topic.id);
                  return (
                    <button
                      key={topic.id}
                      type="button"
                      disabled={taken || locked || submitting}
                      onClick={() => handleReserve(topic.id)}
                      className={`rounded-xl p-4 text-right transition ${
                        taken || locked
                          ? "cursor-not-allowed bg-gray-100 text-gray-400"
                          : "bg-primary/5 hover:bg-primary/10"
                      }`}
                    >
                      <span className="font-bold">{topic.id}. {topic.title}</span>
                      {topic.subtitle && (
                        <span className="block text-sm text-gray-500">{topic.subtitle}</span>
                      )}
                      {taken && <span className="text-xs text-red-500">محجوز</span>}
                      {locked && <span className="text-xs text-orange-500">مقفل</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {state?.current_stage === "brainstorming" && (
          <section className="card">
            <h2 className="mb-4 text-xl font-bold text-primary">العصف الذهني والصياغة</h2>
            {!myReservation ? (
              <p className="text-gray-600">يرجى حجز محور أولاً</p>
            ) : (
              <>
                <p className="mb-4 text-sm text-gray-600">
                  المحور: {CHALLENGE_TOPICS.find((t) => t.id === myReservation.topic_id)?.title}
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="اكتب التحدي..."
                    value={challengeText}
                    onChange={(e) => setChallengeText(e.target.value)}
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={handleAddChallenge}
                    disabled={submitting}
                    className="btn-primary"
                  >
                    إضافة
                  </button>
                </div>
                <ul className="mt-4 space-y-2">
                  {myChallenges.map((ch) => (
                    <li
                      key={ch.id}
                      className="flex items-center justify-between rounded-xl bg-gray-50 p-3"
                    >
                      <button
                        type="button"
                        onClick={() => deleteChallenge(ch.id)}
                        className="text-red-500"
                      >
                        ×
                      </button>
                      <span className="flex-1 px-2 text-right">{ch.custom_text}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        {state?.current_stage === "prioritization" && (
          <section className="card">
            <h2 className="mb-4 text-xl font-bold text-primary">ترتيب الأولوية</h2>
            <ul className="space-y-2">
              {myChallenges.map((ch, i) => (
                <li
                  key={ch.id}
                  className="flex items-center gap-2 rounded-xl bg-gray-50 p-3"
                >
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => moveChallenge(i, "up")}
                      disabled={i === 0}
                      className="text-primary disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveChallenge(i, "down")}
                      disabled={i === myChallenges.length - 1}
                      className="text-primary disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </div>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm text-white">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-right">{ch.custom_text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {state?.current_stage === "live-voting" && (
          <section className="card">
            <h2 className="mb-4 text-xl font-bold text-primary">التصويت المباشر</h2>
            {!state.voting_active ? (
              <p className="text-gray-600">التصويت غير مفعّل حالياً — انتظر تعليمات الميسّر</p>
            ) : (
              <ul className="space-y-4">
                {challenges.map((ch) => {
                  const myVote = votes.find(
                    (v) => v.challenge_id === ch.id && v.voter_id === voterId
                  );
                  const topic = CHALLENGE_TOPICS.find((t) => t.id === ch.topic_id);
                  const team = teams.find((t) => t.id === ch.team_id);
                  return (
                    <li key={ch.id} className="rounded-xl border border-primary/10 p-4">
                      <p className="font-semibold">{ch.custom_text}</p>
                      <p className="text-sm text-gray-500">
                        {topic?.title} — {team?.name}
                      </p>
                      <div className="mt-3 flex items-center justify-between">
                        <StarRating
                          value={myVote?.stars ?? 0}
                          onChange={(stars) => castVote(ch.id, stars, voterId, "participant")}
                        />
                        {state.results_visible && (
                          <span className="text-secondary font-bold">
                            {(getChallengeAverage(ch.id) ?? 0).toFixed(1)} ★
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {state?.current_stage === "improvements" && (
          <section className="card">
            <h2 className="mb-4 text-xl font-bold text-primary">فرص التحسين</h2>
            {myTeam && (
              <div className="mb-4 flex gap-2">
                <input
                  type="text"
                  placeholder="اقتراح تحسين..."
                  value={improvementText}
                  onChange={(e) => setImprovementText(e.target.value)}
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={handleAddImprovement}
                  disabled={submitting}
                  className="btn-primary"
                >
                  إضافة
                </button>
              </div>
            )}
            <ul className="space-y-3">
              {improvements.map((imp) => {
                const myVote = improvementVotes.find(
                  (v) => v.improvement_id === imp.id && v.voter_id === voterId
                );
                return (
                  <li key={imp.id} className="rounded-xl border p-4">
                    <p>{imp.text}</p>
                    {state.improvement_voting_active && (
                      <div className="mt-2">
                        <StarRating
                          value={myVote?.stars ?? 0}
                          onChange={(stars) =>
                            castImprovementVote(imp.id, stars, voterId, "participant")
                          }
                        />
                      </div>
                    )}
                    {state.results_visible && (
                      <p className="mt-1 text-sm text-secondary">
                        {(getImprovementAverage(imp.id) ?? 0).toFixed(1)} ★
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            {myImprovements.length > 0 && (
              <p className="mt-4 text-sm text-gray-500">
                اقتراحات فريقك: {myImprovements.length}
              </p>
            )}
          </section>
        )}

        {state?.current_stage === "final-report" && (
          <section className="card">
            <h2 className="mb-4 text-xl font-bold text-primary">التقرير الختامي</h2>
            {!state.results_visible ? (
              <p className="text-gray-600">النتائج لم تُعرض بعد</p>
            ) : (
              <ul className="space-y-3">
                {[...challenges]
                  .sort(
                    (a, b) =>
                      (getChallengeAverage(b.id) ?? 0) - (getChallengeAverage(a.id) ?? 0)
                  )
                  .map((ch, i) => (
                    <li
                      key={ch.id}
                      className="flex items-center gap-3 rounded-xl bg-gray-50 p-3"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white">
                        {i + 1}
                      </span>
                      <span className="flex-1 text-right">{ch.custom_text}</span>
                      <span className="font-bold text-secondary">
                        {(getChallengeAverage(ch.id) ?? 0).toFixed(1)} ★
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
