"use client";

import Link from "next/link";
import { useState } from "react";
import ProgressBar from "@/components/ProgressBar";
import ZadLogo from "@/components/ZadLogo";
import {
  CHALLENGE_TOPICS,
  PRESENTATION_SLIDES,
  WORKSHOP_STAGES,
} from "@/lib/content/presentation";
import type { WorkshopStageKey } from "@/lib/content/presentation";
import { useWorkshopState } from "@/hooks/useWorkshop";

export default function DashboardPage() {
  const { state, loading, updateState } = useWorkshopState();
  const [busy, setBusy] = useState(false);

  if (loading || !state) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-xl text-primary">جاري التحميل...</p>
      </div>
    );
  }

  const currentStageIndex = WORKSHOP_STAGES.findIndex((s) => s.key === state.current_stage);

  async function handleUpdate(updates: Parameters<typeof updateState>[0]) {
    setBusy(true);
    await updateState(updates);
    setBusy(false);
  }

  function toggleLockedTopic(topicId: number) {
    if (!state) return;
    const locked = state.locked_topics.includes(topicId)
      ? state.locked_topics.filter((id) => id !== topicId)
      : [...state.locked_topics, topicId];
    handleUpdate({ locked_topics: locked });
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary">لوحة التحكم</h1>
          <p className="text-gray-600">إدارة مراحل الورشة والعرض التقديمي</p>
        </div>
        <div className="flex items-center gap-4">
          <ZadLogo width={100} height={40} />
          <Link href="/" className="btn-outline text-sm">
            الرئيسية
          </Link>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-4 text-xl font-bold text-primary">مرحلة الورشة</h2>
          <ProgressBar
            current={currentStageIndex + 1}
            total={WORKSHOP_STAGES.length}
            label={WORKSHOP_STAGES[currentStageIndex]?.label}
          />
          <div className="mt-4 grid gap-2">
            {WORKSHOP_STAGES.map((stage) => (
              <button
                key={stage.key}
                type="button"
                disabled={busy}
                onClick={() => handleUpdate({ current_stage: stage.key as WorkshopStageKey })}
                className={`rounded-xl px-4 py-3 text-right transition ${
                  state.current_stage === stage.key
                    ? "bg-primary text-white"
                    : "bg-gray-100 hover:bg-primary/10"
                }`}
              >
                {stage.label}
              </button>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 className="mb-4 text-xl font-bold text-primary">العرض التقديمي</h2>
          <p className="mb-2 text-gray-600">
            الشريحة {state.current_slide} من {PRESENTATION_SLIDES.length}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || state.current_slide <= 1}
              onClick={() => handleUpdate({ current_slide: state.current_slide - 1 })}
              className="btn-outline flex-1"
            >
              السابق
            </button>
            <button
              type="button"
              disabled={busy || state.current_slide >= PRESENTATION_SLIDES.length}
              onClick={() => handleUpdate({ current_slide: state.current_slide + 1 })}
              className="btn-primary flex-1"
            >
              التالي
            </button>
          </div>
          <div className="mt-4 max-h-48 overflow-y-auto">
            {PRESENTATION_SLIDES.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={busy}
                onClick={() => handleUpdate({ current_slide: s.id })}
                className={`mb-1 w-full rounded-lg px-3 py-2 text-right text-sm ${
                  state.current_slide === s.id ? "bg-secondary text-white" : "hover:bg-gray-100"
                }`}
              >
                {s.id}. {s.title ?? s.type}
              </button>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 className="mb-4 text-xl font-bold text-primary">التصويت والنتائج</h2>
          <div className="space-y-3">
            <label className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
              <span>تفعيل تصويت التحديات</span>
              <input
                type="checkbox"
                checked={state.voting_active}
                onChange={(e) => handleUpdate({ voting_active: e.target.checked })}
                className="h-5 w-5 accent-primary"
              />
            </label>
            <label className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
              <span>تفعيل تصويت التحسينات</span>
              <input
                type="checkbox"
                checked={state.improvement_voting_active}
                onChange={(e) => handleUpdate({ improvement_voting_active: e.target.checked })}
                className="h-5 w-5 accent-primary"
              />
            </label>
            <label className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
              <span>إظهار النتائج</span>
              <input
                type="checkbox"
                checked={state.results_visible}
                onChange={(e) => handleUpdate({ results_visible: e.target.checked })}
                className="h-5 w-5 accent-primary"
              />
            </label>
          </div>
        </section>

        <section className="card">
          <h2 className="mb-4 text-xl font-bold text-primary">قفل المحاور</h2>
          <div className="grid gap-2">
            {CHALLENGE_TOPICS.map((topic) => (
              <label
                key={topic.id}
                className="flex items-center justify-between rounded-xl bg-gray-50 p-3"
              >
                <span className="text-sm">{topic.title}</span>
                <input
                  type="checkbox"
                  checked={state.locked_topics.includes(topic.id)}
                  onChange={() => toggleLockedTopic(topic.id)}
                  className="h-5 w-5 accent-primary"
                />
              </label>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-6 flex gap-4">
        <Link href="/presentation" className="btn-primary">
          فتح العرض التقديمي
        </Link>
        <Link href="/participant" className="btn-secondary">
          واجهة المشارك
        </Link>
        <Link href="/voting" className="btn-outline">
          واجهة التصويت
        </Link>
      </div>
    </div>
  );
}
