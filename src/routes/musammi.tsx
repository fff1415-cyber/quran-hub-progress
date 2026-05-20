import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  loadHalaqat, loadStudents, loadGrades, saveGrades, pushNotification,
} from "@/lib/mock-data";
import { AppHeader } from "@/components/AppHeader";
import { Mic, Check, X } from "lucide-react";
import { Toaster, toast } from "sonner";

export const Route = createFileRoute("/musammi")({ component: MusammiPage });

function MusammiPage() {
  const halaqat = loadHalaqat();
  const students = loadStudents();
  const [grades, setGrades] = useState(() => loadGrades());

  // Students with sard checked anywhere
  const sardStudents = useMemo(() => {
    const result: { student: any; week: number }[] = [];
    students.forEach((s) => {
      const weeks = grades[s.id] || {};
      Object.entries(weeks).forEach(([wk, w]) => {
        if (w.sard) result.push({ student: s, week: Number(wk) });
      });
    });
    return result;
  }, [students, grades]);

  const setResult = (sid: string, wk: number, key: "sard1" | "sard2" | "sard3", value: any) => {
    const g = { ...grades };
    if (!g[sid][wk].sardResults) g[sid][wk].sardResults = {};
    (g[sid][wk].sardResults as any)[key] = value;
    setGrades(g);
    saveGrades(g);
    pushNotification({ message: `تم تقييم سرد الطالب ${students.find((s) => s.id === sid)?.name}: ${JSON.stringify(value)}`, type: "sard" });
    toast.success("تم إرسال التقييم للإداري");
  };

  return (
    <div className="min-h-screen">
      <Toaster position="top-center" richColors />
      <AppHeader title="صفحة المسمّع" subtitle="تقييم السرد" />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="glass-card rounded-2xl p-6 mb-6 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl gold-gradient flex items-center justify-center">
            <Mic className="w-7 h-7 text-primary-foreground" />
          </div>
          <div>
            <h1 className="display text-2xl gold-text">لوحة المسمّع</h1>
            <p className="text-sm text-muted-foreground">الطلاب المُحالون للسرد</p>
          </div>
        </div>

        {sardStudents.length === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center">
            <p className="text-muted-foreground">لا يوجد طلاب محالين للسرد حالياً</p>
            <p className="text-xs text-muted-foreground mt-2">سيظهرون هنا عندما يفعّل المعلم خانة "السرد"</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {sardStudents.map(({ student, week }) => {
              const r = grades[student.id]?.[week]?.sardResults || {};
              const halaqa = halaqat.find((h) => h.id === student.halaqaId);
              return (
                <div key={`${student.id}-${week}`} className="glass-card rounded-2xl p-5">
                  <div className="mb-4 pb-3 border-b border-border">
                    <div className="font-bold text-lg">{student.name}</div>
                    <div className="text-xs text-muted-foreground">{halaqa?.name} — أسبوع {week}</div>
                  </div>

                  {/* Sard 1 */}
                  <SardRow label="السرد 1" count={1} value={r.sard1 ? [r.sard1] : []}
                    onChange={(arr) => setResult(student.id, week, "sard1", arr[0])} />

                  {/* Sard 2 — two slots */}
                  <SardRow label="السرد 2" count={2} value={r.sard2 || []}
                    onChange={(arr) => setResult(student.id, week, "sard2", arr)} />

                  {/* Sard 3 — six slots (5 pass + 1 fail) */}
                  <SardRow label="السرد 3" count={6} value={r.sard3 || []}
                    onChange={(arr) => setResult(student.id, week, "sard3", arr)} />
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function SardRow({ label, count, value, onChange }: { label: string; count: number; value: ("pass" | "fail")[]; onChange: (v: ("pass" | "fail")[]) => void }) {
  const set = (idx: number, v: "pass" | "fail") => {
    const next = [...value];
    next[idx] = v;
    onChange(next);
  };
  return (
    <div className="mb-4">
      <div className="text-sm text-muted-foreground mb-2">{label}</div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex gap-1">
            <button onClick={() => set(i, "pass")}
              className={`w-9 h-9 rounded-lg border flex items-center justify-center ${value[i] === "pass" ? "bg-success/30 border-success text-success" : "border-border hover:border-success/50"}`}>
              <Check className="w-4 h-4" />
            </button>
            <button onClick={() => set(i, "fail")}
              className={`w-9 h-9 rounded-lg border flex items-center justify-center ${value[i] === "fail" ? "bg-destructive/30 border-destructive text-destructive" : "border-border hover:border-destructive/50"}`}>
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
