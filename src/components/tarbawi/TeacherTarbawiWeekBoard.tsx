import { useMemo, useState } from "react";
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

type TableRow = {
  item: TarbawiPlanItem;
  weekNumber: number;
  weekTitle: string;
  isFirstInWeek: boolean;
  weekRowSpan: number;
  isCurrentWeek: boolean;
};

type BoardProps = {
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
  contentRevisionIds?: string[];
  contentRevisionNotes?: Record<string, string>;
  onPlanChange: (plan: TarbawiHalaqaPlan) => void;
  onContentDraft: (items: TarbawiPlanItem[]) => void;
};

function buildTableRows(
  items: TarbawiPlanItem[],
  calendar: AcademicCalendar,
  spanWeeks: number,
  currentWeekNum: number,
): TableRow[] {
  const selectableWeeks = getSelectableWeeks(calendar).filter((w) => w.week_number <= spanWeeks);
  const rows: TableRow[] = [];

  for (const w of selectableWeeks) {
    const weekNum = w.week_number;
    const weekItems = items.filter((i) => i.weekNumber === weekNum);
    if (weekItems.length === 0) continue;

    weekItems.forEach((item, idx) => {
      rows.push({
        item,
        weekNumber: weekNum,
        weekTitle: formatWeekOptionLabel(w),
        isFirstInWeek: idx === 0,
        weekRowSpan: weekItems.length,
        isCurrentWeek: weekNum === currentWeekNum,
      });
    });
  }

  return rows;
}

