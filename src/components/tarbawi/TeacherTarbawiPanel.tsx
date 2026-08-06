import { useCallback, useEffect, useState } from "react";
import type { AcademicCalendar } from "@/lib/academic-context";
import { getToken } from "@/lib/cloud-sync";
import { secureListAppState } from "@/lib/secure-data.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clearItemWeekAssignments,
  computeTarbawiStats,
  distributeTarbawiItems,
  formatPlanSpanLabel,
  getHalaqaPlanSpan,
  getTarbawiPlan,
  getTarbawiSettings,
  isPlanDistributed,
  loadTarbawiStore,
  mergeTarbawiStores,
  newTarbawiItem,
  paragraphTypeLabel,
  requiredTarbawiItemCount,
  saveTarbawiPlan,
  saveTarbawiStore,
  submitTarbawiContentChange,
  submitTarbawiPlan,
  validateTarbawiPlanEntry,
  type TarbawiHalaqaPlan,
  type TarbawiPlanItem,
  type TarbawiSettings,
  type TarbawiStore,
} from "@/lib/tarbawi-program";
import { TeacherTarbawiDraftWeekBoard, TeacherTarbawiWeekBoard } from "@/components/tarbawi/TeacherTarbawiWeekBoard";
import { ClipboardList, LayoutGrid, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Props = {
  halaqaId: number;
  halaqaName: string;
  calendar: AcademicCalendar;
  weekNum: number;
  onWeekChange: (n: number) => void;
  readOnly?: boolean;
};

export function TeacherTarbawiPanel({
  halaqaId,
  halaqaName,
  calendar,
  weekNum,
  readOnly = false,
}: Props) {
  const semesterId = calendar.semester?.id ?? "default";
  const semesterWeeks = calendar.semester?.weeks_count ?? calendar.weeks.length;
  const [settings, setSettings] = useState<TarbawiSettings>(() => getTarbawiSettings(semesterId));
  const spanWeeks = getHalaqaPlanSpan(settings, halaqaId, semesterWeeks);
  const spanSetting = settings.halaqaSpans[halaqaId] ?? "full";
  const spanLabel = formatPlanSpanLabel(spanSetting, spanWeeks, semesterWeeks);
  const supervisorConfigured = spanSetting !== "full" || settings.weeklyRequiredCount !== 2
    || Object.keys(settings.halaqaSpans).length > 0;

  const [plan, setPlan] = useState<TarbawiHalaqaPlan>(() => getTarbawiPlan(semesterId, halaqaId));
  const [busy, setBusy] = useState(false);
  const [contentDraftItems, setContentDraftItems] = useState<TarbawiPlanItem[] | null>(null);

  const refreshFromCloud = useCallback(async () => {
    const prevStatus = getTarbawiPlan(semesterId, halaqaId).status;
    const hadContentPending = !!getTarbawiPlan(semesterId, halaqaId).contentChangeRequest;
    const token = getToken();
    if (token) {
      try {
        const rows = await secureListAppState({ data: { token } });
        const row = rows.find((r) => r.key === "tarbawi_program");
        if (row?.value) {
          sessionStorage.setItem("qs_syncing", "1");
          const { merged } = mergeTarbawiStores(loadTarbawiStore(), row.value as TarbawiStore);
          saveTarbawiStore(merged);
          sessionStorage.removeItem("qs_syncing");
        }
      } catch {
        sessionStorage.removeItem("qs_syncing");
      }
    }
    const nextPlan = getTarbawiPlan(semesterId, halaqaId);
    setSettings(getTarbawiSettings(semesterId));
    setPlan(nextPlan);
    if (prevStatus === "submitted" && nextPlan.status === "approved") {
      toast.success("تم اعتماد الخطة — يمكنك البدء بالتنفيذ");
    }
    if (hadContentPending && !nextPlan.contentChangeRequest) {
      setContentDraftItems(null);
      toast.success("تم اعتماد تعديل الفقرات");
    }
    return nextPlan;
  }, [semesterId, halaqaId]);

  useEffect(() => {
    void refreshFromCloud();
  }, [refreshFromCloud]);

  useEffect(() => {
    if (plan.status !== "submitted" && !plan.contentChangeRequest) return;
    const id = window.setInterval(() => { void refreshFromCloud(); }, 12000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshFromCloud();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [plan.status, plan.contentChangeRequest, refreshFromCloud]);

  const isApproved = plan.status === "approved";
  const isSubmitted = plan.status === "submitted";
  const isDraft = plan.status === "draft" || plan.status === "rejected";
  const canEditPlan = isDraft && !readOnly;
  const canExecute = isApproved && !readOnly;
  const contentChangePending = !!plan.contentChangeRequest;
  const distributed = isPlanDistributed(plan);
  const requiredCount = requiredTarbawiItemCount(spanWeeks, settings.weeklyRequiredCount);
  const entryItems = plan.items.slice(0, requiredCount);

  const semesterStats = computeTarbawiStats(plan, spanWeeks);
  const weekStats = semesterStats.byWeek;

  const displayPlan = contentDraftItems
    ? { ...plan, items: contentDraftItems }
    : plan;

  const hasContentDraft = contentDraftItems !== null
    && JSON.stringify(contentDraftItems.map(({ paragraphTypeId, topic, id }) => ({ id, paragraphTypeId, topic })))
      !== JSON.stringify(plan.items.map(({ paragraphTypeId, topic, id }) => ({ id, paragraphTypeId, topic })));

  const persist = (items: TarbawiPlanItem[]) => {
    const next = saveTarbawiPlan({ ...plan, items });
    setPlan(next);
  };

  const handleBoardPlanChange = (updated: TarbawiHalaqaPlan) => {
    setPlan(updated);
    setContentDraftItems((prev) => {
      if (!prev) return null;
      return prev.map((item) => {
        const u = updated.items.find((i) => i.id === item.id);
        return u ? { ...item, weekNumber: u.weekNumber, executed: u.executed, executor: u.executor, beneficiaries: u.beneficiaries } : item;
      });
    });
  };

  const updateItem = (id: string, patch: Partial<TarbawiPlanItem>) => {
    persist(plan.items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  const addItem = () => {
    if (entryItems.length >= requiredCount) {
      toast.info(`اكتمل العدد المطلوب (${requiredCount} فقرة)`);
      return;
    }
    persist([...plan.items, newTarbawiItem()]);
  };

  const removeItem = (id: string) => {
    persist(plan.items.filter((i) => i.id !== id));
  };

  const handleDistribute = () => {
    const err = validateTarbawiPlanEntry(plan, settings, semesterWeeks);
    if (err) {
      toast.error(err);
      return;
    }
    const items = distributeTarbawiItems(plan.items, spanWeeks, settings.weeklyRequiredCount);
    setPlan(saveTarbawiPlan({ ...plan, items }));
    toast.success("تم توزيع الفقرات على الأسابيع — راجع ثم أرسل للاعتماد");
  };

  const handleEditList = () => {
    setPlan(saveTarbawiPlan({ ...plan, items: clearItemWeekAssignments(plan.items) }));
    toast.info("عدّل الفقرات ثم أعد التوزيع");
  };

  const handleSubmit = () => {
    setBusy(true);
    try {
      const next = submitTarbawiPlan(plan, settings, semesterWeeks, halaqaName);
      setPlan(next);
      toast.success("تم إرسال الخطة لمشرف البرامج");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر الإرسال");
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitContentChange = () => {
    if (!contentDraftItems) return;
    setBusy(true);
    try {
      const next = submitTarbawiContentChange(plan, contentDraftItems, halaqaName);
      setPlan(next);
      setContentDraftItems(null);
      toast.success("أُرسلت التعديلات لمشرف البرامج");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر الإرسال");
    } finally {
      setBusy(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center space-y-3">
        <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
        <h3 className="text-lg font-bold text-primary">الخطة بانتظار اعتماد مشرف البرامج</h3>
        <p className="text-sm text-muted-foreground">
          أُرسلت {plan.submittedAt ? new Date(plan.submittedAt).toLocaleString("ar-SA") : ""} — لا يمكن التنفيذ قبل الاعتماد
        </p>
        <Button variant="outline" size="sm" onClick={() => void refreshFromCloud()}>
          تحديث الحالة
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-primary flex items-center gap-2">
              <ClipboardList className="w-5 h-5" /> البرنامج التربوي
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {supervisorConfigured && (
                <span className="block text-primary/80 mb-0.5">
                  إعدادات مشرف البرامج: {spanLabel} · {settings.weeklyRequiredCount} فقرات/أسبوع
                </span>
              )}
              {canEditPlan && !distributed && "أضف كل الفقرات (نوع + موضوع) ثم وزّعها على الأسابيع"}
              {canEditPlan && distributed && "راجع التوزيع على الأسابيع (اسحب لنقل الفقرات) ثم أرسل للاعتماد"}
              {isApproved && !contentChangePending && "مرحلة التنفيذ — اسحب الصف بين الأسابيع، أو عدّل النوع/الموضوع عبر أيقونة القلم"}
              {isApproved && contentChangePending && "تعديل الفقرات بانتظار اعتماد مشرف البرامج — نقل الأسبوع بالسحب متاح"}
              {plan.status === "rejected" && (
                <span className="text-destructive block mt-1">مرفوض: {plan.rejectionNote}</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-center">
            {isApproved && (
              <StatPill label="تنفيذ الفصل" value={`${semesterStats.pct}%`} />
            )}
            <StatPill label="مدة الخطة" value={spanLabel} />
            <StatPill label="فقرات/أسبوع" value={String(settings.weeklyRequiredCount)} />
          </div>
        </div>

        {contentChangePending && (
          <div className="mb-4 p-3 rounded-xl bg-warning/10 border border-warning/30 text-sm flex flex-wrap items-center justify-between gap-2">
            <span>تعديل الفقرات (نوع/موضوع) بانتظار اعتماد المشرف</span>
            <Button variant="outline" size="sm" onClick={() => void refreshFromCloud()}>
              تحديث
            </Button>
          </div>
        )}

        {hasContentDraft && !contentChangePending && (
          <div className="mb-4 p-3 rounded-xl bg-primary/10 border border-primary/30 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm">لديك تعديلات على الفقرات لم تُرسل بعد</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setContentDraftItems(null)}>
                تجاهل
              </Button>
              <Button size="sm" className="gap-1" disabled={busy} onClick={handleSubmitContentChange}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                إرسال التعديلات للاعتماد
              </Button>
            </div>
          </div>
        )}

        {canEditPlan && (
          <div className="mb-4 p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                <strong className="text-primary">مدة الخطة:</strong>{" "}
                {spanLabel} ({spanWeeks} {spanWeeks === semesterWeeks ? "أسبوع — كامل الفصل" : "أسابيع"})
              </div>
              <div className="text-sm font-bold gold-text">
                {entryItems.length} / {requiredCount} فقرة
              </div>
            </div>
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.min(100, (entryItems.length / requiredCount) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {settings.weeklyRequiredCount} فقرة × {spanWeeks} {spanWeeks === 1 ? "أسبوع" : "أسابيع"} = {requiredCount} فقرات
              {!distributed && " — بدون تحديد أسبوع أثناء الإدخال"}
            </p>
          </div>
        )}

        {canEditPlan && !distributed && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[480px]">
                <thead>
                  <tr className="bg-primary/10 text-right">
                    <th className="p-2 border border-border">نوع الفقرة</th>
                    <th className="p-2 border border-border">الموضوع</th>
                    <th className="p-2 border border-border w-12" />
                  </tr>
                </thead>
                <tbody>
                  {entryItems.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-6 text-center text-muted-foreground border border-border">
                        ابدأ بإضافة الفقرات — نوع الفقرة والموضوع فقط
                      </td>
                    </tr>
                  ) : (
                    entryItems.map((item) => (
                      <tr key={item.id} className="bg-secondary/20">
                        <td className="p-2 border border-border">
                          <select
                            className="w-full rounded-md border border-border bg-input px-2 py-1 text-sm"
                            value={item.paragraphTypeId}
                            onChange={(e) => updateItem(item.id, { paragraphTypeId: e.target.value })}
                          >
                            {settings.paragraphTypes.map((t) => (
                              <option key={t.id} value={t.id}>{t.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2 border border-border">
                          <Input
                            value={item.topic}
                            onChange={(e) => updateItem(item.id, { topic: e.target.value })}
                            placeholder="موضوع البرنامج"
                            className="h-8"
                          />
                        </td>
                        <td className="p-2 border border-border">
                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            className="p-1 text-destructive hover:bg-destructive/10 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addItem}
                disabled={entryItems.length >= requiredCount}
                className="gap-1"
              >
                <Plus className="w-4 h-4" /> إضافة فقرة
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-1"
                disabled={entryItems.length < requiredCount}
                onClick={handleDistribute}
              >
                <LayoutGrid className="w-4 h-4" />
                توزيع على الأسابيع
              </Button>
            </div>
          </>
        )}

        {canEditPlan && distributed && (
          <>
            <TeacherTarbawiDraftWeekBoard
              plan={plan}
              settings={settings}
              calendar={calendar}
              spanWeeks={spanWeeks}
              currentWeekNum={weekNum}
              canEditPlan={canEditPlan}
              onPlanChange={(p) => setPlan(p)}
            />
            <div className="flex flex-wrap gap-2 mt-4">
              <Button type="button" variant="outline" size="sm" onClick={handleEditList}>
                تعديل القائمة
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-1 gold-gradient text-primary-foreground"
                disabled={busy}
                onClick={handleSubmit}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                إرسال الخطة للاعتماد
              </Button>
            </div>
          </>
        )}

        {isApproved && (
          <TeacherTarbawiWeekBoard
            plan={displayPlan}
            settings={settings}
            calendar={calendar}
            spanWeeks={spanWeeks}
            currentWeekNum={weekNum}
            weekStats={weekStats}
            canExecute={canExecute}
            canReorder={!readOnly}
            canEditContent={!readOnly}
            contentChangePending={contentChangePending}
            onPlanChange={handleBoardPlanChange}
            onContentDraft={(items) => setContentDraftItems(items)}
          />
        )}
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 min-w-[100px]">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-bold gold-text">{value}</div>
    </div>
  );
}
