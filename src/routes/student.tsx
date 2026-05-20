import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  loadHalaqat, loadStudents, loadGrades, studentOverallPercentage, weekPercentage, DAYS,
} from "@/lib/mock-data";
import { AppHeader } from "@/components/AppHeader";
import { Search, Trophy, BookOpen } from "lucide-react";

export const Route = createFileRoute("/student")({ component: StudentPage });

function StudentPage() {
  const halaqat = loadHalaqat();
  const students = loadStudents();
  const grades = loadGrades();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  // Per-halaqa progress (avg overall pct of students)
  const halaqaStats = useMemo(() => {
    return halaqat.map((h) => {
      const hs = students.filter((s) => s.halaqaId === h.id);
      const avg = hs.length === 0 ? 0 : Math.round(hs.reduce((acc, s) => acc + studentOverallPercentage(s.id, h.isTalqeen, grades), 0) / hs.length);
      return { halaqa: h, pct: avg };
    });
  }, [halaqat, students, grades]);

  // Top 15 students
  const top15 = useMemo(() => {
    return students
      .map((s) => {
        const h = halaqat.find((x) => x.id === s.halaqaId)!;
        return { student: s, halaqa: h, pct: studentOverallPercentage(s.id, h.isTalqeen, grades) };
      })
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 15);
  }, [students, halaqat, grades]);

  const filtered = useMemo(() => {
    if (!q.trim()) return students.slice(0, 24);
    return students.filter((s) => s.name.includes(q.trim()));
  }, [q, students]);

  const selectedData = useMemo(() => {
    if (!selected) return null;
    const s = students.find((x) => x.id === selected)!;
    const h = halaqat.find((x) => x.id === s.halaqaId)!;
    const overall = studentOverallPercentage(s.id, h.isTalqeen, grades);
    const currentWeek = 1;
    const weekPct = weekPercentage(grades[s.id]?.[currentWeek], h.isTalqeen);
    let absences = 0, lates = 0;
    Object.values(grades[s.id] || {}).forEach((w) => {
      DAYS.forEach((d) => {
        if (w.days[d.key]?.attendance === "absent") absences++;
        if (w.days[d.key]?.attendance === "late") lates++;
      });
    });
    return { student: s, halaqa: h, overall, weekPct, absences, lates };
  }, [selected, students, halaqat, grades]);

  return (
    <div className="min-h-screen">
      <AppHeader title="نتائج الطلاب" subtitle="الطالب وولي الأمر" />
      <main className="max-w-6xl mx-auto px-4 py-8">

        {/* Donut chart for halaqa progress */}
        <section className="glass-card rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-primary mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5" /> تقدّم الحلقات
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {halaqaStats.map(({ halaqa, pct }) => (
              <Donut key={halaqa.id} pct={pct} label={halaqa.name} />
            ))}
          </div>
        </section>

        {/* Honor roll */}
        <section className="glass-card rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-primary mb-4 flex items-center gap-2">
            <Trophy className="w-5 h-5" /> لوحة الشرف — أفضل 15 طالب
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {top15.map((row, i) => (
              <div key={row.student.id} className={`flex items-center justify-between p-3 rounded-lg ${i < 3 ? "bg-primary/10 border border-primary/30" : "bg-secondary/50"}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${i < 3 ? "gold-gradient text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                    {i + 1}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{row.student.name}</div>
                    <div className="text-xs text-muted-foreground">{row.halaqa.name}</div>
                  </div>
                </div>
                <div className="font-bold gold-text">{row.pct}%</div>
              </div>
            ))}
          </div>
        </section>

        {/* Search & student picker */}
        <section className="glass-card rounded-2xl p-6">
          <div className="relative mb-4">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث عن اسم الطالب..."
              className="w-full pr-10 pl-4 py-3 rounded-xl bg-input border border-border focus:border-primary focus:outline-none"
            />
          </div>

          {selectedData ? (
            <div className="p-5 rounded-2xl border border-primary/30 bg-primary/5">
              <button onClick={() => setSelected(null)} className="text-xs text-muted-foreground mb-3">← رجوع للقائمة</button>
              <h3 className="display text-2xl gold-text mb-1">{selectedData.student.name}</h3>
              <p className="text-sm text-muted-foreground mb-4">{selectedData.halaqa.name}</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Stat label="المقاطع المحفوظة" value={selectedData.student.memorized} small />
                <Stat label="النسبة الكلية" value={`${selectedData.overall}%`} />
                <Stat label="نسبة الأسبوع" value={`${selectedData.weekPct}%`} />
                <Stat label="مرات الغياب" value={String(selectedData.absences)} />
                <Stat label="مرات التأخر" value={String(selectedData.lates)} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-96 overflow-y-auto">
              {filtered.map((s) => (
                <button key={s.id} onClick={() => setSelected(s.id)}
                  className="p-3 rounded-lg bg-secondary/50 hover:bg-primary/10 hover:border-primary border border-transparent text-sm text-right transition-all">
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="p-3 rounded-lg bg-card border border-border">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={small ? "text-sm font-medium" : "text-xl font-bold gold-text"}>{value}</div>
    </div>
  );
}

function Donut({ pct, label }: { pct: number; label: string }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 100 100" className="-rotate-90 w-full h-full">
          <circle cx="50" cy="50" r={r} fill="none" stroke="oklch(0.22 0.03 250)" strokeWidth="10" />
          <circle cx="50" cy="50" r={r} fill="none" stroke="url(#gold)" strokeWidth="10"
            strokeLinecap="round" strokeDasharray={`${dash} ${c}`} />
          <defs>
            <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="oklch(0.78 0.13 80)" />
              <stop offset="100%" stopColor="oklch(0.88 0.09 85)" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center font-bold gold-text">{pct}%</div>
      </div>
      <div className="text-xs text-center text-muted-foreground mt-2 leading-tight">{label}</div>
    </div>
  );
}
