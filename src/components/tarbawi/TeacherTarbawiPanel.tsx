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
  computeTarbawiStats,
  getHalaqaPlanSpan,
  getTarbawiPlan,
  getTarbawiSettings,
  newTarbawiItem,
  paragraphTypeLabel,
  saveTarbawiPlan,
  submitTarbawiPlan,
  type TarbawiHalaqaPlan,
  type TarbawiPlanItem,
} from "@/lib/tarbawi-program";
import { getSessionName } from "@/lib/session-role";
import { ClipboardList, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

  const [plan, setPlan] = useState<TarbawiHalaqaPlan>(() => getTarbawiPlan(semesterId, halaqaId));
  const [busy, setBusy] = useState(false);

  const refreshPlan = () => setPlan(getTarbawiPlan(semesterId, halaqaId));

  const isApproved = plan.status === "approved";
  const isSubmitted = plan.status === "submitted";
  const isDraft = plan.status === "draft" || plan.status === "rejected";
  const canEditPlan = isDraft && !readOnly;
  const canExecute = isApproved && !readOnly;

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
    persist([...plan.items, newTarbawiItem(weekNum)]);
  };

  const removeItem = (id: string) => {
    persist(plan.items.filter((i) => i.id !== id));
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
              {isDraft && "مرحلة التخطيط — نوع الفقرة + الموضوع + الأسبوع فقط"}
              {isApproved && "مرحلة التنفيذ — سجّل التنفيذ والمستفيدين"}
              {plan.status === "rejected" && (
                <span className="text-destructive block mt-1">مرفوض: {plan.rejectionNote}</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-center">
            <StatPill label="تنفيذ الأسبوع" value={`${stats.pct}%`} />
            <StatPill label="تنفيذ الفصل" value={`${semesterStats.pct}%`} />
            <StatPill label="فقرات/أسبوع مطلوبة" value={String(settings.weeklyRequiredCount)} />
          </div>
        </div>

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
          <span className="text-xs text-muted-foreground">
            مدة الخطة: {spanWeeks} {spanWeeks === semesterWeeks ? "أسبوع (كامل الفصل)" : "أسبوع"}
          </span>
        </div>

        {canEditPlan && (
          <div className="mb-4 p-3 rounded-xl bg-warning/10 border border-warning/30 text-sm">
            أكمل {settings.weeklyRequiredCount} فقرات لكل أسبوع (1–{spanWeeks}) ثم أرسل للاعتماد. التنفيذ يُفعّل بعد الموافقة.
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[640px]">
            <thead>
              <tr className="bg-primary/10 text-right">
                <th className="p-2 border border-border">نوع الفقرة</th>
                <th className="p-2 border border-border">الموضوع</th>
                {isApproved && (
                  <>
                    <th className="p-2 border border-border w-16">تنفيذ</th>
                    <th className="p-2 border border-border">المنفّذ</th>
                    <th className="p-2 border border-border w-24">المستفيدون</th>
                  </>
                )}
                {canEditPlan && <th className="p-2 border border-border w-12" />}
              </tr>
            </thead>
            <tbody>
              {(canEditPlan ? weekItems : plan.items.filter((i) => i.weekNumber <= spanWeeks))
                .filter((i) => (isApproved ? true : i.weekNumber === weekNum))
                .map((item) => (
                  <tr key={item.id} className="bg-secondary/20">
                    <td className="p-2 border border-border">
                      {canEditPlan ? (
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
                      {canEditPlan ? (
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
                    {canEditPlan && (
                      <td className="p-2 border border-border">
                        <button type="button" onClick={() => removeItem(item.id)} className="p-1 text-destructive hover:bg-destructive/10 rounded">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {canEditPlan && (
          <div className="flex flex-wrap gap-2 mt-4">
            <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1">
              <Plus className="w-4 h-4" /> فقرة — {weekLabel(weekNum)}
            </Button>
            <Button type="button" size="sm" className="gap-1 gold-gradient text-primary-foreground" disabled={busy} onClick={handleSubmit}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              إرسال الخطة للاعتماد
            </Button>
          </div>
        )}

        {isApproved && (
          <p className="text-xs text-muted-foreground mt-3">
            الجدول يعرض كل فقرات الفصل — نفّذ أسبوعياً وحدّد المنفّذ وعدد المستفيدين
          </p>
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
