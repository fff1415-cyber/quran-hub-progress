import { useState } from "react";
import type { AcademicCalendar } from "@/lib/academic-context";
import { formatWeekOptionLabel, getSelectableWeeks } from "@/lib/academic-context";
import { weekLabel } from "@/lib/arabic-numbers";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  moveTarbawiItemToWeek,
  paragraphTypeLabel,
  saveTarbawiPlan,
  type TarbawiHalaqaPlan,
  type TarbawiPlanItem,
  type TarbawiSettings,
  type TarbawiWeekStats,
} from "@/lib/tarbawi-program";
import { getSessionName } from "@/lib/session-role";
import { cn } from "@/lib/utils";
import { GripVertical, Pencil, X } from "lucide-react";
import { toast } from "sonner";

type EditTarget = {
  item: TarbawiPlanItem;
  paragraphTypeId: string;
  topic: string;
};

type Props = {
  plan: TarbawiHalaqaPlan;
  settings: TarbawiSettings;
  calendar: AcademicCalendar;
  spanWeeks: number;
  currentWeekNum: number;
  weekStats: TarbawiWeekStats[];
  canExecute: boolean;
  canReorder: boolean;
  canEditContent: boolean;
  contentChangePending: boolean;
  onPlanChange: (plan: TarbawiHalaqaPlan) => void;
  onContentDraft: (items: TarbawiPlanItem[]) => void;
};

