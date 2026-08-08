import type { ReactNode } from "react";
import type { AcademicCalendar } from "@/lib/academic-context";
import type { DayEntry, GradesStore, Student } from "@/lib/mock-data";
import {
  DAYS,
  dayEntryFor,
  emptyWeek,
  ensureWeekDays,
  weekPercentage,
  type HifzValue,
} from "@/lib/mock-data";
import { formatWeekOptionLabel, getSelectableWeeks } from "@/lib/academic-context";
import { formatOverallPercent } from "@/lib/semester-grading";
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
import {
  Check,
  CheckCircle2,
  ClipboardList,
  Send,
  Users,
  X,
} from "lucide-react";
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
  onCompensationChange: (s: Student, faces: number) => void;
  onMarkAllPresent: (dayKey: string) => void;
};

function MobileField({
  label,
  children,
  compact,
}: {
  label: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", compact ? "min-w-0" : "flex-1 min-w-0")}>
      <span className="text-[11px] font-bold text-muted-foreground tracking-wide">{label}</span>
      <div className="teacher-mobile-control flex items-center justify-center min-h-11 rounded-xl bg-input/60 border border-border/70 px-2">
        {children}
      </div>
    </div>
  );
}

function MobileCbx({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "w-10 h-10 rounded-xl border-2 flex items-center justify-center transition-all",
        checked ? "bg-primary border-primary" : "border-border bg-background hover:border-primary/50",
      )}
      aria-pressed={checked}
    >
      {checked && <Check className="w-5 h-5 text-primary-foreground" />}
    </button>
  );
}

function attTone(att: string): string {
  if (att === "present") return "bg-success/15 text-success border-success/30";
  if (att === "late") return "bg-warning/15 text-warning border-warning/30";
  if (att === "excused") return "bg-primary/10 text-primary border-primary/25";
  if (att === "absent") return "bg-destructive/10 text-destructive border-destructive/30";
  return "bg-secondary/50 text-muted-foreground border-border";
}

