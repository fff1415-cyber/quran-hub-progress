import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  loadHalaqat, loadStudents, loadSardQueue, updateSardItem,
  pushSardHistory, pushNotification,
  type SardQueueItem,
} from "@/lib/mock-data";
import { weekLabel } from "@/lib/arabic-numbers";
import { useEvaluationSettings } from "@/contexts/EvaluationSettingsContext";
import {
  computeEvaluation,
  emptyReviewSegments,
  maxAllowedMinutes,
  normalizeReviewSegments,
  parseMemorizedJuzCount,
  reviewSegmentCount,
} from "@/lib/evaluation-calculator";
import type { SegmentTally } from "@/lib/evaluation-types";
import { AppHeader } from "@/components/AppHeader";
import { Mic, Minus, Plus, ArrowRight, Award, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Toaster, toast } from "sonner";

export const Route = createFileRoute("/musammi")({ component: MusammiPage });

function MusammiPage() {
  const [queue, setQueue] = useState<SardQueueItem[]>(() => loadSardQueue());
  const [activeId, setActiveId] = useState<string | null>(null);
  const halaqat = loadHalaqat();
  const students = loadStudents();

  const refresh = () => setQueue(loadSardQueue());

  const visible = useMemo(() => {
    const now = Date.now();
    return queue.filter((q) => {
      if (q.status === "pending" || q.status === "approved_third") return true;
      if (q.status === "scheduled" && q.scheduledAt && new Date(q.scheduledAt).getTime() <= now) return true;
      return false;
    });
  }, [queue]);

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
              return (
                <button key={q.id} onClick={() => setActiveId(q.id)}
                  className="glass-card rounded-2xl p-5 text-right hover:gold-glow hover:border-primary transition-all">
                  <div className="flex items-start justify-between mb-2">
                    <div className="font-bold text-lg">{s.name}</div>
                    {q.attempt > 1 && (
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${q.attempt === 3 ? "bg-warning/20 text-warning" : "bg-secondary text-muted-foreground"}`}>
                        محاولة {q.attempt}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{h.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">{weekLabel(q.week)} · مستوى {s.level}</div>
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

function SardEvaluator({
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
      item.reviewErrors?.map((errors, i) => ({
        errors,
        warnings: item.reviewWarnings?.[i] ?? 0,
      })),
      segmentCount,
    ),
  );

  useEffect(() => {
    setReviewSegments((prev) => {
      const normalized = normalizeReviewSegments(prev, segmentCount);
      return normalized.length === prev.length ? prev : normalized;
    });
  }, [segmentCount]);

  const result = computeEvaluation(hifzErrors, hifzWarnings, reviewSegments, settings);
  const { hifzScore, reviewScore, totalScore, maxTotal, percent, hifzFailed, reviewFailed, passed, failed } = result;

  const setSeg = (idx: number, patch: Partial<SegmentTally>) => {
    setReviewSegments((segs) => segs.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const resetReview = () => emptyReviewSegments(segmentCount);

  const submit = async () => {
    const reviewErrors = reviewSegments.map((s) => s.errors);
    const reviewWarnings = reviewSegments.map((s) => s.warnings);

    pushSardHistory({
      id: `sh-${Date.now()}`,
      studentId: item.studentId,
      halaqaId: item.halaqaId,
      week: item.week,
      attempt: item.attempt,
      result: passed ? "passed" : "failed",
      percent,
      hifzErrors,
      hifzWarnings,
      reviewErrors,
      reviewWarnings,
      at: new Date().toISOString(),
    });

    if (passed) {
      updateSardItem(item.id, { status: "passed", finalPercent: percent });
      try {
        const { loadStudents, saveStudents } = await import("@/lib/mock-data");
        const all = loadStudents();
        const idx = all.findIndex((s) => s.id === item.studentId);
        let newLevel = level;
        if (idx >= 0) {
          const n = parseInt(level, 10);
          newLevel = isNaN(n) ? level : String(n + 1);
          all[idx] = { ...all[idx], level: newLevel };
          saveStudents(all);
          void import("@/lib/cloud-sync").then((m) => m.patchStudent(item.studentId, { level: newLevel }));
        }
        pushNotification({ message: `الطالب ${studentName} اجتاز السرد بنسبة ${percent}% وانتقل إلى المستوى ${newLevel}`, type: "sard" });
        toast.success(`اجتاز بنسبة ${percent}% — انتقل للمستوى ${newLevel}`);
      } catch {
        pushNotification({ message: `الطالب ${studentName} اجتاز السرد بنسبة ${percent}%`, type: "sard" });
        toast.success(`الطالب اجتاز بنسبة ${percent}%`);
      }
    } else if (item.attempt === 1) {
      const next = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
      updateSardItem(item.id, {
        status: "scheduled", attempt: 2,
        scheduledAt: next, hifzErrors: 0, hifzWarnings: 0,
        reviewErrors: resetReview().map((s) => s.errors),
        reviewWarnings: resetReview().map((s) => s.warnings),
      });
      pushNotification({ message: `الطالب ${studentName} رسب في المحاولة الأولى — إعادة بعد يومين`, type: "sard" });
      toast.error("راسب — تمت جدولة إعادة السرد بعد يومين");
    } else if (item.attempt === 2) {
      updateSardItem(item.id, {
        status: "awaiting_supervisor", attempt: 2,
        hifzErrors, hifzWarnings, reviewErrors, reviewWarnings, finalPercent: percent,
      });
      pushNotification({ message: `الطالب ${studentName} يحتاج موافقة المشرف لإعادة السرد`, type: "sard" });
      toast.warning("ينتقل الطالب للإشراف التعليمي للموافقة على محاولة ثالثة");
    } else {
      updateSardItem(item.id, {
        status: "final_failed", finalPercent: percent,
        hifzErrors, hifzWarnings, reviewErrors, reviewWarnings,
      });
      pushNotification({ message: `الطالب ${studentName} رسب في المحاولة الثالثة — نقل إلى لوحة المدير`, type: "sard" });
      toast.error("رسوب نهائي — نقل إلى لوحة المدير");
    }
    onDone();
  };

  return (
    <div className="glass-card rounded-2xl p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="display text-2xl gold-text">{studentName}</h2>
          <p className="text-sm text-muted-foreground">{halaqaName} · {weekLabel(item.week)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            حفظ ≈ {juzCount} جزء · {segmentCount} مقاطع مراجعة · حد الوقت ≈ {maxMinutes} د
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-3 py-1.5 rounded-lg bg-secondary text-sm flex items-center gap-2">
            <Award className="w-4 h-4 text-primary" />
            المستوى {level}
          </span>
          <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${levelType === "gold" ? "gold-gradient text-primary-foreground" : "bg-muted text-foreground"}`}>
            {levelType === "gold" ? "ذهبي" : "فضي"}
          </span>
          {item.attempt > 1 && (
            <span className="px-3 py-1.5 rounded-lg bg-warning/20 text-warning text-sm font-bold">
              محاولة {item.attempt}
            </span>
          )}
        </div>
      </div>

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
          <Counter
            label="أخطاء"
            value={hifzErrors}
            onDec={() => setHifzErrors(Math.max(0, hifzErrors - 1))}
            onInc={() => setHifzErrors(hifzErrors + 1)}
            failed={hifzFailed}
          />
          <Counter
            label="تنبيهات"
            value={hifzWarnings}
            onDec={() => setHifzWarnings(Math.max(0, hifzWarnings - 1))}
            onInc={() => setHifzWarnings(hifzWarnings + 1)}
            max={settings.hifz_max_warnings}
          />
        </div>
        {hifzFailed && (
          <p className="text-center text-sm text-destructive mt-3 font-bold">
            رسوب في الحفظ — {settings.hifz_max_errors} أخطاء
          </p>
        )}
      </div>

      <div className="p-5 rounded-2xl bg-secondary/30 border border-border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold">
            اختبار المراجعة
            <span className="text-xs text-muted-foreground mr-2">
              ({segmentCount} مقاطع · خطأ −{settings.review_error_deduction} · رسوب عند {settings.review_max_errors_per_segment} أخطاء/مقطع)
            </span>
          </h3>
          <div className={`text-2xl font-bold ${reviewFailed ? "text-destructive" : "gold-text"}`}>
            {reviewScore} / {settings.review_max_score}
          </div>
        </div>
        <div className="space-y-4">
          {reviewSegments.map((seg, i) => {
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
      </div>

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
          مجموع: {totalScore} / {maxTotal} · الاجتياز ≥ {settings.pass_percent}%
        </div>
        {failed && item.attempt === 1 && <p className="text-sm text-warning mt-2">سيُجدوَل اختبار ثانٍ بعد يومين تلقائياً.</p>}
        {failed && item.attempt === 2 && <p className="text-sm text-warning mt-2">سينتقل الطالب للإشراف التعليمي للموافقة على محاولة ثالثة.</p>}
        {failed && item.attempt === 3 && <p className="text-sm text-destructive mt-2">رسوب نهائي — سينتقل لمتابعة المدير.</p>}
      </div>

      <button
        type="button"
        onClick={submit}
        className="w-full py-4 rounded-xl gold-gradient text-primary-foreground font-bold text-lg hover:scale-[1.01] transition-transform gold-glow"
      >
        إرسال التقييم النهائي
      </button>
    </div>
  );
}
