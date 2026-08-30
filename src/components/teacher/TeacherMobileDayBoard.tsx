import type { ReactNode } from "react";
import type { AcademicCalendar } from "@/lib/academic-context";
import type { DayEntry, GradesStore, Student } from "@/lib/mock-data";
import {
  DAYS,
  dayEntryFor,
  emptyWeek,
  ensureWeekDays,
  weekPercentage,
  compensationRemainingForDay,
  sumWeekCompensationFaces,
  WEEKLY_COMPENSATION_CAP,
  type HifzValue,
} from "@/lib/mock-data";
import { formatWeekOptionLabel, getSelectableWeeks, isWeekDayClosed } from "@/lib/academic-context";
import { AttSelect, CompensationSelect } from "@/components/plans/TeacherGradeInputs";
import { PlanAwareTaskCell } from "@/components/plans/PlanAwareTaskCell";
import {
  ScientificGradeInput,
  ScientificGradesToolbar,
} from "@/components/teacher/ScientificGradesToolbar";
import { SemesterBreakdownPopover } from "@/components/teacher/SemesterBreakdownPopover";
import {
  getScientificDayScore,
  type ScientificFieldsConfig,
  type ScientificGradesConfig,
  type ScientificGradesDataStore,
} from "@/lib/scientific-grades";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Check, ClipboardList, Send, Users, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type DayMeta = { key: string; label: string };

type Props = {
  weekNum: number;
  calendar: AcademicCalendar;
  onWeekChange: (n: number) => void;
  isTalqeen: boolean;
  viewerRole: "teacher" | "assistant";
  canAssign: boolean;
  students: Student[];
  grades: GradesStore;
  workingKeysList: string[];
  visibleDays: DayMeta[];
  activeDayKey: string;
  onActiveDayChange: (dayKey: string) => void;
  isCurrentWeek: boolean;
  todayKey: string;
  sciVisible: boolean;
  sciFields: ScientificFieldsConfig;
  sciData: ScientificGradesDataStore[string];
  onSciConfigChange: (cfg: ScientificGradesConfig) => void;
  halaqaId: number;
  halaqaSemesterPct: number;
  showTransferButton: boolean;
  transferOpen: boolean;
  onTransferOpenChange: (open: boolean) => void;
  transferStudentId: string;
  onTransferStudentIdChange: (id: string) => void;
  transferReason: string;
  onTransferReasonChange: (v: string) => void;
  onSubmitTransfer: () => void;
  planStudentIds: Set<string>;
  frozenPlanStudentIds: Set<string>;
  planLinkedIds: Set<string>;
  onOpenPlanSheet: (s: Student) => void;
  onShowAssign: () => void;
  onUpdateDay: (studentId: string, dayKey: string, patch: Partial<DayEntry>) => void;
  onUpdateSciScore: (
    studentId: string,
    dayKey: string,
    field: "attendance" | "hifz" | "rabt" | "muraja",
    value: string,
  ) => void;
  onPlanHifz: (s: Student, dayKey: string) => void;
  onPlanPassFail: (s: Student, dayKey: string, task: "rabt" | "muraja", value: "pass" | "fail" | "") => void;
  onCompensationChange: (s: Student, dayKey: string, faces: number) => void;
  onMarkAllPresent: (dayKey: string) => void;
};

function pctClass(pct: number): string {
  if (pct >= 80) return "text-success";
  if (pct >= 50) return "text-warning";
  return "text-muted-foreground";
}

function TaskColumn({
  label,
  children,
  sci,
  cellClassName,
}: {
  label: string;
  children: ReactNode;
  sci?: ReactNode;
  cellClassName?: string;
}) {
  return (
    <div className="flex-1 min-w-0 flex flex-col items-stretch">
      <span className="text-[9px] font-bold text-muted-foreground text-center leading-none mb-1">{label}</span>
      <div className={cn(
        "teacher-mobile-compact flex items-center justify-center min-h-9 rounded-lg border border-border/60 px-0.5",
        cellClassName ?? "bg-input/50",
      )}>
        {children}
      </div>
      {sci != null && (
        <div className="mt-0.5 flex justify-center">{sci}</div>
      )}
    </div>
  );
}

function MobileCbx({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all",
        checked ? "bg-primary border-primary" : "border-border bg-background",
      )}
      aria-pressed={checked}
    >
      {checked && <Check className="w-4 h-4 text-primary-foreground" />}
    </button>
  );
}

