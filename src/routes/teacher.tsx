import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import {
  loadHalaqat, loadStudents, loadGrades, saveGrades, emptyWeek, DAYS,
  weekPercentage, type WeekRecord, type DayEntry,
} from "@/lib/mock-data";
import { AppHeader } from "@/components/AppHeader";
import { ArrowRight, Check, CheckCircle2, ListChecks } from "lucide-react";
import { Toaster, toast } from "sonner";

export const Route = createFileRoute("/teacher")({
  validateSearch: z.object({ h: z.number().optional(), w: z.number().optional() }),
  component: TeacherPage,
});

function TeacherPage() {
  const { h, w } = Route.useSearch();
  const navigate = useNavigate();
  const halaqat = loadHalaqat();
  const halaqa = halaqat.find((x) => x.id === h);
  const role = typeof window !== "undefined" ? sessionStorage.getItem("qs_role") : null;
  const greeting = role === "assistant" ? "مرحباً بك سلمان" : "مرحباً بك محمد";

  if (!halaqa) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass-card p-8 rounded-2xl text-center">
          <p>الحلقة غير موجودة</p>
          <button onClick={() => navigate({ to: "/" })} className="mt-4 px-4 py-2 rounded-lg gold-gradient text-primary-foreground">العودة</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Toaster position="top-center" richColors />
      <AppHeader title={halaqa.name} subtitle={role === "assistant" ? "مساعد" : "معلم"} />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="glass-card rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-2xl display gold-text">{greeting}</div>
              <div className="text-sm text-muted-foreground mt-1">{halaqa.name}</div>
            </div>
            {w && (
              <button
                onClick={() => navigate({ to: "/teacher", search: { h: halaqa.id } })}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-primary/30 text-primary"
              >
                <ArrowRight className="w-4 h-4" />
                رجوع للأسابيع
              </button>
            )}
          </div>
        </div>

        {!w ? <WeeksGrid halaqaId={halaqa.id} /> : <WeekTable halaqaId={halaqa.id} weekNum={w} isTalqeen={halaqa.isTalqeen} />}
      </main>
    </div>
  );
}

