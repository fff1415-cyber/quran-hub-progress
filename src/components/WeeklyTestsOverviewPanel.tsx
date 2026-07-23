import { useEffect, useMemo, useState } from "react";
import { loadHalaqat, loadStudents } from "@/lib/mock-data";
import { fetchActiveCalendar, type AcademicCalendar } from "@/lib/academic-context";
import {
  loadWeeklyTests,
  loadWeeklyTestsSettings,
  rankHalaqatByWeeklyTests,
  getStudentWeeklyTests,
  scoreWeeklyTests,
  cumulativeWeeklyTestsPercent,
  formatWeeklyTestPercent,
  weekTestsCompletion,
  WEEKLY_TEST_RESULT_LABEL,
  type WeeklyTestsStore,
} from "@/lib/weekly-tests";
import { weekLabel } from "@/lib/arabic-numbers";
import { Loader2, Trophy, ChevronDown, ChevronUp, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function WeeklyTestsOverviewPanel({ readOnly = true }: { readOnly?: boolean }) {
  const [calendar, setCalendar] = useState<AcademicCalendar | null>(null);
  const [store, setStore] = useState<WeeklyTestsStore>(() => loadWeeklyTests());
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const settings = useMemo(() => loadWeeklyTestsSettings(), []);
  const halaqat = loadHalaqat();
  const students = loadStudents();

  useEffect(() => {
    let cancelled = false;
    fetchActiveCalendar(true).then((cal) => {
      if (!cancelled) setCalendar(cal);
    }).catch(() => {});
    const refresh = () => setStore(loadWeeklyTests());
    window.addEventListener("storage", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const rankings = useMemo(() => {
    if (!calendar) return [];
    return rankHalaqatByWeeklyTests(halaqat, students, store, calendar, settings);
  }, [halaqat, students, store, calendar, settings]);

  if (!settings.enabled) {
    return (
      <section className="glass-card rounded-2xl p-10 text-center text-muted-foreground">
        <ClipboardCheck className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p>الاختبارات الأسبوعية غير مفعّلة حالياً</p>
      </section>
    );
  }

  if (!calendar) {
    return (
      <section className="glass-card rounded-2xl p-12 flex justify-center text-muted-foreground gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> جاري التحميل...
      </section>
    );
  }

  const weekNum = calendar.currentWeekNumber;

  return (
    <section className="space-y-4">
      <div className="glass-card rounded-2xl p-5">
        <h2 className="text-lg font-bold text-primary flex items-center gap-2 mb-1">
          <Trophy className="w-5 h-5" /> منافسة الحلقات — الاختبارات الأسبوعية
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          {calendar.semester?.name ?? "الفصل الحالي"} · {weekLabel(weekNum)} · 3 مراجعة + 1 ربط · مسار مستقل عن النسبة الكلية
        </p>

        {rankings.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-sm">لا توجد حلقات (غير التلقين)</p>
        ) : (
          <div className="space-y-2">
            {rankings.map((row, i) => {
              const expanded = expandedId === row.halaqaId;
              const hStudents = students.filter((s) => s.halaqaId === row.halaqaId);
              return (
                <div key={row.halaqaId} className={cn(
                  "rounded-xl border border-border overflow-hidden",
                  i < 3 && "border-primary/30 bg-primary/5",
                )}>
                  <button
                    type="button"
                    className="w-full flex items-center justify-between gap-3 p-4 text-right hover:bg-secondary/30 transition-colors"
                    onClick={() => setExpandedId(expanded ? null : row.halaqaId)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0",
                        i === 0 ? "gold-gradient text-primary-foreground" : i < 3 ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground",
                      )}>
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold truncate">{row.halaqaName}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {row.studentsTotal} طالب · اكتمال مراجعة {row.completionMuraja}% · ربط {row.completionRabt}%
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-left">
                        <div className="text-[10px] text-muted-foreground">أسبوع</div>
                        <div className="font-bold">{formatWeeklyTestPercent(row.weekPercent)}</div>
                      </div>
                      <div className="text-left">
                        <div className="text-[10px] text-primary">تراكم</div>
                        <div className="font-bold gold-text">{formatWeeklyTestPercent(row.cumulativePercent)}</div>
                      </div>
                      {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </button>

                  {expanded && (
                    <div className="border-t border-border px-4 pb-4 overflow-x-auto">
                      <table className="w-full text-xs mt-3">
                        <thead>
                          <tr className="text-muted-foreground">
                            <th className="p-2 text-right">الطالب</th>
                            <th className="p-2 text-center">مر1</th>
                            <th className="p-2 text-center">مر2</th>
                            <th className="p-2 text-center">مر3</th>
                            <th className="p-2 text-center">ربط</th>
                            <th className="p-2 text-center">أسبوع</th>
                            <th className="p-2 text-center">تراكم</th>
                          </tr>
                        </thead>
                        <tbody>
                          {hStudents.map((s) => {
                            const tests = getStudentWeeklyTests(store, s.id, weekNum, settings);
                            const ws = scoreWeeklyTests(tests, settings);
                            const cum = cumulativeWeeklyTestsPercent(store, s.id, weekNum, settings);
                            const c = weekTestsCompletion(tests, settings);
                            const incomplete = c.murajaDone < c.murajaTotal || c.rabtDone < c.rabtTotal;
                            return (
                              <tr key={s.id} className={cn("border-t border-border/40", incomplete && "bg-warning/5")}>
                                <td className="p-2 font-medium">{s.name}{incomplete && readOnly && <span className="text-warning mr-1">*</span>}</td>
                                {tests.muraja.map((r, idx) => (
                                  <td key={idx} className="p-2 text-center">{WEEKLY_TEST_RESULT_LABEL[r]}</td>
                                ))}
                                <td className="p-2 text-center">{WEEKLY_TEST_RESULT_LABEL[tests.rabt]}</td>
                                <td className="p-2 text-center">{formatWeeklyTestPercent(ws.percent)}</td>
                                <td className="p-2 text-center font-bold text-primary">{formatWeeklyTestPercent(cum)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <p className="text-[10px] text-warning mt-2">* لم يُكمل اختبارات الأسبوع</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