function attLabel(att: string): string {
  if (att === "present") return "حاضر";
  if (att === "late") return "متأخر";
  if (att === "excused") return "مستأذن";
  if (att === "absent") return "غائب";
  return "—";
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
  halaqaSemesterPct,
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
  const isToday = isCurrentWeek && activeDayKey === todayKey;

  return (
    <div className="space-y-3">
      {/* Sticky control bar */}
      <div className="sticky top-[3.25rem] z-30 -mx-1 px-1 pb-2 pt-1 bg-background/95 backdrop-blur-md border-b border-border/40">
        <div className="glass-card rounded-2xl p-3 space-y-3 shadow-sm">
          <div className="flex items-center gap-2">
            <Select value={String(weekNum)} onValueChange={(v) => onWeekChange(Number(v))}>
              <SelectTrigger className="flex-1 min-w-0 h-11 font-bold text-sm rounded-xl">
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
            <span className="shrink-0 text-[11px] text-success font-bold flex items-center gap-1 px-2 py-2 rounded-xl bg-success/10 border border-success/20">
              <CheckCircle2 className="w-3.5 h-3.5" />
              تلقائي
            </span>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-0.5 px-0.5 scrollbar-none">
            {visibleDays.map((d) => {
              const active = d.key === activeDayKey;
              const today = isCurrentWeek && d.key === todayKey;
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => onActiveDayChange(d.key)}
                  className={cn(
                    "shrink-0 min-w-[4.25rem] px-3 py-2.5 rounded-xl text-sm font-bold border transition-all",
                    active
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-secondary/40 border-border text-foreground hover:border-primary/40",
                    today && !active && "ring-1 ring-primary/35",
                  )}
                >
                  <span className="block leading-none">{d.label}</span>
                  {today && (
                    <span className={cn("block text-[9px] mt-1 font-normal opacity-80", active && "opacity-90")}>
                      اليوم
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => onMarkAllPresent(activeDayKey)}
              className="flex-1 min-w-[8rem] h-10 rounded-xl bg-success/15 text-success border border-success/30 text-sm font-bold hover:bg-success/25"
            >
              حضّر الكل — {dayLabel}
            </button>
            {!isTalqeen && students.length > 0 && showTransferButton && (
              <Popover open={transferOpen} onOpenChange={onTransferOpenChange}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="h-10 px-3 rounded-xl bg-warning/15 text-warning border border-warning/40 text-sm font-bold hover:bg-warning/25 flex items-center gap-1.5"
                  >
                    <Send className="w-4 h-4" />
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
                  <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border bg-warning/10">
                    <h3 className="text-sm font-bold text-warning flex items-center gap-1.5">
                      <Send className="w-4 h-4 shrink-0" />
                      إرسال متعثر للإدارة
                    </h3>
                    <button
                      type="button"
                      onClick={() => onTransferOpenChange(false)}
                      className="p-1 rounded-md hover:bg-secondary text-muted-foreground"
                      aria-label="إغلاق"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-3 space-y-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">الطالب</label>
                      <select
                        value={transferStudentId}
                        onChange={(e) => onTransferStudentIdChange(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-lg bg-input border border-border text-sm"
                      >
                        <option value="">— اختر —</option>
                        {students.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">السبب</label>
                      <textarea
                        value={transferReason}
                        onChange={(e) => onTransferReasonChange(e.target.value)}
                        rows={3}
                        placeholder="اكتب سبب التحويل..."
                        className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm resize-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={onSubmitTransfer}
                      className="w-full px-3 py-2.5 rounded-lg gold-gradient text-primary-foreground font-bold text-sm"
                    >
                      إرسال
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {!isTalqeen && (
              <ScientificGradesToolbar halaqaId={halaqaId} onConfigChange={onSciConfigChange} />
            )}
            {canAssign && (
              <button
                type="button"
                onClick={onShowAssign}
                className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-primary/30 text-primary text-xs font-bold hover:bg-primary/10"
              >
                <Users className="w-3.5 h-3.5" />
                تقسيم
              </button>
            )}
          </div>
        </div>
      </div>

      {!calendar.semester && (
        <p className="text-xs text-warning px-1">
          لم يُعرَّف فصل دراسي بعد — يعرض النظام {calendar.weeks.length} أسبوعاً افتراضياً.
        </p>
      )}

      <div className="flex items-center justify-between gap-2 px-1">
        <div>
          <p className="text-sm font-bold text-primary">
            {dayLabel}
            {isToday ? " · اليوم" : ""}
          </p>
          <p className="text-[11px] text-muted-foreground">{students.length} طالب</p>
        </div>
        <div className="text-left rounded-xl border border-primary/20 bg-primary/5 px-3 py-1.5">
          <div className="text-[10px] text-muted-foreground">نسبة الحلقة</div>
          <div className="text-base font-bold gold-text leading-none">{formatOverallPercent(halaqaSemesterPct)}</div>
        </div>
      </div>

      {students.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center text-sm text-muted-foreground">
          {viewerRole === "assistant" ? "لم يُعيّن لك أي طالب بعد" : "لا يوجد طلاب"}
        </div>
      ) : (
        <div className="space-y-3 pb-6">
          {students.map((s, index) => {
            const week = ensureWeekDays(
              grades[s.id]?.[weekNum] ?? emptyWeek(workingKeysList),
              workingKeysList,
            );
            const e = dayEntryFor(week, activeDayKey, workingKeysList);
            const weekPct = weekPercentage(week, isTalqeen, s.levelType);

            return (
              <article
                key={s.id}
                className="rounded-2xl border border-border/70 bg-card/90 shadow-sm overflow-hidden"
              >
                <header className="flex items-start justify-between gap-3 px-3.5 py-3 bg-secondary/25 border-b border-border/50">
                  <div className="min-w-0 flex items-start gap-2.5">
                    <span className="shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center tabular-nums">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-bold text-[15px] leading-snug truncate">{s.name}</h3>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-bold", attTone(e.attendance))}>
                          {attLabel(e.attendance)}
                        </span>
                        {s.assignedTo === "assistant" && viewerRole === "teacher" && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">مع المساعد</span>
                        )}
                        {frozenPlanStudentIds.has(s.id) && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning/15 text-warning">مجمّدة</span>
                        )}
                        {planLinkedIds.has(s.id) && (
                          <button
                            type="button"
                            onClick={() => onOpenPlanSheet(s)}
                            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold"
                          >
                            <ClipboardList className="w-3 h-3" />
                            {planStudentIds.has(s.id) ? "الخطة" : "عرض الخطة"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 text-left space-y-1">
                    <div className="text-[10px] text-muted-foreground">الأسبوع</div>
                    <div className={cn(
                      "text-sm font-bold tabular-nums",
                      weekPct >= 80 ? "text-success" : weekPct >= 50 ? "text-warning" : "text-muted-foreground",
                    )}>
                      {weekPct}%
                    </div>
                    <SemesterBreakdownPopover
                      studentId={s.id}
                      isTalqeen={isTalqeen}
                      grades={grades}
                      calendar={calendar}
                    />
                  </div>
                </header>

                <div className="p-3.5 space-y-3">
                  {isTalqeen ? (
                    <div className="grid grid-cols-2 gap-2.5">
                      <MobileField label="الحضور">
                        <AttSelect
                          value={e.attendance}
                          talqeen
                          onChange={(v) => onUpdateDay(s.id, activeDayKey, { attendance: v })}
                        />
                      </MobileField>
                      <MobileField label="الواجب" compact>
                        <MobileCbx
                          checked={!!e.wajib}
                          onChange={(v) => onUpdateDay(s.id, activeDayKey, { wajib: v })}
                        />
                      </MobileField>
                      {sciVisible && sciFields.attendance && (
                        <MobileField label="درجة الحضور">
                          <ScientificGradeInput
                            value={getScientificDayScore(sciData, s.id, weekNum, activeDayKey, "attendance")}
                            onChange={(v) => onUpdateSciScore(s.id, activeDayKey, "attendance", v)}
                          />
                        </MobileField>
                      )}
                    </div>
                  ) : (
                    <>
                      <MobileField label="الحضور">
                        <AttSelect
                          value={e.attendance}
                          onChange={(v) => onUpdateDay(s.id, activeDayKey, { attendance: v })}
                        />
                      </MobileField>

                      <div className="grid grid-cols-3 gap-2.5">
                        <MobileField label="حفظ" compact>
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
                        </MobileField>
                        <MobileField label="ربط" compact>
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
                        </MobileField>
                        <MobileField label="مراجعة" compact>
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
                        </MobileField>
                      </div>

                      {sciVisible && (sciFields.attendance || sciFields.hifz || sciFields.rabt || sciFields.muraja) && (
                        <div className="grid grid-cols-2 gap-2.5 pt-1 border-t border-border/40">
                          {sciFields.attendance && (
                            <MobileField label="درجة الحضور">
                              <ScientificGradeInput
                                value={getScientificDayScore(sciData, s.id, weekNum, activeDayKey, "attendance")}
                                onChange={(v) => onUpdateSciScore(s.id, activeDayKey, "attendance", v)}
                              />
                            </MobileField>
                          )}
                          {sciFields.hifz && (
                            <MobileField label="درجة الحفظ">
                              <ScientificGradeInput
                                value={getScientificDayScore(sciData, s.id, weekNum, activeDayKey, "hifz")}
                                onChange={(v) => onUpdateSciScore(s.id, activeDayKey, "hifz", v)}
                              />
                            </MobileField>
                          )}
                          {sciFields.rabt && (
                            <MobileField label="درجة الربط">
                              <ScientificGradeInput
                                value={getScientificDayScore(sciData, s.id, weekNum, activeDayKey, "rabt")}
                                onChange={(v) => onUpdateSciScore(s.id, activeDayKey, "rabt", v)}
                              />
                            </MobileField>
                          )}
                          {sciFields.muraja && (
                            <MobileField label="درجة المراجعة">
                              <ScientificGradeInput
                                value={getScientificDayScore(sciData, s.id, weekNum, activeDayKey, "muraja")}
                                onChange={(v) => onUpdateSciScore(s.id, activeDayKey, "muraja", v)}
                              />
                            </MobileField>
                          )}
                        </div>
                      )}

                      <MobileField label="تعويض حفظ">
                        <CompensationSelect
                          value={week.compensationFaces ?? 0}
                          onChange={(v) => onCompensationChange(s, v)}
                        />
                      </MobileField>
                    </>
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
