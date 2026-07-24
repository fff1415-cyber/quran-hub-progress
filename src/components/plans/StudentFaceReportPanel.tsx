import { useEffect, useMemo, useState } from "react";
import { loadGrades, loadStudents, type Student } from "@/lib/mock-data";
import { fetchActiveCalendar, type AcademicCalendar } from "@/lib/academic-context";
import { fetchStudentPlanSheet } from "@/lib/plans-service";
import {
  aggregateFaceProgress,
  aggregateFaceProgressAllWeeks,
  facePct,
  faceQuotasFromAssignment,
  formatFaceCount,
  DEFAULT_FACE_QUOTAS,
} from "@/lib/plan-daily-faces";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Loader2, Search } from "lucide-react";

function FaceStatRow({
  label,
  actual,
  target,
}: {
  label: string;
  actual: number;
  target: number;
}) {
  const pct = facePct(actual, target);
  return (
    <div className="rounded-lg border border-border p-3 bg-secondary/20">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-lg font-bold gold-text">
          {formatFaceCount(actual)} <span className="text-sm text-muted-foreground font-normal">وجه</span>
        </span>
        <span className="text-xs text-muted-foreground">/ {formatFaceCount(target)} مستهدف</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div className="text-[10px] text-muted-foreground mt-1 text-left">{pct}%</div>
    </div>
  );
}

export function StudentFaceReportPanel() {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Student | null>(null);
  const [calendar, setCalendar] = useState<AcademicCalendar | null>(null);
  const [loading, setLoading] = useState(false);
  const [fromIso, setFromIso] = useState("");
  const [toIso, setToIso] = useState("");
  const [data, setData] = useState<{
    quotas: typeof DEFAULT_FACE_QUOTAS;
    summary: ReturnType<typeof aggregateFaceProgressAllWeeks>;
    hasPlan: boolean;
  } | null>(null);

  const students = loadStudents();
  const grades = loadGrades();

  useEffect(() => {
    let cancelled = false;
    fetchActiveCalendar(true)
      .then((cal) => {
        if (cancelled) return;
        setCalendar(cal);
        setFromIso(cal.semester?.start_date ?? cal.operationalDate);
        setToIso(cal.operationalDate);
      })
      .catch(() => { if (!cancelled) setCalendar(null); });
    return () => { cancelled = true; };
  }, []);

  const results = useMemo(() => {
    const query = q.trim();
    if (query.length < 2) return [];
    return students.filter((s) => s.name.includes(query)).slice(0, 10);
  }, [q, students]);

  useEffect(() => {
    if (!selected) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchStudentPlanSheet(selected.id)
      .then((sheet) => {
        if (cancelled) return;
        const quotas = sheet.assignment
          ? faceQuotasFromAssignment(sheet.assignment)
          : DEFAULT_FACE_QUOTAS;
        const summary = calendar && fromIso && toIso
          ? aggregateFaceProgress(selected.id, grades, calendar, quotas, fromIso, toIso)
          : aggregateFaceProgressAllWeeks(selected.id, grades, quotas);
        setData({ quotas, summary, hasPlan: !!sheet.assignment });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selected, calendar, fromIso, toIso, grades]);

  return (
    <Card className="glass-card border-primary/15 shadow-none">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2 text-primary">
          <BookOpen className="w-5 h-5" /> تقرير الأوجه (حفظ · ربط · مراجعة)
        </CardTitle>
        <CardDescription>
          يُحسب من ضغطات المعلم اليومية — ½/1/2 للحفظ، مجتاز للربط والمراجعة
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          value={q}
          onChange={(e) => { setQ(e.target.value); setSelected(null); }}
          placeholder="ابحث باسم الطالب..."
          className="py-5"
        />
        {results.length > 0 && !selected && (
          <div className="space-y-1 max-h-40 overflow-y-auto border border-border rounded-lg p-1">
            {results.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => { setSelected(s); setQ(s.name); }}
                className="w-full text-right px-3 py-2 rounded text-sm hover:bg-primary/10"
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        {selected && calendar && (
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">من تاريخ</label>
              <Input type="date" value={fromIso} onChange={(e) => setFromIso(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">إلى تاريخ</label>
              <Input type="date" value={toIso} onChange={(e) => setToIso(e.target.value)} />
            </div>
          </div>
        )}

        {selected && loading && (
          <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> جاري التحميل...
          </div>
        )}

        {selected && data && !loading && (
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="font-bold">{selected.name}</div>
                <div className="text-xs text-muted-foreground">
                  {data.hasPlan ? "مربوط بخطة — أهداف مخصصة" : "بدون خطة — أهداف افتراضية"}
                  {" · "}{data.summary.workingDays} يوم عمل
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setSelected(null)}>
                <Search className="w-4 h-4 ml-1" /> طالب آخر
              </Button>
            </div>
            <div className="text-[10px] text-muted-foreground grid grid-cols-3 gap-2">
              <span>حفظ/يوم: {data.quotas.daily_hifz_faces}</span>
              <span>ربط/يوم: {data.quotas.daily_rabt_faces}</span>
              <span>مراجعة/يوم: {data.quotas.daily_muraja_faces}</span>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <FaceStatRow label="الحفظ" actual={data.summary.hifzActual} target={data.summary.hifzTarget} />
              <FaceStatRow label="الربط" actual={data.summary.rabtActual} target={data.summary.rabtTarget} />
              <FaceStatRow label="المراجعة" actual={data.summary.murajaActual} target={data.summary.murajaTarget} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
