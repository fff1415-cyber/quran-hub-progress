import { useMemo, useState } from "react";
import type { AcademicCalendar } from "@/lib/academic-context";
import { getSelectableWeeks, formatWeekOptionLabel } from "@/lib/academic-context";
import { weekLabel } from "@/lib/arabic-numbers";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  clearItemWeekAssignments,
  computeTarbawiStats,
  distributeTarbawiItems,
  getHalaqaPlanSpan,
  getTarbawiPlan,
  getTarbawiSettings,
  isPlanDistributed,
  newTarbawiItem,
  paragraphTypeLabel,
  PLAN_SPAN_OPTIONS,
  requiredTarbawiItemCount,
  saveTarbawiPlan,
  submitTarbawiPlan,
  validateTarbawiPlanEntry,
  type TarbawiHalaqaPlan,
  type TarbawiPlanItem,
} from "@/lib/tarbawi-program";
import { getSessionName } from "@/lib/session-role";
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
  onWeekChange,
  readOnly = false,
}: Props) {
  const semesterId = calendar.semester?.id ?? "default";
  const semesterWeeks = calendar.semester?.weeks_count ?? calendar.weeks.length;
  const settings = useMemo(() => getTarbawiSettings(semesterId), [semesterId]);
  const spanWeeks = getHalaqaPlanSpan(settings, halaqaId, semesterWeeks);
  const spanSetting = settings.halaqaSpans[halaqaId] ?? "full";
  const spanLabel = PLAN_SPAN_OPTIONS.find((o) => o.value === spanSetting)?.label
    ?? `${spanWeeks} أسبوع`;

  const [plan, setPlan] = useState<TarbawiHalaqaPlan>(() => getTarbawiPlan(semesterId, halaqaId));
  const [busy, setBusy] = useState(false);

  const refreshPlan = () => setPlan(getTarbawiPlan(semesterId, halaqaId));

  const isApproved = plan.status === "approved";
  const isSubmitted = plan.status === "submitted";
  const isDraft = plan.status === "draft" || plan.status === "rejected";
  const canEditPlan = isDraft && !readOnly;
  const canExecute = isApproved && !readOnly;
  const distributed = isPlanDistributed(plan);
  const requiredCount = requiredTarbawiItemCount(spanWeeks, settings.weeklyRequiredCount);
  const entryItems = plan.items.slice(0, requiredCount);

  const stats = useMemo(
    () => computeTarbawiStats(plan, spanWeeks, weekNum),
    [plan, spanWeeks, weekNum],
  );
  const semesterStats = useMemo(
    () => computeTarbawiStats(plan, spanWeeks),
    [plan, spanWeeks],
  );

  const weekItems = plan.items.filter((i) => i.weekNumber === weekNum);
  const selectableWeeks = getSelectableWeeks(calendar).filter((w) => w.week_number <= spanWeeks);

  const persist = (items: TarbawiPlanItem[]) => {
    const next = saveTarbawiPlan({ ...plan, items });
    setPlan(next);
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

  if (isSubmitted) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center space-y-3">
        <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
        <h3 className="text-lg font-bold text-primary">الخطة بانتظار اعتماد مشرف البرامج</h3>
        <p className="text-sm text-muted-foreground">
          أُرسلت {plan.submittedAt ? new Date(plan.submittedAt).toLocaleString("ar-SA") : ""} — لا يمكن التنفيذ قبل الاعتماد
        </p>
        <Button variant="outline" size="sm" onClick={refreshPlan}>تحديث الحالة</Button>
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
              {canEditPlan && !distributed && "أضف كل الفقرات (نوع + موضوع) ثم وزّعها على الأسابيع"}
              {canEditPlan && distributed && "راجع التوزيع على الأسابيع ثم أرسل للاعتماد"}
              {isApproved && "مرحلة التنفيذ — سجّل التنفيذ والمستفيدين"}
              {plan.status === "rejected" && (
                <span className="text-destructive block mt-1">مرفوض: {plan.rejectionNote}</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-center">
            {isApproved && (
              <>
                <StatPill label="تنفيذ الأسبوع" value={`${stats.pct}%`} />
                <StatPill label="تنفيذ الفصل" value={`${semesterStats.pct}%`} />
              </>
            )}
            <StatPill label="مدة الخطة" value={spanLabel} />
            <StatPill label="فقرات/أسبوع" value={String(settings.weeklyRequiredCount)} />
          </div>
        </div>

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

        {isApproved && (
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="text-sm text-muted-foreground">الأسبوع:</span>
            <Select value={String(weekNum)} onValueChange={(v) => onWeekChange(Number(v))}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {selectableWeeks.map((w) => (
                  <SelectItem key={w.week_number} value={String(w.week_number)}>
                    {formatWeekOptionLabel(w)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[640px]">
            <thead>
              <tr className="bg-primary/10 text-right">
                {(distributed || isApproved) && (
                  <th className="p-2 border border-border w-24">الأسبوع</th>
                )}
                <th className="p-2 border border-border">نوع الفقرة</th>
                <th className="p-2 border border-border">الموضوع</th>
                {isApproved && (
                  <>
                    <th className="p-2 border border-border w-16">تنفيذ</th>
                    <th className="p-2 border border-border">المنفّذ</th>
                    <th className="p-2 border border-border w-24">المستفيدون</th>
                  </>
                )}
                {canEditPlan && !distributed && <th className="p-2 border border-border w-12" />}
              </tr>
            </thead>
            <tbody>
              {renderTableRows({
                plan,
                canEditPlan,
                distributed,
                isApproved,
                weekNum,
                settings,
                canExecute,
                entryItems,
                weekItems,
                updateItem,
                removeItem,
              })}
            </tbody>
          </table>
        </div>

        {canEditPlan && !distributed && (
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
        )}

        {canEditPlan && distributed && (
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
        )}

        {isApproved && (
          <p className="text-xs text-muted-foreground mt-3">
            نفّذ فقرات {weekLabel(weekNum)} — حدّد المنفّذ وعدد المستفيدين
          </p>
        )}
      </div>
    </div>
  );
}

function renderTableRows({
  plan,
  canEditPlan,
  distributed,
  isApproved,
  weekNum,
  settings,
  canExecute,
  entryItems,
  weekItems,
  updateItem,
  removeItem,
}: {
  plan: TarbawiHalaqaPlan;
  canEditPlan: boolean;
  distributed: boolean;
  isApproved: boolean;
  weekNum: number;
  settings: ReturnType<typeof getTarbawiSettings>;
  canExecute: boolean;
  entryItems: TarbawiPlanItem[];
  weekItems: TarbawiPlanItem[];
  updateItem: (id: string, patch: Partial<TarbawiPlanItem>) => void;
  removeItem: (id: string) => void;
}) {
  let rows: TarbawiPlanItem[];

  if (isApproved) {
    rows = weekItems;
  } else if (distributed) {
    rows = [...plan.items].sort((a, b) => a.weekNumber - b.weekNumber || 0);
  } else {
    rows = entryItems;
  }

  if (rows.length === 0) {
    return (
      <tr>
        <td
          colSpan={canEditPlan && !distributed ? 3 : isApproved ? 6 : 4}
          className="p-6 text-center text-muted-foreground border border-border"
        >
          {canEditPlan && !distributed
            ? "ابدأ بإضافة الفقرات — نوع الفقرة والموضوع فقط"
            : "لا توجد فقرات"}
        </td>
      </tr>
    );
  }

  return rows.map((item) => (
    <tr key={item.id} className="bg-secondary/20">
      {(distributed || isApproved) && (
        <td className="p-2 border border-border text-center font-medium">
          {weekLabel(item.weekNumber)}
        </td>
      )}
      <td className="p-2 border border-border">
        {canEditPlan && !distributed ? (
          <select
            className="w-full rounded-md border border-border bg-input px-2 py-1 text-sm"
            value={item.paragraphTypeId}
            onChange={(e) => updateItem(item.id, { paragraphTypeId: e.target.value })}
          >
            {settings.paragraphTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        ) : (
          paragraphTypeLabel(settings, item.paragraphTypeId)
        )}
      </td>
      <td className="p-2 border border-border">
        {canEditPlan && !distributed ? (
          <Input
            value={item.topic}
            onChange={(e) => updateItem(item.id, { topic: e.target.value })}
            placeholder="موضوع البرنامج"
            className="h-8"
          />
        ) : (
          item.topic
        )}
      </td>
      {isApproved && (
        <>
          <td className="p-2 border border-border text-center">
            <Checkbox
              checked={item.executed}
              disabled={!canExecute}
              onCheckedChange={(v) => updateItem(item.id, { executed: !!v })}
            />
          </td>
          <td className="p-2 border border-border">
            <Input
              value={item.executor}
              disabled={!canExecute}
              onChange={(e) => updateItem(item.id, { executor: e.target.value })}
              placeholder={getSessionName("")}
              className="h-8"
            />
          </td>
          <td className="p-2 border border-border">
            <Input
              type="number"
              min={0}
              value={item.beneficiaries || ""}
              disabled={!canExecute}
              onChange={(e) => updateItem(item.id, { beneficiaries: Number(e.target.value) || 0 })}
              className="h-8"
            />
          </td>
        </>
      )}
      {canEditPlan && !distributed && (
        <td className="p-2 border border-border">
          <button
            type="button"
            onClick={() => removeItem(item.id)}
            className="p-1 text-destructive hover:bg-destructive/10 rounded"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </td>
      )}
    </tr>
  ));
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 min-w-[100px]">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-bold gold-text">{value}</div>
    </div>
  );
}
