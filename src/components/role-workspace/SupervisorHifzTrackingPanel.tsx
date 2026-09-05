import { useEffect, useMemo, useState } from "react";
import { loadGrades, loadHalaqat, loadStudents } from "@/lib/mock-data";
import { fetchActiveCalendar, type AcademicCalendar } from "@/lib/academic-context";
import {
  computeAllHifzTrackingRows,
  sortHifzTrackingRows,
  type HifzTrackingSortKey,
} from "@/lib/hifz-tracking";
import { formatFaceCount } from "@/lib/plan-daily-faces";
import { formatOverallPercent } from "@/lib/semester-grading";
import { weekLabel } from "@/lib/arabic-numbers";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { BookOpen, Loader2, RefreshCw } from "lucide-react";

const SORT_OPTIONS: { value: HifzTrackingSortKey; label: string }[] = [
  { value: "percent-desc", label: "النسبة — الأعلى أولاً" },
  { value: "percent-asc", label: "النسبة — الأدنى أولاً" },
  { value: "faces-desc", label: "الأوجه — الأكثر أولاً" },
  { value: "faces-asc", label: "الأوجه — الأقل أولاً" },
  { value: "late-desc", label: "التأخر — الأكثر أولاً" },
  { value: "late-asc", label: "التأخر — الأقل أولاً" },
];

function pctClass(pct: number): string {
  if (pct >= 80) return "text-success";
  if (pct >= 50) return "text-warning";
  return "text-muted-foreground";
}

export function SupervisorHifzTrackingPanel() {
  const [calendar, setCalendar] = useState<AcademicCalendar | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [halaqaFilter, setHalaqaFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<HifzTrackingSortKey>("percent-desc");

  const halaqat = useMemo(() => loadHalaqat().filter((h) => !h.isTalqeen), []);
  const students = useMemo(() => loadStudents(), []);
  const grades = useMemo(() => {
    void refreshKey;
    return loadGrades();
  }, [refreshKey]);

  useEffect(() => {
    let cancelled = false;
    fetchActiveCalendar(true)
      .then((cal) => {
        if (!cancelled) setCalendar(cal);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const rows = useMemo(() => {
    if (!calendar) return [];
    const all = computeAllHifzTrackingRows(halaqat, students, grades, calendar);
    const filtered =
      halaqaFilter === "all"
        ? all
        : all.filter((r) => String(r.halaqaId) === halaqaFilter);
    return sortHifzTrackingRows(filtered, sortKey);
  }, [calendar, halaqat, students, grades, halaqaFilter, sortKey]);

  if (!calendar) {
    return (
      <section className="glass-card rounded-2xl p-10 flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p>جاري تحميل بيانات الفصل...</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-primary flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            متابعة الحفظ
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {weekLabel(calendar.currentWeekNumber)} · احتساب من بداية الترم · {rows.length} طالب
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => setRefreshKey((k) => k + 1)}>
          <RefreshCw className="w-4 h-4" /> تحديث
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={halaqaFilter} onValueChange={setHalaqaFilter}>
          <SelectTrigger className="w-[min(100%,220px)] h-9 text-sm font-bold">
            <SelectValue placeholder="الحلقة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحلقات</SelectItem>
            {halaqat.map((h) => (
              <SelectItem key={h.id} value={String(h.id)}>
                {h.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sortKey} onValueChange={(v) => setSortKey(v as HifzTrackingSortKey)}>
          <SelectTrigger className="w-[min(100%,240px)] h-9 text-sm">
            <SelectValue placeholder="الترتيب" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center text-muted-foreground">
          لا يوجد طلاب للعرض
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[640px]">
            <thead>
              <tr className="bg-secondary/50 text-xs text-muted-foreground">
                <th className="p-2 w-10 text-center">#</th>
                <th className="p-2 text-right sticky right-0 bg-secondary z-10 min-w-[140px]">الطالب</th>
                <th className="p-2 text-right min-w-[100px]">الحلقة</th>
                <th className="p-2 text-center min-w-[72px]">النسبة</th>
                <th className="p-2 text-center min-w-[100px]">الأوجه</th>
                <th className="p-2 text-center min-w-[72px]">أيام التأخر</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.studentId} className="border-b border-border/40 hover:bg-accent/20">
                  <td className="p-2 text-center text-xs text-muted-foreground tabular-nums">{index + 1}</td>
                  <td className="p-2 font-medium sticky right-0 bg-card z-10">{row.studentName}</td>
                  <td className="p-2 text-muted-foreground text-xs">{row.halaqaName}</td>
                  <td className={cn("p-2 text-center font-bold tabular-nums", pctClass(row.hifzPercent))}>
                    {formatOverallPercent(row.hifzPercent)}
                  </td>
                  <td className="p-2 text-center text-xs tabular-nums">
                    <span className="font-bold text-foreground">{formatFaceCount(row.actualFaces)}</span>
                    <span className="text-muted-foreground"> / {formatFaceCount(row.targetFaces)}</span>
                  </td>
                  <td className={cn(
                    "p-2 text-center font-bold tabular-nums",
                    row.lateDays > 0 ? "text-warning" : "text-muted-foreground",
                  )}>
                    {row.lateDays}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
