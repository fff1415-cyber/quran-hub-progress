import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  loadHalaqat, loadStudents, loadSardQueue, updateSardItem,
  pushSardHistory, pushNotification, sortMusammiQueue,
  type SardQueueItem,
} from "@/lib/mock-data";
import { weekLabel } from "@/lib/arabic-numbers";
import { useEvaluationSettings } from "@/contexts/EvaluationSettingsContext";
import {
  computeReviewScore,
  emptyReviewSegments,
  maxAllowedMinutes,
  normalizeReviewSegments,
  parseMemorizedJuzCount,
  reviewSegmentCount,
} from "@/lib/evaluation-calculator";
import type { EvaluationSettings, SegmentTally } from "@/lib/evaluation-types";
import {
  buildReviewOnlyPatch,
  computeFullPhaseHifz,
  computeMergedEvaluation,
  isMusammiVisible,
  resetFullSardAttempt,
  scheduleRetry,
  sardPhase,
} from "@/lib/sard-phased-flow";
import { runPostPassAutomation } from "@/lib/post-pass-automation";
import { promoteStudentPhase } from "@/lib/student-phase-promote";
import { notifyTeacherHalaqa } from "@/lib/teacher-notifications";
import { AppHeader } from "@/components/AppHeader";
import { Mic, Minus, Plus, ArrowRight, Award, CheckCircle2, XCircle, Clock, Lock } from "lucide-react";
import { Toaster, toast } from "sonner";

export const Route = createFileRoute("/musammi")({ component: MusammiPage });

function notifyTeacherSard(halaqaId: number, message: string) {
  notifyTeacherHalaqa(halaqaId, message, "sard");
}

function notifyTeacherTransfer(
  studentId: string,
  halaqaId: number,
  week: number,
  studentName: string,
  reason: string,
) {
  notifyTeacherHalaqa(halaqaId, `${studentName}: ${reason}`, "transfer");
  pushNotification({
    message: `تحويل للمدير: ${studentName} — ${reason}`,
    type: "transfer",
    actionTab: "transfers",
    transferStatus: "pending",
    transferData: {
      studentId,
      halaqaId,
      week,
      reason,
      fromName: "المسمّع",
    },
  });
}