export function TeacherTarbawiWeekBoard({
  plan,
  settings,
  calendar,
  spanWeeks,
  currentWeekNum,
  weekStats,
  canExecute,
  canReorder,
  canEditContent,
  contentChangePending,
  onPlanChange,
  onContentDraft,
}: Props) {
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);

  const selectableWeeks = getSelectableWeeks(calendar).filter((w) => w.week_number <= spanWeeks);

  const handleDrop = (weekNumber: number) => {
    if (!dragItemId || !canReorder || !reorderMode) return;
    onPlanChange(moveTarbawiItemToWeek(plan, dragItemId, weekNumber));
    setDragItemId(null);
    toast.success(`نُقلت الفقرة إلى ${weekLabel(weekNumber)}`);
  };

  const openContentEdit = (item: TarbawiPlanItem) => {
    setEditTarget({
      item,
      paragraphTypeId: item.paragraphTypeId,
      topic: item.topic,
    });
  };

  const saveContentEdit = () => {
    if (!editTarget) return;
    if (!editTarget.topic.trim()) {
      toast.error("الموضوع مطلوب");
      return;
    }
    const nextItems = plan.items.map((i) =>
      i.id === editTarget.item.id
        ? { ...i, paragraphTypeId: editTarget.paragraphTypeId, topic: editTarget.topic.trim() }
        : i,
    );
    onContentDraft(nextItems);
    setEditTarget(null);
    toast.info("حُفظ التعديل محلياً — أرسل للاعتماد لتطبيقه");
  };

  const updateItemExecution = (id: string, patch: Partial<TarbawiPlanItem>) => {
    onPlanChange(saveTarbawiPlan({
      ...plan,
      items: plan.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {canReorder && (
          <Button
            type="button"
            size="sm"
            variant={reorderMode ? "default" : "outline"}
            className="gap-1"
            onClick={() => setReorderMode((v) => !v)}
          >
            <GripVertical className="w-4 h-4" />
            {reorderMode ? "إيقاف تعديل الترتيب" : "تعديل الترتيب (سحب)"}
          </Button>
        )}
        {reorderMode && (
          <p className="text-xs text-muted-foreground">اسحب الفقرة إلى عمود الأسبوع المطلوب</p>
        )}
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3 min-w-max">
          {selectableWeeks.map((w) => {
            const weekNum = w.week_number;
            const isCurrent = weekNum === currentWeekNum;
            const stats = weekStats.find((s) => s.weekNumber === weekNum);
            const items = plan.items.filter((i) => i.weekNumber === weekNum);

            return (
              <div
                key={weekNum}
                className={cn(
                  "w-[240px] shrink-0 rounded-xl border flex flex-col min-h-[280px]",
                  isCurrent
                    ? "border-primary bg-primary/15 shadow-md ring-2 ring-primary/30"
                    : "border-border bg-secondary/20",
                )}
                onDragOver={(e) => {
                  if (reorderMode && canReorder) e.preventDefault();
                }}
                onDrop={() => handleDrop(weekNum)}
              >
                <div
                  className={cn(
                    "px-3 py-2 border-b rounded-t-xl",
                    isCurrent ? "bg-primary/25 border-primary/30" : "bg-secondary/40 border-border",
                  )}
                >
                  <div className="font-bold text-sm">{formatWeekOptionLabel(w)}</div>
                  {isCurrent && (
                    <div className="text-[10px] text-primary font-semibold mt-0.5">الأسبوع الحالي</div>
                  )}
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {stats?.executed ?? 0}/{stats?.planned ?? 0} منفّذ · {stats?.pct ?? 0}%
                  </div>
                </div>

                <div className="p-2 space-y-2 flex-1">
                  {items.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">لا فقرات</p>
                  ) : (
                    items.map((item) => (
                      <div
                        key={item.id}
                        draggable={reorderMode && canReorder}
                        onDragStart={() => setDragItemId(item.id)}
                        onDragEnd={() => setDragItemId(null)}
                        className={cn(
                          "relative rounded-lg border p-2 text-xs space-y-1.5 bg-card",
                          reorderMode && canReorder && "cursor-grab active:cursor-grabbing",
                          dragItemId === item.id && "opacity-50",
                        )}
                      >
                        {(canReorder || canEditContent) && (
                          <div className="absolute top-1 left-1 flex gap-0.5 z-10">
                            {canEditContent && !contentChangePending && (
                              <button
                                type="button"
                                title="تعديل النوع أو الموضوع"
                                onClick={() => openContentEdit(item)}
                                className="p-1 rounded-md bg-background/90 border border-border shadow-sm hover:bg-primary/10 text-primary"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            )}
                            {canReorder && reorderMode && (
                              <span
                                className="p-1 rounded-md bg-background/90 border border-border shadow-sm text-muted-foreground"
                                title="اسحب لنقل الأسبوع"
                              >
                                <GripVertical className="w-3 h-3" />
                              </span>
                            )}
                          </div>
                        )}

                        <div className="pr-1 pt-4">
                          <div className="font-semibold text-primary">
                            {paragraphTypeLabel(settings, item.paragraphTypeId)}
                          </div>
                          <div className="text-foreground/90 leading-snug">{item.topic || "—"}</div>
                        </div>

                        {canExecute && (
                          <div className="space-y-1.5 pt-1 border-t border-border/50">
                            <label className="flex items-center gap-2">
                              <Checkbox
                                checked={item.executed}
                                onCheckedChange={(v) =>
                                  updateItemExecution(item.id, { executed: !!v })
                                }
                              />
                              <span>نُفّذ</span>
                            </label>
                            <Input
                              value={item.executor}
                              onChange={(e) =>
                                updateItemExecution(item.id, { executor: e.target.value })
                              }
                              placeholder={getSessionName("الملقي")}
                              className="h-7 text-xs"
                            />
                            <Input
                              type="number"
                              min={0}
                              value={item.beneficiaries || ""}
                              onChange={(e) =>
                                updateItemExecution(item.id, {
                                  beneficiaries: Number(e.target.value) || 0,
                                })
                              }
                              placeholder="المستفيدون"
                              className="h-7 text-xs"
                            />
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="glass-card rounded-2xl p-5 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-primary">تعديل الفقرة</h4>
              <button type="button" onClick={() => setEditTarget(null)} className="p-1 rounded hover:bg-secondary">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              تغيير النوع أو الموضوع يحتاج اعتماد مشرف البرامج — نقل الأسبوع بالسحب لا يحتاج اعتماد.
            </p>
            <select
              className="w-full rounded-md border border-border bg-input px-2 py-2 text-sm"
              value={editTarget.paragraphTypeId}
              onChange={(e) =>
                setEditTarget({ ...editTarget, paragraphTypeId: e.target.value })
              }
            >
              {settings.paragraphTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
            <Input
              value={editTarget.topic}
              onChange={(e) => setEditTarget({ ...editTarget, topic: e.target.value })}
              placeholder="موضوع البرنامج"
            />
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditTarget(null)}>
                إلغاء
              </Button>
              <Button type="button" size="sm" onClick={saveContentEdit}>
                حفظ التعديل
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function TeacherTarbawiDraftWeekBoard({
  plan,
  settings,
  calendar,
  spanWeeks,
  currentWeekNum,
  canEditPlan,
  onPlanChange,
}: {
  plan: TarbawiHalaqaPlan;
  settings: TarbawiSettings;
  calendar: AcademicCalendar;
  spanWeeks: number;
  currentWeekNum: number;
  canEditPlan: boolean;
  onPlanChange: (plan: TarbawiHalaqaPlan) => void;
}) {
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [reorderMode, setReorderMode] = useState(true);
  const selectableWeeks = getSelectableWeeks(calendar).filter((w) => w.week_number <= spanWeeks);

  const handleDrop = (weekNumber: number) => {
    if (!dragItemId || !canEditPlan) return;
    onPlanChange(moveTarbawiItemToWeek(plan, dragItemId, weekNumber));
    setDragItemId(null);
  };

  return (
    <div className="space-y-3">
      {canEditPlan && (
        <Button
          type="button"
          size="sm"
          variant={reorderMode ? "default" : "outline"}
          className="gap-1"
          onClick={() => setReorderMode((v) => !v)}
        >
          <GripVertical className="w-4 h-4" />
          {reorderMode ? "إيقاف تعديل الترتيب" : "تعديل الترتيب (سحب)"}
        </Button>
      )}

      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3 min-w-max">
          {selectableWeeks.map((w) => {
            const weekNum = w.week_number;
            const isCurrent = weekNum === currentWeekNum;
            const items = plan.items.filter((i) => i.weekNumber === weekNum);

            return (
              <div
                key={weekNum}
                className={cn(
                  "w-[220px] shrink-0 rounded-xl border flex flex-col min-h-[200px]",
                  isCurrent
                    ? "border-primary bg-primary/15 ring-2 ring-primary/30"
                    : "border-border bg-secondary/20",
                )}
                onDragOver={(e) => {
                  if (reorderMode && canEditPlan) e.preventDefault();
                }}
                onDrop={() => handleDrop(weekNum)}
              >
                <div
                  className={cn(
                    "px-3 py-2 border-b rounded-t-xl text-sm font-bold",
                    isCurrent ? "bg-primary/25" : "bg-secondary/40",
                  )}
                >
                  {formatWeekOptionLabel(w)}
                  <div className="text-[11px] font-normal text-muted-foreground">
                    {items.length} فقرة
                  </div>
                </div>
                <div className="p-2 space-y-2 flex-1">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      draggable={reorderMode && canEditPlan}
                      onDragStart={() => setDragItemId(item.id)}
                      onDragEnd={() => setDragItemId(null)}
                      className={cn(
                        "rounded-lg border p-2 text-xs bg-card relative",
                        reorderMode && canEditPlan && "cursor-grab",
                      )}
                    >
                      {reorderMode && (
                        <GripVertical className="w-3.5 h-3.5 absolute top-1 left-1 text-muted-foreground" />
                      )}
                      <div className="pt-3">
                        <div className="font-semibold text-primary">
                          {paragraphTypeLabel(settings, item.paragraphTypeId)}
                        </div>
                        <div>{item.topic}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