export function TeacherMobileDayBoard({
  weekNum,
  calendar,
  onWeekChange,
  isTalqeen,
  viewerRole,
  canAssign,
  students,
  grades,
  workingKeysList,
  visibleDays,
  activeDayKey,
  onActiveDayChange,
  isCurrentWeek,
  todayKey,
  sciVisible,
  sciFields,
  sciData,
  onSciConfigChange,
  halaqaId,
  showTransferButton,
  transferOpen,
  onTransferOpenChange,
  transferStudentId,
  onTransferStudentIdChange,
  transferReason,
  onTransferReasonChange,
  onSubmitTransfer,
  planStudentIds,
  frozenPlanStudentIds,
  planLinkedIds,
  onOpenPlanSheet,
  onShowAssign,
  onUpdateDay,
  onUpdateSciScore,
  onPlanHifz,
  onPlanPassFail,
  onCompensationChange,
  onMarkAllPresent,
}: Props) {
  const selectableWeeks = getSelectableWeeks(calendar);
  const dayLabel = DAYS.find((d) => d.key === activeDayKey)?.label ?? activeDayKey;
  const showSciRow =
    sciVisible &&
    (sciFields.attendance || sciFields.hifz || sciFields.rabt || sciFields.muraja);

  return (
    <div className="space-y-2">
      <div className="sticky top-[3.25rem] z-30 -mx-1 px-1 pb-1.5 pt-1 bg-background/95 backdrop-blur-md border-b border-border/40">
        <div className="rounded-xl border border-border/60 bg-card/80 p-2 space-y-2 shadow-sm">
          <div className="flex items-center gap-1.5">
            <Select value={String(weekNum)} onValueChange={(v) => onWeekChange(Number(v))}>
              <SelectTrigger className="flex-1 min-w-0 h-9 font-bold text-xs rounded-lg">
                <SelectValue placeholder="الأسبوع" />
              </SelectTrigger>
              <SelectContent>
                {selectableWeeks.map((wk) => (
                  <SelectItem key={wk.week_number} value={String(wk.week_number)}>
                    {formatWeekOptionLabel(wk, wk.week_number === calendar.currentWeekNumber)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={() => onMarkAllPresent(activeDayKey)}
              disabled={isWeekDayClosed(calendar, weekNum, activeDayKey)}
              className="shrink-0 h-9 px-2.5 rounded-lg bg-success/15 text-success border border-success/30 text-[11px] font-bold disabled:opacity-40 disabled:pointer-events-none"
            >
              حضّر الكل
            </button>
          </div>

          <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-none">
            {visibleDays.map((d) => {
              const active = d.key === activeDayKey;
              const today = isCurrentWeek && d.key === todayKey;
              const closed = isWeekDayClosed(calendar, weekNum, d.key);
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => onActiveDayChange(d.key)}
                  className={cn(
                    "shrink-0 min-w-[3.25rem] px-2 py-1.5 rounded-lg text-xs font-bold border transition-all",
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : closed
                        ? "bg-warning/10 border-warning/40 text-warning"
                        : "bg-secondary/40 border-border",
                    today && !active && "ring-1 ring-primary/35",
                  )}
                >
                  {d.label}
                  {closed && <span className="block text-[8px] font-bold">إجازة</span>}
                  {today && !closed && <span className="block text-[8px] font-normal opacity-80">اليوم</span>}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {!isTalqeen && (
              <ScientificGradesToolbar halaqaId={halaqaId} onConfigChange={onSciConfigChange} />
            )}
            {canAssign && (
              <button
                type="button"
                onClick={onShowAssign}
                className="h-8 px-2 rounded-lg border border-primary/30 text-primary text-[10px] font-bold"
              >
                <Users className="w-3 h-3 inline ml-0.5" />
                تقسيم
              </button>
            )}
            {!isTalqeen && students.length > 0 && showTransferButton && (
              <Popover open={transferOpen} onOpenChange={onTransferOpenChange}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="h-8 px-2 rounded-lg bg-warning/15 text-warning border border-warning/40 text-[10px] font-bold"
                  >
                    <Send className="w-3 h-3 inline ml-0.5" />
                    تحويل
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  side="bottom"
                  align="end"
                  sideOffset={8}
                  className="w-[min(100vw-2rem,22rem)] p-0 overflow-hidden shadow-lg border-warning/30"
                  onOpenAutoFocus={(e) => e.preventDefault()}
                >
                  <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-warning/10">
                    <h3 className="text-sm font-bold text-warning">إرسال متعثر للإدارة</h3>
                    <button type="button" onClick={() => onTransferOpenChange(false)} aria-label="إغلاق">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-3 space-y-3">
                    <select
                      value={transferStudentId}
                      onChange={(e) => onTransferStudentIdChange(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm"
                    >
                      <option value="">— اختر الطالب —</option>
                      {students.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <textarea
                      value={transferReason}
                      onChange={(e) => onTransferReasonChange(e.target.value)}
                      rows={3}
                      placeholder="سبب التحويل..."
                      className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm resize-none"
                    />
                    <button
                      type="button"
                      onClick={onSubmitTransfer}
                      className="w-full py-2 rounded-lg gold-gradient text-primary-foreground font-bold text-sm"
                    >
                      إرسال
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>
      </div>

      {!calendar.semester && (
        <p className="text-[10px] text-warning px-1">لم يُعرَّف فصل دراسي بعد.</p>
      )}

      <p className="text-[10px] text-muted-foreground px-1">
        {dayLabel} · {students.length} طالب
        <span className="text-primary font-bold"> · مباشر</span>
        {isWeekDayClosed(calendar, weekNum, activeDayKey) && (
          <span className="text-warning font-bold"> · إجازة — العرض فقط دون تعديل</span>
        )}
      </p>

      {students.length === 0 ? (
        <div className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
          {viewerRole === "assistant" ? "لم يُعيّن لك أي طالب بعد" : "لا يوجد طلاب"}
        </div>
      ) : (
        <div className={cn("space-y-1.5 pb-4", isWeekDayClosed(calendar, weekNum, activeDayKey) && "pointer-events-none opacity-80")}>
          {students.map((s) => {
            const week = ensureWeekDays(
              grades[s.id]?.[weekNum] ?? emptyWeek(workingKeysList),
              workingKeysList,
            );
            const e = dayEntryFor(week, activeDayKey, workingKeysList);
            const weekPct = weekPercentage(week, isTalqeen, s.levelType);
            const hasPlan = planLinkedIds.has(s.id);
            const dayComp = e.compensationFaces ?? 0;
            const compMaxToday = compensationRemainingForDay(week, activeDayKey, workingKeysList);
            const weekPoolRemaining = WEEKLY_COMPENSATION_CAP - sumWeekCompensationFaces(week, workingKeysList);

            return (
              <article
                key={s.id}
                className="rounded-xl border border-border/70 bg-card/90 overflow-hidden"
              >
                {/* Row 1: name · plan · percentages */}
                <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border/40 bg-secondary/20 min-h-[2.25rem]">
                  <h3 className="flex-1 min-w-0 font-bold text-[13px] leading-tight truncate pr-0.5">
                    {s.name}
                    {s.assignedTo === "assistant" && viewerRole === "teacher" && (
                      <span className="text-[9px] text-muted-foreground font-normal mr-1">· مساعد</span>
                    )}
                    {frozenPlanStudentIds.has(s.id) && (
                      <span className="text-[9px] text-warning font-normal mr-1">· مجمد</span>
                    )}
                  </h3>

                  <div className="shrink-0 flex items-center gap-2.5">
                    {hasPlan && (
                      <button
                        type="button"
                        onClick={() => onOpenPlanSheet(s)}
                        className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-bold"
                      >
                        <ClipboardList className="w-3 h-3" />
                        الخطة
                      </button>
                    )}

                    {!isTalqeen && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md font-bold border",
                              dayComp > 0
                                ? "bg-success/10 text-success border-success/30"
                                : "text-muted-foreground border-border/60",
                            )}
                          >
                            تع {dayComp > 0 ? dayComp : "—"}
                            <span className="text-[9px] opacity-75">· {weekPoolRemaining}</span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-52 p-2.5" align="end">
                          <p className="text-[10px] text-muted-foreground mb-1">
                            تعويض {dayLabel} — متبقي للأسبوع: {weekPoolRemaining} من {WEEKLY_COMPENSATION_CAP}
                          </p>
                          <CompensationSelect
                            value={dayComp}
                            maxFaces={compMaxToday}
                            onChange={(v) => onCompensationChange(s, activeDayKey, v)}
                          />
                        </PopoverContent>
                      </Popover>
                    )}

                    <div className="flex items-center gap-2 text-left tabular-nums border-r border-border/50 pr-2">
                      <div className="text-center leading-none">
                        <div className="text-[8px] text-muted-foreground">أسبوع</div>
                        <div className={cn("text-[11px] font-bold", pctClass(weekPct))}>{weekPct}%</div>
                      </div>
                      <div className="text-center leading-none min-w-[2.5rem]">
                        <div className="text-[8px] text-muted-foreground">فصل</div>
                        <SemesterBreakdownPopover
                          studentId={s.id}
                          isTalqeen={isTalqeen}
                          grades={grades}
                          calendar={calendar}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Row 2: attendance · hifz · rabt · muraja (+ sci under each) */}
                <div className="px-1.5 py-1.5">
                  {isTalqeen ? (
                    <div className="flex gap-1">
                      <TaskColumn
                        label="حضور"
                        cellClassName="bg-transparent border-transparent p-0"
                        sci={
                          showSciRow && sciFields.attendance ? (
                            <ScientificGradeInput
                              value={getScientificDayScore(sciData, s.id, weekNum, activeDayKey, "attendance")}
                              onChange={(v) => onUpdateSciScore(s.id, activeDayKey, "attendance", v)}
                            />
                          ) : undefined
                        }
                      >
                        <AttSelect
                          value={e.attendance}
                          talqeen
                          onChange={(v) => onUpdateDay(s.id, activeDayKey, { attendance: v })}
                        />
                      </TaskColumn>
                      <TaskColumn label="واجب">
                        <MobileCbx
                          checked={!!e.wajib}
                          onChange={(v) => onUpdateDay(s.id, activeDayKey, { wajib: v })}
                        />
                      </TaskColumn>
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      <TaskColumn
                        label="حضور"
                        cellClassName="bg-transparent border-transparent p-0"
                        sci={
                          showSciRow && sciFields.attendance ? (
                            <ScientificGradeInput
                              value={getScientificDayScore(sciData, s.id, weekNum, activeDayKey, "attendance")}
                              onChange={(v) => onUpdateSciScore(s.id, activeDayKey, "attendance", v)}
                            />
                          ) : undefined
                        }
                      >
                        <AttSelect
                          value={e.attendance}
                          onChange={(v) => onUpdateDay(s.id, activeDayKey, { attendance: v })}
                        />
                      </TaskColumn>
                      <TaskColumn
                        label="حفظ"
                        sci={
                          showSciRow && sciFields.hifz ? (
                            <ScientificGradeInput
                              value={getScientificDayScore(sciData, s.id, weekNum, activeDayKey, "hifz")}
                              onChange={(v) => onUpdateSciScore(s.id, activeDayKey, "hifz", v)}
                            />
                          ) : undefined
                        }
                      >
                        <PlanAwareTaskCell
                          student={s}
                          task="hifz"
                          hasPlan={planStudentIds.has(s.id)}
                          hifzValue={e.hifz}
                          passFailValue=""
                          onHifzChange={(v: HifzValue) => onUpdateDay(s.id, activeDayKey, { hifz: v })}
                          onPassFailChange={() => {}}
                          onPlanHifzChange={() => onPlanHifz(s, activeDayKey)}
                        />
                      </TaskColumn>
                      <TaskColumn
                        label="ربط"
                        sci={
                          showSciRow && sciFields.rabt ? (
                            <ScientificGradeInput
                              value={getScientificDayScore(sciData, s.id, weekNum, activeDayKey, "rabt")}
                              onChange={(v) => onUpdateSciScore(s.id, activeDayKey, "rabt", v)}
                            />
                          ) : undefined
                        }
                      >
                        <PlanAwareTaskCell
                          student={s}
                          task="rabt"
                          hasPlan={planStudentIds.has(s.id)}
                          hifzValue=""
                          passFailValue={e.rabt}
                          onHifzChange={() => {}}
                          onPassFailChange={(v) => onUpdateDay(s.id, activeDayKey, { rabt: v })}
                          onPlanPassFailChange={(v) => onPlanPassFail(s, activeDayKey, "rabt", v)}
                        />
                      </TaskColumn>
                      <TaskColumn
                        label="مراجعة"
                        sci={
                          showSciRow && sciFields.muraja ? (
                            <ScientificGradeInput
                              value={getScientificDayScore(sciData, s.id, weekNum, activeDayKey, "muraja")}
                              onChange={(v) => onUpdateSciScore(s.id, activeDayKey, "muraja", v)}
                            />
                          ) : undefined
                        }
                      >
                        <PlanAwareTaskCell
                          student={s}
                          task="muraja"
                          hasPlan={planStudentIds.has(s.id)}
                          hifzValue=""
                          passFailValue={e.muraja}
                          onHifzChange={() => {}}
                          onPassFailChange={(v) => onUpdateDay(s.id, activeDayKey, { muraja: v })}
                          onPlanPassFailChange={(v) => onPlanPassFail(s, activeDayKey, "muraja", v)}
                        />
                      </TaskColumn>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
