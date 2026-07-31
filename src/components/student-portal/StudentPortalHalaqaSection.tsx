import type { Halaqa } from "@/lib/mock-data";
import type { AcademicCalendar } from "@/lib/academic-context";
import type { ComplexFaceTotals } from "@/lib/student-portal-data";
import { formatFaceCount } from "@/lib/plan-daily-faces";
import { weekLabel } from "@/lib/arabic-numbers";
import { BookOpen, Layers } from "lucide-react";

interface HalaqaStat {
  halaqa: Halaqa;
  pct: number;
}

export function StudentPortalHalaqaSection({
  halaqaStats,
  calendar,
  weekNum,
  complexFaces,
  showWeekly,
  showComplexFaces,
}: {
  halaqaStats: HalaqaStat[];
  calendar: AcademicCalendar;
  weekNum: number;
  complexFaces: ComplexFaceTotals | null;
  showWeekly: boolean;
  showComplexFaces: boolean;
}) {
  if (!showWeekly && !showComplexFaces) return null;

  return (
    <section className="glass-card rounded-2xl p-6 mb-6">
      {showWeekly && (
        <div className="text-center">
          <h2 className="text-xl font-bold text-primary mb-1 flex items-center justify-center gap-2">
            <BookOpen className="w-5 h-5" /> متوسط الحلقات — {weekLabel(weekNum)}
          </h2>
          <p className="text-xs text-muted-foreground mb-6">
            نتائج هذا الأسبوع فقط · {calendar.semester?.name ?? "الفصل الحالي"}
          </p>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-5 mx-auto max-w-3xl">
            {halaqaStats.map(({ halaqa, pct }) => (
              <Donut key={halaqa.id} pct={pct} label={halaqa.name} />
            ))}
          </div>
        </div>
      )}

      {showComplexFaces && complexFaces && (
        <div className={`${showWeekly ? "mt-8 pt-8 border-t border-border" : ""} text-center`}>
          <h3 className="text-lg font-bold text-primary mb-1 flex items-center justify-center gap-2">
            <Layers className="w-5 h-5" /> إجمالي أوجه المجمع
          </h3>
          <p className="text-xs text-muted-foreground mb-5">
            من بداية الفصل حتى اليوم
          </p>
          <div className="flex flex-wrap justify-center gap-4 mx-auto max-w-xl">
            <ComplexFaceCard label="أوجه الحفظ" value={complexFaces.hifz} />
            <ComplexFaceCard
              label="أوجه الربط والمراجعة"
              value={complexFaces.rabt + complexFaces.muraja}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function ComplexFaceCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-primary/25 bg-primary/5 px-6 py-4 min-w-[140px]">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-2xl font-bold gold-text">
        {formatFaceCount(value)}
        <span className="text-sm font-normal text-muted-foreground mr-1">وجه</span>
      </div>
    </div>
  );
}

function Donut({ pct, label }: { pct: number; label: string }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(pct, 100) / 100) * c;
  const display = pct % 1 === 0 ? String(Math.round(pct)) : pct.toFixed(1);
  const gradId = `gold-h-${label.replace(/[^\w\u0600-\u06FF]/g, "")}`;
  return (
    <div className="flex flex-col items-center w-[7.5rem]">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 100 100" className="-rotate-90 w-full h-full">
          <circle cx="50" cy="50" r={r} fill="none" stroke="oklch(0.22 0.03 250)" strokeWidth="10" />
          <circle
            cx="50" cy="50" r={r} fill="none"
            stroke={`url(#${gradId})`} strokeWidth="10"
            strokeLinecap="round" strokeDasharray={`${dash} ${c}`}
          />
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="oklch(0.78 0.13 80)" />
              <stop offset="100%" stopColor="oklch(0.88 0.09 85)" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center font-bold gold-text text-sm">{display}%</div>
      </div>
      <div className="text-xs text-center text-muted-foreground mt-2 leading-tight">{label}</div>
    </div>
  );
}
