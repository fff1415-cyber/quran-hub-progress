"use client";

import type { Slide } from "@/lib/content/presentation";
import {
  CHALLENGE_TOPICS,
  DIRECTIONAL_CHALLENGES,
  WORKSHOP_TITLE,
  WORKSHOP_YEAR,
} from "@/lib/content/presentation";
import type { Challenge, Improvement, Team } from "@/lib/types/workshop";
import ZadLogo from "./ZadLogo";

interface SlideRendererProps {
  slide: Slide;
  challenges?: Challenge[];
  improvements?: Improvement[];
  teams?: Team[];
  showResults?: boolean;
  getChallengeAverage?: (id: string) => number;
  getImprovementAverage?: (id: string) => number;
}

function SlideShell({
  children,
  dark = false,
  className = "",
}: {
  children: React.ReactNode;
  dark?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center p-8 md:p-16 ${
        dark ? "bg-primary text-white" : "bg-white text-gray-900"
      } ${className}`}
    >
      {children}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="mt-6 space-y-4 text-right text-xl leading-relaxed md:text-2xl">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="text-secondary">•</span>
          <span className="flex-1 whitespace-pre-wrap">{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function SlideRenderer({
  slide,
  challenges = [],
  improvements = [],
  teams = [],
  showResults = false,
  getChallengeAverage,
  getImprovementAverage,
}: SlideRendererProps) {
  switch (slide.type) {
    case "cover":
      return (
        <SlideShell dark className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-secondary opacity-90" />
          <div className="relative z-10 flex flex-col items-center gap-8 text-center">
            <ZadLogo variant="white" width={180} height={72} />
            <h1 className="text-5xl font-bold md:text-7xl">{slide.title}</h1>
            <p className="text-3xl text-white/90 md:text-4xl">{slide.content}</p>
            <p className="mt-4 text-xl text-white/70">{WORKSHOP_TITLE} — {WORKSHOP_YEAR}هـ</p>
          </div>
        </SlideShell>
      );

    case "section":
      return (
        <SlideShell dark>
          <ZadLogo variant="white" width={140} height={56} className="mb-8" />
          <h1 className="text-center text-5xl font-bold md:text-7xl">{slide.title}</h1>
        </SlideShell>
      );

    case "project-intro":
      return (
        <SlideShell>
          <h1 className="mb-8 text-4xl font-bold text-primary md:text-5xl">{slide.title}</h1>
          <div className="grid w-full max-w-3xl gap-6">
            {(typeof slide.content === "string" ? slide.content.split("\n") : []).map((line, i) => (
              <div
                key={i}
                className="rounded-2xl border-2 border-primary/20 bg-primary/5 px-8 py-6 text-2xl font-semibold text-primary"
              >
                {line}
              </div>
            ))}
          </div>
        </SlideShell>
      );

    case "project-definition":
      return (
        <SlideShell>
          <h1 className="mb-8 text-4xl font-bold text-primary md:text-5xl">{slide.title}</h1>
          <p className="max-w-4xl text-right text-2xl leading-loose md:text-3xl">
            {slide.content}
          </p>
        </SlideShell>
      );

    case "project-goals":
      return (
        <SlideShell>
          <h1 className="mb-8 text-4xl font-bold text-primary md:text-5xl">{slide.title}</h1>
          <BulletList items={Array.isArray(slide.content) ? slide.content : []} />
        </SlideShell>
      );

    case "target-audience":
      return (
        <SlideShell>
          <h1 className="mb-10 text-4xl font-bold text-primary md:text-5xl">{slide.title}</h1>
          <div className="grid w-full max-w-5xl gap-8 md:grid-cols-2">
            {slide.sections?.map((section, i) => (
              <div key={i} className="rounded-2xl border border-primary/20 bg-primary/5 p-8">
                <h2 className="mb-4 text-2xl font-bold text-secondary">{section.heading}</h2>
                <p className="text-lg leading-relaxed">{section.body as string}</p>
              </div>
            ))}
          </div>
        </SlideShell>
      );

    case "journey-section":
      return (
        <SlideShell dark>
          <h1 className="text-center text-5xl font-bold md:text-7xl">{slide.title}</h1>
        </SlideShell>
      );

    case "journey-map":
      return (
        <SlideShell>
          <h1 className="mb-2 text-center text-4xl font-bold text-primary">{slide.title}</h1>
          <p className="mb-8 text-center text-3xl text-secondary">{slide.content}</p>
          {slide.sections?.map((section, i) => (
            <div key={i} className="w-full max-w-5xl">
              <h2 className="mb-6 text-center text-2xl font-bold">{section.heading}</h2>
              <div className="flex flex-wrap justify-center gap-3">
                {(Array.isArray(section.body) ? section.body : [section.body]).map((step, j) => (
                  <div
                    key={j}
                    className="rounded-xl bg-gradient-to-l from-primary to-secondary px-5 py-3 text-lg font-medium text-white"
                  >
                    {step}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </SlideShell>
      );

    case "what-happened":
      return (
        <SlideShell dark>
          <h1 className="text-center text-5xl font-bold md:text-7xl">{slide.title}</h1>
          <p className="mt-8 text-center text-2xl text-white/80">
            نستعرض ما حدث فعلياً في تنفيذ المشروع
          </p>
        </SlideShell>
      );

    case "challenges":
      return (
        <SlideShell>
          <h1 className="mb-10 text-5xl font-bold text-primary md:text-6xl">{slide.title}</h1>
          <div className="w-full max-w-4xl rounded-2xl border-2 border-secondary/30 bg-secondary/5 p-8">
            <p className="text-center text-2xl leading-relaxed">
              التحديات التي واجهت المشروع وفرص التحسين
            </p>
          </div>
        </SlideShell>
      );

    case "challenge-topics":
      return (
        <SlideShell>
          <h1 className="mb-10 text-4xl font-bold text-primary md:text-5xl">{slide.title}</h1>
          <div className="grid w-full max-w-6xl grid-cols-1 gap-4 md:grid-cols-3">
            {CHALLENGE_TOPICS.map((topic) => (
              <div
                key={topic.id}
                className="rounded-xl border border-primary/20 bg-white p-5 shadow-sm transition hover:border-primary/50"
              >
                <span className="mb-2 inline-block rounded-full bg-primary px-3 py-1 text-sm text-white">
                  {topic.id}
                </span>
                <h3 className="text-lg font-bold text-primary">{topic.title}</h3>
                {topic.subtitle && (
                  <p className="mt-1 text-sm text-gray-600">{topic.subtitle}</p>
                )}
              </div>
            ))}
          </div>
        </SlideShell>
      );

    case "improvements":
      return (
        <SlideShell>
          <h1 className="mb-10 text-5xl font-bold text-primary">{slide.title}</h1>
          {showResults && improvements.length > 0 ? (
            <div className="w-full max-w-4xl space-y-4">
              {[...improvements]
                .sort(
                  (a, b) =>
                    (getImprovementAverage?.(b.id) ?? 0) - (getImprovementAverage?.(a.id) ?? 0)
                )
                .slice(0, 10)
                .map((imp) => (
                  <div
                    key={imp.id}
                    className="flex items-center justify-between rounded-xl border border-primary/20 p-4"
                  >
                    <span className="text-secondary font-bold">
                      {(getImprovementAverage?.(imp.id) ?? 0).toFixed(1)} ★
                    </span>
                    <span className="flex-1 px-4 text-right">{imp.text}</span>
                    <span className="text-sm text-gray-500">
                      {teams.find((t) => t.id === imp.team_id)?.name ?? ""}
                    </span>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-2xl text-gray-600">شاركونا أفكاركم لتحسين المشروع</p>
          )}
        </SlideShell>
      );

    case "documentation":
      return (
        <SlideShell dark>
          <h1 className="text-center text-5xl font-bold md:text-6xl">{slide.title}</h1>
          <p className="mt-4 text-center text-4xl text-white/90">{slide.content}</p>
        </SlideShell>
      );

    case "closing":
      return (
        <SlideShell dark className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          <div className="relative z-10 flex flex-col items-center gap-6 text-center">
            <ZadLogo variant="white" width={160} height={64} />
            <h1 className="text-4xl font-bold md:text-5xl">{slide.title}</h1>
            <p className="text-2xl text-white/90 md:text-3xl">{slide.content}</p>
          </div>
        </SlideShell>
      );

    default:
      return (
        <SlideShell>
          <h1 className="text-4xl font-bold">{slide.title ?? "شريحة"}</h1>
        </SlideShell>
      );
  }
}

export function DirectionalChallengesBanner() {
  return (
    <div className="fixed top-0 right-0 left-0 z-40 bg-secondary px-6 py-3 text-center text-white shadow-lg">
      <p className="text-sm font-medium md:text-base">
        <span className="font-bold">التحديات الاتجاهية: </span>
        {DIRECTIONAL_CHALLENGES.join(" — ")}
      </p>
    </div>
  );
}

export function FinalReportPanel({
  challenges,
  teams,
  getChallengeAverage,
}: {
  challenges: Challenge[];
  teams: Team[];
  getChallengeAverage: (id: string) => number;
}) {
  const ranked = [...challenges].sort(
    (a, b) => (getChallengeAverage(b.id) ?? 0) - (getChallengeAverage(a.id) ?? 0)
  );

  return (
    <SlideShell>
      <h1 className="mb-10 text-4xl font-bold text-primary">التقرير الختامي</h1>
      <div className="w-full max-w-5xl space-y-3">
        {ranked.map((ch, i) => {
          const topic = CHALLENGE_TOPICS.find((t) => t.id === ch.topic_id);
          const team = teams.find((t) => t.id === ch.team_id);
          return (
            <div
              key={ch.id}
              className="flex items-center gap-4 rounded-xl border border-primary/20 p-4"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-white">
                {i + 1}
              </span>
              <div className="flex-1 text-right">
                <p className="font-semibold">{ch.custom_text}</p>
                <p className="text-sm text-gray-500">
                  {topic?.title} — {team?.name}
                </p>
              </div>
              <span className="text-xl font-bold text-secondary">
                {(getChallengeAverage(ch.id) ?? 0).toFixed(1)} ★
              </span>
            </div>
          );
        })}
        {ranked.length === 0 && (
          <p className="text-center text-xl text-gray-500">لا توجد نتائج بعد</p>
        )}
      </div>
    </SlideShell>
  );
}
