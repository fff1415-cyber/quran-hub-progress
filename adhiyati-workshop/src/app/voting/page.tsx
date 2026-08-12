"use client";

import Link from "next/link";
import StarRating from "@/components/StarRating";
import ZadLogo from "@/components/ZadLogo";
import { CHALLENGE_TOPICS } from "@/lib/content/presentation";
import {
  useChallenges,
  useImprovements,
  useTeams,
  useVotes,
  useVoterId,
  useWorkshopState,
} from "@/hooks/useWorkshop";

export default function VotingPage() {
  const { state, loading: stateLoading } = useWorkshopState();
  const { challenges } = useChallenges();
  const { improvements, improvementVotes, castImprovementVote, getImprovementAverage } =
    useImprovements();
  const { teams } = useTeams();
  const { castVote, votes, getChallengeAverage } = useVotes();
  const voterId = useVoterId();

  const votingOpen = state?.voting_active || state?.improvement_voting_active;

  if (stateLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-primary">جاري التحميل...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary px-4 py-6 text-white">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <Link href="/" className="text-sm text-white/80">
            ← الرئيسية
          </Link>
          <ZadLogo variant="white" width={80} height={32} />
        </div>
        <h1 className="mx-auto mt-4 max-w-lg text-center text-2xl font-bold">
          التصويت العام
        </h1>
      </header>

      <main className="mx-auto max-w-lg p-4">
        {!votingOpen ? (
          <div className="card text-center">
            <p className="text-xl text-gray-600">التصويت غير مفعّل حالياً</p>
            <p className="mt-2 text-sm text-gray-500">
              يرجى انتظار تفعيل التصويت من قبل الميسّر
            </p>
          </div>
        ) : (
          <>
            {state?.voting_active && (
              <section className="card mb-6">
                <h2 className="mb-4 text-xl font-bold text-primary">تصويت التحديات</h2>
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
                            onChange={(stars) =>
                              castVote(ch.id, stars, voterId, "public")
                            }
                          />
                          {state.results_visible && (
                            <span className="font-bold text-secondary">
                              {(getChallengeAverage(ch.id) ?? 0).toFixed(1)} ★
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                  {challenges.length === 0 && (
                    <p className="text-gray-500">لا توجد تحديات للتصويت</p>
                  )}
                </ul>
              </section>
            )}

            {state?.improvement_voting_active && (
              <section className="card">
                <h2 className="mb-4 text-xl font-bold text-primary">تصويت التحسينات</h2>
                <ul className="space-y-4">
                  {improvements.map((imp) => {
                    const myVote = improvementVotes.find(
                      (v) => v.improvement_id === imp.id && v.voter_id === voterId
                    );
                    const team = teams.find((t) => t.id === imp.team_id);
                    return (
                      <li key={imp.id} className="rounded-xl border border-primary/10 p-4">
                        <p className="font-semibold">{imp.text}</p>
                        <p className="text-sm text-gray-500">{team?.name}</p>
                        <div className="mt-3 flex items-center justify-between">
                          <StarRating
                            value={myVote?.stars ?? 0}
                            onChange={(stars) =>
                              castImprovementVote(imp.id, stars, voterId, "public")
                            }
                          />
                          {state.results_visible && (
                            <span className="font-bold text-secondary">
                              {(getImprovementAverage(imp.id) ?? 0).toFixed(1)} ★
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                  {improvements.length === 0 && (
                    <p className="text-gray-500">لا توجد تحسينات للتصويت</p>
                  )}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