function TarbawiPlanTable({
  rows,
  settings,
  showExecution,
  canExecute,
  canReorder,
  canEditContent,
  contentChangePending,
  contentRevisionIds = [],
  contentRevisionNotes = {},
  reorderMode,
  dragItemId,
  onDragStart,
  onDragEnd,
  onDropOnWeek,
  onOpenContentEdit,
  onUpdateExecution,
}: {
  rows: TableRow[];
  settings: TarbawiSettings;
  showExecution: boolean;
  canExecute: boolean;
  canReorder: boolean;
  canEditContent: boolean;
  contentChangePending: boolean;
  contentRevisionIds: string[];
  contentRevisionNotes: Record<string, string>;
  reorderMode: boolean;
  dragItemId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDropOnWeek: (weekNumber: number) => void;
  onOpenContentEdit: (item: TarbawiPlanItem) => void;
  onUpdateExecution: (id: string, patch: Partial<TarbawiPlanItem>) => void;
}) {
  const hasActions = canReorder || canEditContent;

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm border-collapse min-w-[720px]">
        <thead>
          <tr className="bg-primary/20 text-primary text-right">
            <th className="p-2.5 border border-primary/30 font-bold w-[120px]">الأسبوع</th>
            <th className="p-2.5 border border-primary/30 font-bold min-w-[120px]">نوع الفقرة</th>
            <th className="p-2.5 border border-primary/30 font-bold min-w-[180px]">الموضوع (البرنامج)</th>
            {showExecution && (
              <>
                <th className="p-2.5 border border-primary/30 font-bold min-w-[120px]">المنفّذ</th>
                <th className="p-2.5 border border-primary/30 font-bold w-[100px]">عدد المستفيدين</th>
                <th className="p-2.5 border border-primary/30 font-bold w-[72px] text-center">التنفيذ</th>
              </>
            )}
            {hasActions && (
              <th className="p-2.5 border border-primary/30 font-bold w-[56px]" />
            )}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={(showExecution ? 6 : 3) + (hasActions ? 1 : 0)}
                className="p-8 text-center text-muted-foreground border border-border"
              >
                لا فقرات موزّعة بعد
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const needsRevision = contentRevisionIds.includes(row.item.id);
              const itemEditable =
                canEditContent &&
                !contentChangePending &&
                (contentRevisionIds.length === 0 || needsRevision);
              return (
              <tr
                key={row.item.id}
                draggable={reorderMode && canReorder}
                onDragStart={() => onDragStart(row.item.id)}
                onDragEnd={onDragEnd}
                onDragOver={(e) => {
                  if (reorderMode && canReorder) e.preventDefault();
                }}
                onDrop={() => onDropOnWeek(row.weekNumber)}
                className={cn(
                  "border-b border-border/60 transition-colors",
                  needsRevision && "bg-destructive/10 ring-1 ring-inset ring-destructive/30",
                  !needsRevision && row.isCurrentWeek ? "bg-primary/10" : !needsRevision && "bg-secondary/15",
                  reorderMode && canReorder && "cursor-grab active:cursor-grabbing",
                  dragItemId === row.item.id && "opacity-50",
                )}
              >
                {row.isFirstInWeek && (
                  <td
                    rowSpan={row.weekRowSpan}
                    className={cn(
                      "p-2.5 border border-border/50 align-middle text-center font-bold text-sm vertical-align-middle",
                      row.isCurrentWeek ? "bg-primary/15 text-primary" : "bg-secondary/30",
                    )}
                  >
                    <div>{row.weekTitle}</div>
                    {row.isCurrentWeek && (
                      <div className="text-[10px] font-semibold mt-0.5">الأسبوع الحالي</div>
                    )}
                  </td>
                )}
                <td className="p-2 border border-border/40">
                  <span className="inline-block px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-semibold">
                    {paragraphTypeLabel(settings, row.item.paragraphTypeId)}
                  </span>
                </td>
                <td className="p-2 border border-border/40 text-foreground leading-snug">
                  <div>{row.item.topic || "—"}</div>
                  {needsRevision && contentRevisionNotes[row.item.id] && (
                    <div className="text-[10px] text-destructive mt-1">
                      {contentRevisionNotes[row.item.id]}
                    </div>
                  )}
                </td>
                {showExecution && (
                  <>
                    <td className="p-2 border border-border/40">
                      {canExecute ? (
                        <Input
                          value={row.item.executor}
                          onChange={(e) =>
                            onUpdateExecution(row.item.id, { executor: e.target.value })
                          }
                          placeholder={getSessionName("الملقي")}
                          className="h-8 text-xs"
                        />
                      ) : (
                        <span className="text-xs">{row.item.executor || "—"}</span>
                      )}
                    </td>
                    <td className="p-2 border border-border/40 text-center">
                      {canExecute ? (
                        <Input
                          type="number"
                          min={0}
                          value={row.item.beneficiaries || ""}
                          onChange={(e) =>
                            onUpdateExecution(row.item.id, {
                              beneficiaries: Number(e.target.value) || 0,
                            })
                          }
                          placeholder="0"
                          className="h-8 text-xs text-center"
                        />
                      ) : (
                        <span className="text-xs font-medium">{row.item.beneficiaries || "—"}</span>
                      )}
                    </td>
                    <td className="p-2 border border-border/40 text-center">
                      {canExecute ? (
                        <Checkbox
                          checked={row.item.executed}
                          onCheckedChange={(v) =>
                            onUpdateExecution(row.item.id, { executed: !!v })
                          }
                        />
                      ) : (
                        <span className={cn(
                          "text-xs font-bold",
                          row.item.executed ? "text-success" : "text-muted-foreground",
                        )}>
                          {row.item.executed ? "✓" : "—"}
                        </span>
                      )}
                    </td>
                  </>
                )}
                {hasActions && (
                  <td className="p-2 border border-border/40 text-center">
                    <div className="flex items-center justify-center gap-0.5">
                      {itemEditable && (
                        <button
                          type="button"
                          title="تعديل النوع أو الموضوع"
                          onClick={() => onOpenContentEdit(row.item)}
                          className="p-1 rounded-md border border-border hover:bg-primary/10 text-primary"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canReorder && reorderMode && (
                        <span className="p-1 text-muted-foreground" title="اسحب الصف">
                          <GripVertical className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

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
  contentRevisionIds = [],
  contentRevisionNotes = {},
  onPlanChange,
  onContentDraft,
}: BoardProps) {
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);

  const rows = useMemo(
    () => buildTableRows(plan.items, calendar, spanWeeks, currentWeekNum),
    [plan.items, calendar, spanWeeks, currentWeekNum],
  );

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
          <p className="text-xs text-muted-foreground">
            اسحب الصف وأفلته على صف في الأسبوع المطلوب
          </p>
        )}
      </div>

      {weekStats.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {weekStats.filter((s) => s.planned > 0).map((s) => (
            <div
              key={s.weekNumber}
              className={cn(
                "text-[11px] px-2 py-1 rounded-lg border",
                s.weekNumber === currentWeekNum
                  ? "border-primary/40 bg-primary/10 text-primary font-bold"
                  : "border-border bg-secondary/30 text-muted-foreground",
              )}
            >
              {weekLabel(s.weekNumber)}: {s.executed}/{s.planned} · {s.pct}%
            </div>
          ))}
        </div>
      )}

      <TarbawiPlanTable
        rows={rows}
        settings={settings}
        showExecution
        canExecute={canExecute}
        canReorder={canReorder}
        canEditContent={canEditContent}
        contentChangePending={contentChangePending}
        contentRevisionIds={contentRevisionIds}
        contentRevisionNotes={contentRevisionNotes}
        reorderMode={reorderMode}
        dragItemId={dragItemId}
        onDragStart={setDragItemId}
        onDragEnd={() => setDragItemId(null)}
        onDropOnWeek={handleDrop}
        onOpenContentEdit={openContentEdit}
        onUpdateExecution={updateItemExecution}
      />

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

  const rows = useMemo(
    () => buildTableRows(plan.items, calendar, spanWeeks, currentWeekNum),
    [plan.items, calendar, spanWeeks, currentWeekNum],
  );

  const handleDrop = (weekNumber: number) => {
    if (!dragItemId || !canEditPlan) return;
    onPlanChange(moveTarbawiItemToWeek(plan, dragItemId, weekNumber));
    setDragItemId(null);
    toast.success(`نُقلت الفقرة إلى ${weekLabel(weekNumber)}`);
  };

  return (
    <div className="space-y-3">
      {canEditPlan && (
        <>
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
          {reorderMode && (
            <p className="text-xs text-muted-foreground">
              اسحب الصف وأفلته على صف في الأسبوع المطلوب
            </p>
          )}
        </>
      )}

      <TarbawiPlanTable
        rows={rows}
        settings={settings}
        showExecution={false}
        canExecute={false}
        canReorder={canEditPlan}
        canEditContent={false}
        contentChangePending={false}
        reorderMode={reorderMode && canEditPlan}
        dragItemId={dragItemId}
        onDragStart={setDragItemId}
        onDragEnd={() => setDragItemId(null)}
        onDropOnWeek={handleDrop}
        onOpenContentEdit={() => {}}
        onUpdateExecution={() => {}}
      />
    </div>
  );
}