function WeeksGrid({ halaqaId }: { halaqaId: number }) {
  const navigate = useNavigate();
  return (
    <div>
      <h2 className="text-xl font-bold mb-4 text-primary flex items-center gap-2">
        <ListChecks className="w-5 h-5" /> الأسابيع الدراسية
      </h2>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-9 gap-3">
        {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            onClick={() => navigate({ to: "/teacher", search: { h: halaqaId, w: n } })}
            className="aspect-square rounded-xl glass-card hover:gold-glow hover:border-primary transition-all flex flex-col items-center justify-center group"
          >
            <div className="text-xs text-muted-foreground">الأسبوع</div>
            <div className="text-3xl display font-bold gold-text group-hover:scale-110 transition-transform">{n}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function WeekTable({ halaqaId, weekNum, isTalqeen }: { halaqaId: number; weekNum: number; isTalqeen: boolean }) {
  const students = useMemo(() => loadStudents().filter((s) => s.halaqaId === halaqaId), [halaqaId]);
  const [grades, setGrades] = useState(() => loadGrades());

  // Initialize empty weeks if missing
  useEffect(() => {
    let changed = false;
    const g = { ...grades };
    students.forEach((s) => {
      if (!g[s.id]) g[s.id] = {};
      if (!g[s.id][weekNum]) { g[s.id][weekNum] = emptyWeek(); changed = true; }
    });
    if (changed) { setGrades(g); saveGrades(g); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekNum, halaqaId]);

  const update = (studentId: string, fn: (w: WeekRecord) => WeekRecord) => {
    const g = { ...grades };
    if (!g[studentId]) g[studentId] = {};
    if (!g[studentId][weekNum]) g[studentId][weekNum] = emptyWeek();
    g[studentId][weekNum] = fn(g[studentId][weekNum]);
    setGrades(g);
    saveGrades(g);
  };

  const updateDay = (studentId: string, dayKey: string, patch: Partial<DayEntry>) => {
    update(studentId, (w) => ({ ...w, days: { ...w.days, [dayKey]: { ...w.days[dayKey], ...patch } } }));
  };

  return (
    <div className="glass-card rounded-2xl p-4 overflow-x-auto">
      <div className="flex items-center justify-between mb-4 px-2">
        <h3 className="display text-xl gold-text">الأسبوع {weekNum}</h3>
        <button
          onClick={() => toast.success("تم الحفظ تلقائياً")}
          className="flex items-center gap-2 text-sm text-success"
        >
          <CheckCircle2 className="w-4 h-4" /> حفظ تلقائي
        </button>
      </div>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-secondary/50">
            <th className="p-2 text-right sticky right-0 bg-secondary z-10 min-w-[140px]">الطالب</th>
            {DAYS.map((d) => (
              <th key={d.key} colSpan={isTalqeen ? 2 : 4} className="p-2 border-r border-border text-primary">{d.label}</th>
            ))}
            {!isTalqeen && <th className="p-2 border-r border-border">اختبار مراجعة</th>}
            <th className="p-2 border-r border-border">اختبار ربط</th>
            <th className="p-2 border-r border-border">السرد</th>
            <th className="p-2 border-r border-border text-primary">النسبة</th>
          </tr>
          <tr className="bg-secondary/30 text-xs text-muted-foreground">
            <th className="sticky right-0 bg-secondary"></th>
            {DAYS.map((d) =>
              isTalqeen ? (
                <>
                  <th key={d.key + "a"} className="p-1 border-r border-border">حاضر</th>
                  <th key={d.key + "w"} className="p-1">واجب</th>
                </>
              ) : (
                <>
                  <th key={d.key + "a"} className="p-1 border-r border-border">الحضور</th>
                  <th key={d.key + "h"} className="p-1">حفظ</th>
                  <th key={d.key + "r"} className="p-1">ربط</th>
                  <th key={d.key + "m"} className="p-1">مراجعة</th>
                </>
              )
            )}
            {!isTalqeen && <th></th>}
            <th></th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => {
            const w = grades[s.id]?.[weekNum] || emptyWeek();
            const pct = weekPercentage(w, isTalqeen);
            return (
              <tr key={s.id} className="border-b border-border/50 hover:bg-accent/30">
                <td className="p-2 sticky right-0 bg-card font-medium">{s.name}</td>
                {DAYS.map((d) => {
                  const e = w.days[d.key];
                  return isTalqeen ? (
                    <>
                      <td key={d.key + "a"} className="p-1 border-r border-border/30">
                        <AttSelect value={e.attendance} talqeen onChange={(v) => updateDay(s.id, d.key, { attendance: v })} />
                      </td>
                      <td key={d.key + "w"} className="p-1 text-center">
                        <Cbx checked={!!e.wajib} onChange={(v) => updateDay(s.id, d.key, { wajib: v })} />
                      </td>
                    </>
                  ) : (
                    <>
                      <td key={d.key + "a"} className="p-1 border-r border-border/30">
                        <AttSelect value={e.attendance} onChange={(v) => updateDay(s.id, d.key, { attendance: v })} />
                      </td>
                      <td key={d.key + "h"} className="p-1 text-center">
                        <Cbx checked={e.hifz} onChange={(v) => updateDay(s.id, d.key, { hifz: v })} />
                      </td>
                      <td key={d.key + "r"} className="p-1">
                        <PassFail value={e.rabt} onChange={(v) => updateDay(s.id, d.key, { rabt: v })} />
                      </td>
                      <td key={d.key + "m"} className="p-1">
                        <PassFail value={e.muraja} onChange={(v) => updateDay(s.id, d.key, { muraja: v })} />
                      </td>
                    </>
                  );
                })}
                {!isTalqeen && (
                  <td className="p-1 text-center border-r border-border/30">
                    <Cbx checked={w.testMuraja} onChange={(v) => update(s.id, (x) => ({ ...x, testMuraja: v }))} />
                  </td>
                )}
                <td className="p-1 text-center border-r border-border/30">
                  <Cbx checked={w.testRabt} onChange={(v) => update(s.id, (x) => ({ ...x, testRabt: v }))} />
                </td>
                <td className="p-1 text-center border-r border-border/30">
                  <Cbx checked={w.sard} onChange={(v) => update(s.id, (x) => ({ ...x, sard: v }))} />
                </td>
                <td className="p-2 text-center font-bold">
                  <span className={pct >= 80 ? "text-success" : pct >= 50 ? "text-warning" : "text-muted-foreground"}>
                    {pct}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AttSelect({ value, onChange, talqeen }: { value: string; onChange: (v: any) => void; talqeen?: boolean }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-input border border-border rounded px-1 py-1 text-xs">
      <option value="">—</option>
      <option value="present">حاضر</option>
      {!talqeen && <option value="late">متأخر</option>}
      {!talqeen && <option value="excused">مستأذن</option>}
      <option value="absent">غائب</option>
    </select>
  );
}
function PassFail({ value, onChange }: { value: string; onChange: (v: any) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-input border border-border rounded px-1 py-1 text-xs">
      <option value="">—</option>
      <option value="pass">مجتاز</option>
      <option value="fail">راسب</option>
    </select>
  );
}
function Cbx({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${
        checked ? "bg-primary border-primary" : "border-border bg-input hover:border-primary/50"
      }`}
    >
      {checked && <Check className="w-4 h-4 text-primary-foreground" />}
    </button>
  );
}
