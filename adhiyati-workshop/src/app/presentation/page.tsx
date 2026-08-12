"use client";

import { useMemo } from "react";
import SlideRenderer, {
  DirectionalChallengesBanner,
  FinalReportPanel,
} from "@/components/SlideRenderer";
import { PRESENTATION_SLIDES } from "@/lib/content/presentation";
import {
  useChallenges,
  useImprovements,
  useTeams,
  useVotes,
  useWorkshopState,
} from "@/hooks/useWorkshop";

export default function PresentationPage() {
  const { state, loading } = useWorkshopState();
  const { challenges } = useChallenges();
  const { improvements } = useImprovements();
  const { teams } = useTeams();
  const { getChallengeAverage } = useVotes();
  const { getImprovementAverage } = useImprovements();

  const slide = useMemo(() => {
    if (!state) return PRESENTATION_SLIDES[0];
    return PRESENTATION_SLIDES.find((s) => s.id === state.current_slide) ?? PRESENTATION_SLIDES[0];
  }, [state]);

  const showFinalReport =
    state?.current_stage === "final-report" || state?.results_visible;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-primary text-white">
        <p className="text-2xl">جاري التحميل...</p>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <DirectionalChallengesBanner />

      <div className="h-full pt-12">
        {showFinalReport ? (
          <FinalReportPanel
            challenges={challenges}
            teams={teams}
            getChallengeAverage={getChallengeAverage}
          />
        ) : (
          <SlideRenderer
            slide={slide}
            challenges={challenges}
            improvements={improvements}
            teams={teams}
            showResults={state?.results_visible}
            getChallengeAverage={getChallengeAverage}
            getImprovementAverage={getImprovementAverage}
          />
        )}
      </div>

      <div className="fixed bottom-4 right-4 rounded-full bg-black/50 px-4 py-2 text-sm text-white">
        {state?.current_slide ?? 1} / {PRESENTATION_SLIDES.length}
      </div>
    </div>
  );
}