function MusammiPage() {
  const [queue, setQueue] = useState<SardQueueItem[]>(() => loadSardQueue());
  const [activeId, setActiveId] = useState<string | null>(null);
  const halaqat = loadHalaqat();
  const students = loadStudents();

  const refresh = () => setQueue(loadSardQueue());

  const visible = useMemo(
    () => sortMusammiQueue(queue.filter((q) => isMusammiVisible(q))),
    [queue],
  );

  const active = visible.find((q) => q.id === activeId) || null;
  const activeStudent = active ? students.find((s) => s.id === active.studentId) : null;
  const activeHalaqa = active ? halaqat.find((h) => h.id === active.halaqaId) : null;

  if (active && activeStudent && activeHalaqa) {
    return (
      <div className="min-h-screen">
        <Toaster position="top-center" richColors />
        <AppHeader title="تقييم السرد" subtitle="مسمّع" />
        <main className="max-w-3xl mx-auto px-4 py-8">
          <button onClick={() => setActiveId(null)} className="flex items-center gap-2 text-sm text-primary mb-4">
            <ArrowRight className="w-4 h-4" /> العودة لقائمة السرد
          </button>
          <SardEvaluator
            item={active}
            studentName={activeStudent.name}
            level={activeStudent.level}
            levelType={activeStudent.levelType}
            memorized={activeStudent.memorized}
            halaqaName={activeHalaqa.name}
            onDone={() => { setActiveId(null); refresh(); }}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Toaster position="top-center" richColors />
      <AppHeader title="صفحة المسمّع" subtitle="تقييم السرد" />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="glass-card rounded-2xl p-6 mb-6 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl gold-gradient flex items-center justify-center">
            <Mic className="w-7 h-7 text-primary-foreground" />
          </div>
          <div>
            <h1 className="display text-2xl gold-text">قائمة السرد</h1>
            <p className="text-sm text-muted-foreground">
              {visible.length === 0 ? "لا يوجد طلاب حالياً" : `${visible.length} طالب بانتظار التسميع`}
            </p>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center">
            <p className="text-muted-foreground">لا يوجد طلاب محالين للسرد حالياً</p>
            <p className="text-xs text-muted-foreground mt-2">سيظهرون هنا عندما يفعّل المعلم خانة &quot;السرد&quot;</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {visible.map((q) => {
              const s = students.find((x) => x.id === q.studentId);
              const h = halaqat.find((x) => x.id === q.halaqaId);
              if (!s || !h) return null;
              const reviewOnly = sardPhase(q) === "review_only";
              return (
                <button key={q.id} onClick={() => setActiveId(q.id)}
                  className="glass-card rounded-2xl p-5 text-right hover:gold-glow hover:border-primary transition-all">
                  <div className="flex items-start justify-between mb-2">
                    <div className="font-bold text-lg">{s.name}</div>
                    <div className="flex flex-col items-end gap-1">
                      {reviewOnly && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary/15 text-primary">
                          مراجعة فقط
                        </span>
                      )}
                      {q.attempt > 1 && !reviewOnly && (
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${q.attempt === 3 ? "bg-warning/20 text-warning" : "bg-secondary text-muted-foreground"}`}>
                          محاولة {q.attempt}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">{h.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">{weekLabel(q.week)} · مستوى {s.level}</div>
                  {reviewOnly && q.lockedHifzScore != null && (
                    <div className="text-xs text-success mt-1 flex items-center gap-1">
                      <Lock className="w-3 h-3" /> حفظ مثبت: {q.lockedHifzScore}
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${s.levelType === "gold" ? "gold-gradient text-primary-foreground" : "bg-muted text-foreground"}`}>
                      {s.levelType === "gold" ? "ذهبي" : "فضي"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function Counter({
  label, value, onDec, onInc, failed, max,
}: {
  label: string; value: number; onDec: () => void; onInc: () => void; failed?: boolean; max?: number;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-3">
        <button type="button" onClick={onDec}
          className="w-10 h-10 rounded-xl bg-success/20 border border-success/50 text-success hover:bg-success/30 flex items-center justify-center">
          <Minus className="w-4 h-4" />
        </button>
        <div className={`text-3xl font-bold display ${failed ? "text-destructive" : ""}`}>{value}</div>
        <button type="button" onClick={onInc} disabled={max !== undefined && value >= max}
          className="w-10 h-10 rounded-xl bg-destructive/20 border border-destructive/50 text-destructive hover:bg-destructive/30 flex items-center justify-center disabled:opacity-40">
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function ReviewSegmentsEditor({
  segments, settings, onChange,
}: {
  segments: SegmentTally[];
  settings: EvaluationSettings;
  onChange: (next: SegmentTally[]) => void;
}) {
  const setSeg = (idx: number, patch: Partial<SegmentTally>) => {
    onChange(segments.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  return (
    <div className="space-y-4">
      {segments.map((seg, i) => {
        const segFailed = seg.errors >= settings.review_max_errors_per_segment;
        return (
          <div key={i} className="rounded-lg border border-border/60 p-3 bg-input/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">المقطع {i + 1}</span>
              <span className={`text-xs font-bold ${segFailed ? "text-destructive" : "text-muted-foreground"}`}>
                {segFailed ? "راسب" : `${seg.errors} أخطاء · ${seg.warnings} تنبيهات`}
              </span>
            </div>
            <div className="flex gap-1 mb-2">
              {[1, 2, 3, 4, 5].map((slot) => {
                const filled = seg.errors >= slot;
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSeg(i, {
                      errors: filled && seg.errors === slot ? slot - 1 : slot,
                    })}
                    className={`flex-1 h-8 rounded border transition-all ${
                      filled
                        ? slot >= settings.review_max_errors_per_segment
                          ? "bg-destructive border-destructive"
                          : "bg-warning/40 border-warning"
                        : "border-border bg-input hover:border-primary/50"
                    }`}
                    title={`خطأ ${slot}`}
                  >
                    {filled && <span className="text-xs font-bold">{slot}</span>}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-12">تنبيه</span>
              <button type="button" onClick={() => setSeg(i, { warnings: Math.max(0, seg.warnings - 1) })}
                className="w-8 h-8 rounded bg-secondary text-xs">−</button>
              <span className="text-sm font-bold w-6 text-center">{seg.warnings}</span>
              <button type="button"
                onClick={() => setSeg(i, { warnings: Math.min(settings.review_max_warnings_per_segment, seg.warnings + 1) })}
                className="w-8 h-8 rounded bg-secondary text-xs">+</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

async function promoteStudentLevel(studentId: string, _level: string): Promise<string> {
  return promoteStudentPhase(studentId);
}

function ResultSummary({
  percent, totalScore, maxTotal, passPercent, passed, failed, hint,
}: {
  percent: number; totalScore: number; maxTotal: number; passPercent: number;
  passed: boolean; failed: boolean; hint?: string;
}) {
  return (
    <div className={`p-5 rounded-2xl border-2 ${passed ? "border-success bg-success/10" : failed ? "border-destructive bg-destructive/10" : "border-border bg-secondary/30"}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold flex items-center gap-2">
          {passed ? <CheckCircle2 className="w-5 h-5 text-success" /> : failed ? <XCircle className="w-5 h-5 text-destructive" /> : <Clock className="w-5 h-5" />}
          النتيجة الإجمالية
        </h3>
        <div className="text-3xl font-bold display">
          <span className={passed ? "text-success" : failed ? "text-destructive" : "gold-text"}>{percent}%</span>
        </div>
      </div>
      <div className="text-sm text-muted-foreground">
        مجموع: {totalScore} / {maxTotal} · الاجتياز ≥ {passPercent}%
      </div>
      {hint && <p className="text-sm text-muted-foreground mt-2">{hint}</p>}
    </div>
  );
}

function SardEvaluator(props: {
  item: SardQueueItem;
  studentName: string;
  level: string;
  levelType: "gold" | "silver";
  memorized?: string;
  halaqaName: string;
  onDone: () => void;
}) {
  if (sardPhase(props.item) === "review_only") {
    return <SardEvaluatorReviewOnly {...props} />;
  }
  return <SardEvaluatorFull {...props} />;
}

function SardEvaluatorFull({
  item, studentName, level, levelType, memorized, halaqaName, onDone,
}: {
  item: SardQueueItem;
  studentName: string;
  level: string;
  levelType: "gold" | "silver";
  memorized?: string;
  halaqaName: string;
  onDone: () => void;
}) {
  const { settings } = useEvaluationSettings();
  const juzCount = parseMemorizedJuzCount(memorized, level);
  const segmentCount = reviewSegmentCount(juzCount, settings);
  const maxMinutes = maxAllowedMinutes(juzCount, settings);

  const [hifzErrors, setHifzErrors] = useState(item.hifzErrors ?? 0);
  const [hifzWarnings, setHifzWarnings] = useState(item.hifzWarnings ?? 0);
  const [reviewSegments, setReviewSegments] = useState<SegmentTally[]>(() =>
    normalizeReviewSegments(
      item.reviewErrors?.map((errors, i) => ({ errors, warnings: item.reviewWarnings?.[i] ?? 0 })),
      segmentCount,
    ),
  );

  useEffect(() => {
    setReviewSegments((prev) => normalizeReviewSegments(prev, segmentCount));
  }, [segmentCount]);

  const hifz = computeFullPhaseHifz(hifzErrors, hifzWarnings, settings);
  const review = computeReviewScore(reviewSegments, settings);
  const merged = computeMergedEvaluation(hifz.score, reviewSegments, settings);

  const submit = async () => {
    const reviewErrors = reviewSegments.map((s) => s.errors);
    const reviewWarnings = reviewSegments.map((s) => s.warnings);

    if (hifz.failed) {
      pushSardHistory({
        id: `sh-${Date.now()}`, studentId: item.studentId, halaqaId: item.halaqaId,
        week: item.week, attempt: item.attempt, result: "failed", percent: 0,
        hifzErrors, hifzWarnings, reviewErrors, reviewWarnings, at: new Date().toISOString(),
      });

      if (item.attempt === 1) {
        updateSardItem(item.id, {
          status: "scheduled",
          attempt: 2,
          scheduledAt: scheduleRetry(settings.retry_delay_days),
          ...resetFullSardAttempt(segmentCount),
        });
        notifyTeacherSard(item.halaqaId, `الطالب ${studentName} رسب في السرد — المحاولة الأولى (إعادة بعد ${settings.retry_delay_days} يوم)`);
        toast.error(`راسب في الحفظ — إعادة السرد (حفظ + مراجعة) بعد ${settings.retry_delay_days} يوم`);
      } else if (item.attempt === 2) {
        updateSardItem(item.id, {
          status: "awaiting_supervisor", attempt: 2,
          hifzErrors, hifzWarnings, reviewErrors, reviewWarnings, finalPercent: 0,
        });
        notifyTeacherSard(item.halaqaId, `الطالب ${studentName} رسب في السرد — المحاولة الثانية (بانتظار موافقة المشرف)`);
        toast.warning("ينتقل للمشرف العلمي للموافقة على محاولة ثالثة");
      } else {
        updateSardItem(item.id, {
          status: "final_failed", finalPercent: 0,
          hifzErrors, hifzWarnings, reviewErrors, reviewWarnings,
        });
        notifyTeacherTransfer(item.studentId, item.halaqaId, item.week, studentName, "رسب في السرد — المحاولة الثالثة — نقل للمدير");
        toast.error("رسوب في الحفظ — نقل إلى الإدارة");
      }
      onDone();
      return;
    }

    if (review.failed) {
      updateSardItem(item.id, buildReviewOnlyPatch(item, hifz.score, hifzErrors, hifzWarnings, segmentCount, settings.retry_delay_days));
      notifyTeacherSard(item.halaqaId, `اجتاز ${studentName} الحفظ (${hifz.score}) — جُدولت المراجعة بعد ${settings.retry_delay_days} يوم`);
      toast.success(`تم تثبيت الحفظ (${hifz.score}) — مراجعة بعد ${settings.retry_delay_days} يوم`);
      onDone();
      return;
    }

    pushSardHistory({
      id: `sh-${Date.now()}`, studentId: item.studentId, halaqaId: item.halaqaId,
      week: item.week, attempt: item.attempt,
      result: merged.passed ? "passed" : "failed",
      percent: merged.percent,
      hifzErrors, hifzWarnings, reviewErrors, reviewWarnings,
      at: new Date().toISOString(),
    });

    if (merged.passed) {
      updateSardItem(item.id, { status: "passed", finalPercent: merged.percent, phase: "full" });
      try {
        const newLevel = await promoteStudentLevel(item.studentId, level);
        const advance = await runPostPassAutomation({
          studentId: item.studentId,
          halaqaId: item.halaqaId,
          week: item.week,
          attempt: item.attempt,
          percent: merged.percent,
          hifzScore: merged.hifzScore,
          reviewScore: merged.reviewScore,
          track: levelType,
          assignedBy: "المسمّع",
        });
        const planMsg = advance.newPlanTitle
          ? ` — انتقل إلى ${advance.newPlanTitle}`
          : advance.closedPlanTitle
            ? ` — أُنجزت ${advance.closedPlanTitle}`
            : "";
        notifyTeacherSard(item.halaqaId, `الطالب ${studentName} اجتاز السرد بنسبة ${merged.percent}% — المستوى ${newLevel}${planMsg}`);
        toast.success(`اجتاز بنسبة ${merged.percent}% — المستوى ${newLevel}${planMsg}`);
      } catch {
        toast.success(`اجتاز بنسبة ${merged.percent}%`);
      }
    } else {
      updateSardItem(item.id, {
        status: "final_failed", finalPercent: merged.percent, phase: "full",
        hifzErrors, hifzWarnings, reviewErrors, reviewWarnings,
      });
      notifyTeacherTransfer(item.studentId, item.halaqaId, item.week, studentName, `رسب نهائياً في السرد (${merged.percent}%)`);
      toast.error(`رسب نهائياً (${merged.percent}%) — الإدارة تتخذ القرار`);
    }
    onDone();
  };

  return (
    <div className="glass-card rounded-2xl p-6 space-y-6">
      <StudentHeader
        studentName={studentName} halaqaName={halaqaName} week={item.week}
        level={level} levelType={levelType} attempt={item.attempt}
        extra={`حفظ ≈ ${juzCount} جزء · ${segmentCount} مقاطع · ≈ ${maxMinutes} د`}
        badge="سرد كامل (حفظ + مراجعة)"
      />

      <HifzPanel
        settings={settings} hifzErrors={hifzErrors} hifzWarnings={hifzWarnings}
        hifzScore={hifz.score} hifzFailed={hifz.failed}
        onErrors={setHifzErrors} onWarnings={setHifzWarnings}
      />

      <ReviewPanel
        settings={settings} segmentCount={segmentCount}
        reviewScore={review.score} reviewFailed={review.failed}
        segments={reviewSegments} onChange={setReviewSegments}
      />

      <ResultSummary
        percent={merged.percent} totalScore={merged.totalScore} maxTotal={merged.maxTotal}
        passPercent={settings.pass_percent} passed={merged.passed && !hifz.failed}
        failed={hifz.failed || merged.failed}
        hint={
          hifz.failed
            ? "رسوب الحفظ — يُعاد السرد كاملاً (حفظ + مراجعة)."
            : review.failed
              ? "رسوب في مقطع مراجعة — يُثبَّت الحفظ وتُجدول المراجعة لاحقاً."
              : !merged.passed
                ? "النسبة دون الحد — يُحوَّل للإدارة."
                : undefined
        }
      />

      <button type="button" onClick={() => void submit()}
        className="w-full py-4 rounded-xl gold-gradient text-primary-foreground font-bold text-lg hover:scale-[1.01] transition-transform gold-glow">
        إرسال التقييم
      </button>
    </div>
  );
}

function SardEvaluatorReviewOnly({
  item, studentName, level, levelType, memorized, halaqaName, onDone,
}: {
  item: SardQueueItem;
  studentName: string;
  level: string;
  levelType: "gold" | "silver";
  memorized?: string;
  halaqaName: string;
  onDone: () => void;
}) {
  const { settings } = useEvaluationSettings();
  const juzCount = parseMemorizedJuzCount(memorized, level);
  const segmentCount = item.reviewSegmentCount ?? reviewSegmentCount(juzCount, settings);
  const lockedHifz = item.lockedHifzScore ?? 0;

  const [reviewSegments, setReviewSegments] = useState<SegmentTally[]>(() =>
    normalizeReviewSegments(
      item.reviewErrors?.map((errors, i) => ({ errors, warnings: item.reviewWarnings?.[i] ?? 0 })),
      segmentCount,
    ),
  );

  const review = computeReviewScore(reviewSegments, settings);
  const merged = computeMergedEvaluation(lockedHifz, reviewSegments, settings);

  const submit = async () => {
    const reviewErrors = reviewSegments.map((s) => s.errors);
    const reviewWarnings = reviewSegments.map((s) => s.warnings);

    if (review.failed) {
      const segs = emptyReviewSegments(segmentCount);
      updateSardItem(item.id, {
        status: "awaiting_review",
        scheduledAt: scheduleRetry(settings.retry_delay_days),
        reviewErrors: segs.map((s) => s.errors),
        reviewWarnings: segs.map((s) => s.warnings),
      });
      notifyTeacherSard(item.halaqaId, `رسب ${studentName} في المراجعة — إعادة بعد ${settings.retry_delay_days} يوم (الحفظ مثبت)`);
      toast.warning(`راسب في المراجعة — إعادة بعد ${settings.retry_delay_days} يوم (درجة الحفظ مثبتة)`);
      onDone();
      return;
    }

    pushSardHistory({
      id: `sh-${Date.now()}`, studentId: item.studentId, halaqaId: item.halaqaId,
      week: item.week, attempt: item.attempt,
      result: merged.passed ? "passed" : "failed",
      percent: merged.percent,
      hifzErrors: item.lockedHifzErrors ?? 0,
      hifzWarnings: item.lockedHifzWarnings ?? 0,
      reviewErrors, reviewWarnings,
      at: new Date().toISOString(),
    });

    if (merged.passed) {
      updateSardItem(item.id, { status: "passed", finalPercent: merged.percent, phase: "review_only" });
      try {
        const newLevel = await promoteStudentLevel(item.studentId, level);
        const advance = await runPostPassAutomation({
          studentId: item.studentId,
          halaqaId: item.halaqaId,
          week: item.week,
          attempt: item.attempt,
          percent: merged.percent,
          hifzScore: merged.hifzScore,
          reviewScore: merged.reviewScore,
          track: levelType,
          assignedBy: "المسمّع",
        });
        const planMsg = advance.newPlanTitle
          ? ` — انتقل إلى ${advance.newPlanTitle}`
          : advance.closedPlanTitle
            ? ` — أُنجزت ${advance.closedPlanTitle}`
            : "";
        notifyTeacherSard(item.halaqaId, `الطالب ${studentName} اجتاز بنسبة ${merged.percent}% — المستوى ${newLevel}${planMsg}`);
        toast.success(`اجتاز بنسبة ${merged.percent}% — المستوى ${newLevel}${planMsg}`);
      } catch {
        toast.success(`اجتاز بنسبة ${merged.percent}%`);
      }
    } else {
      updateSardItem(item.id, {
        status: "final_failed", finalPercent: merged.percent, phase: "review_only",
        reviewErrors, reviewWarnings,
      });
      notifyTeacherTransfer(item.studentId, item.halaqaId, item.week, studentName, `رسب نهائياً في المراجعة (${merged.percent}%)`);
      toast.error(`رسب نهائياً (${merged.percent}%) — نقل للإدارة`);
    }
    onDone();
  };

  return (
    <div className="glass-card rounded-2xl p-6 space-y-6">
      <StudentHeader
        studentName={studentName} halaqaName={halaqaName} week={item.week}
        level={level} levelType={levelType}
        extra={`مراجعة فقط · ${segmentCount} مقاطع`}
        badge="مراجعة (الحفظ مثبت)"
      />

      <div className="p-4 rounded-xl border border-success/40 bg-success/10 flex items-center justify-between">
        <div className="flex items-center gap-2 text-success font-bold">
          <Lock className="w-4 h-4" /> درجة الحفظ المثبتة
        </div>
        <div className="text-2xl font-bold gold-text">{lockedHifz} / {settings.hifz_max_score}</div>
      </div>

      <ReviewPanel
        settings={settings} segmentCount={segmentCount}
        reviewScore={review.score} reviewFailed={review.failed}
        segments={reviewSegments} onChange={setReviewSegments}
      />

      <ResultSummary
        percent={merged.percent} totalScore={merged.totalScore} maxTotal={merged.maxTotal}
        passPercent={settings.pass_percent} passed={merged.passed} failed={merged.failed}
        hint={review.failed
          ? "رسوب في مقطع — إعادة المراجعة بعد يومين."
          : !merged.passed
            ? "النسبة النهائية دون الحد — نقل للإدارة."
            : undefined}
      />

      <button type="button" onClick={() => void submit()}
        className="w-full py-4 rounded-xl gold-gradient text-primary-foreground font-bold text-lg hover:scale-[1.01] transition-transform gold-glow">
        إرسال تقييم المراجعة
      </button>
    </div>
  );
}

function StudentHeader({
  studentName, halaqaName, week, level, levelType, attempt, extra, badge,
}: {
  studentName: string; halaqaName: string; week: number; level: string;
  levelType: "gold" | "silver"; attempt?: number; extra?: string; badge?: string;
}) {
  return (
    <div className="flex items-start justify-between flex-wrap gap-3">
      <div>
        <h2 className="display text-2xl gold-text">{studentName}</h2>
        <p className="text-sm text-muted-foreground">{halaqaName} · {weekLabel(week)}</p>
        {extra && <p className="text-xs text-muted-foreground mt-1">{extra}</p>}
        {badge && <p className="text-xs text-primary font-medium mt-1">{badge}</p>}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-3 py-1.5 rounded-lg bg-secondary text-sm flex items-center gap-2">
          <Award className="w-4 h-4 text-primary" /> المستوى {level}
        </span>
        <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${levelType === "gold" ? "gold-gradient text-primary-foreground" : "bg-muted text-foreground"}`}>
          {levelType === "gold" ? "ذهبي" : "فضي"}
        </span>
        {attempt != null && attempt > 1 && (
          <span className="px-3 py-1.5 rounded-lg bg-warning/20 text-warning text-sm font-bold">
            محاولة {attempt}
          </span>
        )}
      </div>
    </div>
  );
}

function HifzPanel({
  settings, hifzErrors, hifzWarnings, hifzScore, hifzFailed, onErrors, onWarnings,
}: {
  settings: EvaluationSettings;
  hifzErrors: number; hifzWarnings: number; hifzScore: number; hifzFailed: boolean;
  onErrors: (n: number) => void; onWarnings: (n: number) => void;
}) {
  return (
    <div className="p-5 rounded-2xl bg-secondary/30 border border-border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold">
          اختبار الحفظ
          <span className="text-xs text-muted-foreground mr-2">
            (خطأ −{settings.error_deduction} · تنبيه −{settings.warning_deduction} · رسوب عند {settings.hifz_max_errors} أخطاء)
          </span>
        </h3>
        <div className={`text-2xl font-bold ${hifzFailed ? "text-destructive" : "gold-text"}`}>
          {hifzScore} / {settings.hifz_max_score}
        </div>
      </div>
      <div className="flex justify-center gap-12">
        <Counter label="أخطاء" value={hifzErrors}
          onDec={() => onErrors(Math.max(0, hifzErrors - 1))}
          onInc={() => onErrors(hifzErrors + 1)} failed={hifzFailed} />
        <Counter label="تنبيهات" value={hifzWarnings}
          onDec={() => onWarnings(Math.max(0, hifzWarnings - 1))}
          onInc={() => onWarnings(hifzWarnings + 1)} max={settings.hifz_max_warnings} />
      </div>
      {hifzFailed && (
        <p className="text-center text-sm text-destructive mt-3 font-bold">
          رسوب في الحفظ — {settings.hifz_max_errors} أخطاء
        </p>
      )}
    </div>
  );
}

function ReviewPanel({
  settings, segmentCount, reviewScore, reviewFailed, segments, onChange,
}: {
  settings: EvaluationSettings; segmentCount: number;
  reviewScore: number; reviewFailed: boolean;
  segments: SegmentTally[]; onChange: (s: SegmentTally[]) => void;
}) {
  return (
    <div className="p-5 rounded-2xl bg-secondary/30 border border-border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold">
          اختبار المراجعة
          <span className="text-xs text-muted-foreground mr-2">
            ({segmentCount} مقاطع · خطأ −{settings.review_error_deduction} · رسوب عند {settings.review_max_errors_per_segment}/مقطع)
          </span>
        </h3>
        <div className={`text-2xl font-bold ${reviewFailed ? "text-destructive" : "gold-text"}`}>
          {reviewScore} / {settings.review_max_score}
        </div>
      </div>
      <ReviewSegmentsEditor segments={segments} settings={settings} onChange={onChange} />
    </div>
  );
}
