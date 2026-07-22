import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  loadHalaqat, loadStudents, loadGrades, studentOverallPercentage, DAYS,
} from "@/lib/mock-data";
import { loginByNationalId } from "@/lib/secure-data.functions";
import { setToken } from "@/lib/cloud-sync";
import { getCalendarDayKey } from "@/lib/operational-date";
import { fetchStudentPlanSheet } from "@/lib/plans-service";
import type { StudentPlanSheetData } from "@/lib/plan-types";
import { StudentPlanSheet } from "@/components/plans/StudentPlanSheet";
import { AppHeader } from "@/components/AppHeader";
import { Trophy, BookOpen, IdCard, X, CheckCircle2, Clock, AlertCircle, UserCheck, GraduationCap } from "lucide-react";
import { Toaster, toast } from "sonner";

export const Route = createFileRoute("/student")({ component: StudentPage });

function StudentPage() {
  const halaqat = loadHalaqat();
  const students = loadStudents();
  const grades = loadGrades();
  const [nid, setNid] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [planData, setPlanData] = useState<StudentPlanSheetData | null>(null);
  const [planLoading, setPlanLoading] = useState(false);

  const halaqaStats = useMemo(() => halaqat.map((h) => {
    const hs = students.filter((s) => s.halaqaId === h.id);
    const avg = hs.length === 0 ? 0 : Math.round(hs.reduce((acc, s) => acc + studentOverallPercentage(s.id, h.isTalqeen, grades), 0) / hs.length);
    return { halaqa: h, pct: avg };
  }), [halaqat, students, grades]);

  const top15 = useMemo(() => students
    .map((s) => {
      const h = halaqat.find((x) => x.id === s.halaqaId)!;
      if (!h) return null;
      return { student: s, halaqa: h, pct: studentOverallPercentage(s.id, h.isTalqeen, grades) };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 15), [students, halaqat, grades]);

  const submit = async () => {
    if (!nid.trim()) { toast.error("أدخل رقم الهوية"); return; }
    try {
      const res = await loginByNationalId({ data: { nationalId: nid.trim() } });
      setToken(res.token);
      setSelectedId(res.studentId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "رقم الهوية غير مسجل");
    }
  };

  const data = useMemo(() => {
    if (!selectedId) return null;
    const s = students.find((x) => x.id === selectedId);
    if (!s) return null;
    const h = halaqat.find((x) => x.id === s.halaqaId)!;
    const overall = studentOverallPercentage(s.id, h.isTalqeen, grades);
    let absences = 0, lates = 0, excused = 0, memorizedCount = 0;
    Object.values(grades[s.id] || {}).forEach((w) => {
      DAYS.forEach((d) => {
        const e = w.days[d.key];
        if (!e) return;
        if (e.attendance === "absent") absences++;
        if (e.attendance === "late") lates++;
        if (e.attendance === "excused") excused++;
        if (e.hifz === "half" || e.hifz === "one" || e.hifz === "two") memorizedCount++;
      });
    });
    // Find today's status across any week that recorded it
    const todayKey = getCalendarDayKey();
    let todayStatus = "";
    const weeks = Object.values(grades[s.id] || {});
    for (let i = weeks.length - 1; i >= 0; i--) {
      const att = weeks[i].days[todayKey]?.attendance;
      if (att) { todayStatus = att; break; }
    }
    return { s, h, overall, absences, lates, excused, memorizedCount, todayStatus };
  }, [selectedId, students, halaqat, grades]);

  useEffect(() => {
    if (!selectedId) {
      setPlanData(null);
      return;
    }
    let cancelled = false;
    setPlanLoading(true);
    fetchStudentPlanSheet(selectedId)
      .then((d) => { if (!cancelled) setPlanData(d); })
      .catch(() => { if (!cancelled) setPlanData(null); })
      .finally(() => { if (!cancelled) setPlanLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  return (
    <div className="min-h-screen">
      <Toaster position="top-center" richColors />
      <AppHeader title="نتائج الطلاب" subtitle="الطالب وولي الأمر" />
      <main className="max-w-6xl mx-auto px-4 py-8">

        {/* Halaqa progress */}
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

        {/* National ID input — required to see personal data */}
        <section className="glass-card rounded-2xl p-6 gold-glow">
          <h2 className="text-xl font-bold text-primary mb-2 flex items-center gap-2">
            <IdCard className="w-5 h-5" /> الاطلاع على نتائج الطالب
          </h2>
          <p className="text-xs text-muted-foreground mb-4">أدخل رقم هوية الطالب لعرض بياناته الخاصة فقط.</p>

          {!data ? (
            <div className="flex gap-2 max-w-md">
              <input
                value={nid}
                onChange={(e) => setNid(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="رقم الهوية"
                inputMode="numeric"
                maxLength={10}
                className="flex-1 px-4 py-3 rounded-xl bg-input border border-border focus:border-primary focus:outline-none text-center text-lg tracking-widest font-bold text-primary"
              />
              <button onClick={submit} className="px-6 py-3 rounded-xl gold-gradient text-primary-foreground font-bold">
                عرض
              </button>
            </div>
          ) : (
            <div className="p-5 rounded-2xl border border-primary/30 bg-primary/5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="display text-2xl gold-text mb-1">{data.s.name}</h3>
                  <p className="text-sm text-muted-foreground">{data.h.name} · مستوى {data.s.level}</p>
                </div>
                <button onClick={() => { setSelectedId(null); setNid(""); }} className="p-2 rounded-lg hover:bg-secondary">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Today's status */}
              <TodayBadge status={data.todayStatus} />

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
                <Stat label="مقاطع محفوظة" value={String(data.memorizedCount)} />
                <Stat label="النسبة العامة" value={`${data.overall}%`} />
                <Stat label="مرات الغياب" value={String(data.absences)} />
                <Stat label="مرات التأخر" value={String(data.lates)} />
                <Stat label="مرات الاستئذان" value={String(data.excused)} />
              </div>

              <section className="mt-6 pt-6 border-t border-border">
                <h4 className="text-lg font-bold text-primary mb-4 flex items-center gap-2">
                  <GraduationCap className="w-5 h-5" /> ورقة الإنجاز التراكمية
                </h4>
                <StudentPlanSheet
                  data={planData ?? { assignment: null, plan: null, segments: [], completions: [] }}
                  studentName={data.s.name}
                  readOnly
                  loading={planLoading}
                />
              </section>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function TodayBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; icon: typeof CheckCircle2; cls: string }> = {
    present: { label: "حاضر اليوم", icon: CheckCircle2, cls: "bg-success/15 text-success border-success/30" },
    late: { label: "متأخر اليوم", icon: Clock, cls: "bg-warning/15 text-warning border-warning/30" },
    excused: { label: "مستأذن اليوم", icon: UserCheck, cls: "bg-primary/15 text-primary border-primary/30" },
    absent: { label: "غائب اليوم", icon: AlertCircle, cls: "bg-destructive/15 text-destructive border-destructive/30" },
  };
  const m = map[status] || { label: "لم تُسجَّل حالة اليوم بعد", icon: Clock, cls: "bg-muted text-muted-foreground border-border" };
  const Icon = m.icon;
  return (
    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border font-bold text-sm ${m.cls}`}>
      <Icon className="w-4 h-4" />
      {m.label}
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
