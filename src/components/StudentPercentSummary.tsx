import type { StudentReportPercentages } from "@/lib/semester-grading";
import { formatOverallPercent, overallPercentColorClass } from "@/lib/semester-grading";

export function StudentPercentSummary({
  report,
  isTalqeen,
  showWeek = true,
  compact = false,
}: {
  report: StudentReportPercentages;
  isTalqeen: boolean;
  showWeek?: boolean;
  compact?: boolean;
}) {
  const items: { label: string; value: number; tone?: "success" | "warning" | "destructive" }[] = [
    { label: "نسبة الحضور", value: report.components.attendance },
  ];
  if (isTalqeen) {
    items.push({ label: "نسبة الواجب", value: report.components.wajib, tone: "success" });
  } else {
    items.push(
      { label: "نسبة الحفظ", value: report.components.hifz, tone: "success" },
      { label: "نسبة المراجعة", value: report.components.muraja },
      { label: "نسبة الربط", value: report.components.rabt },
    );
  }

  return (
    <div className="space-y-3">
      <div className={`grid gap-2 ${showWeek ? "grid-cols-2" : "grid-cols-1"}`}>
        <PctCard label="النسبة الكلية (تراكمي)" value={report.overall} highlight />
        {showWeek && <PctCard label="نسبة الأسبوع الحالي" value={report.weekOverall} />}
      </div>
      <div className={`grid gap-2 ${compact ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"}`}>
        {items.map((item) => (
          <PctCard key={item.label} label={item.label} value={item.value} tone={item.tone} />
        ))}
      </div>
    </div>
  );
}

function PctCard({
  label,
  value,
  highlight,
  tone,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  tone?: "success" | "warning" | "destructive";
}) {
  const color = highlight
    ? "gold-text"
    : tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "destructive"
          ? "text-destructive"
          : overallPercentColorClass(value);

  return (
    <div className={`rounded-lg border p-2 ${highlight ? "bg-primary/10 border-primary/30" : "bg-card border-border"}`}>
      <div className="text-[10px] text-muted-foreground mb-0.5">{label}</div>
      <div className={`font-bold ${highlight ? "text-xl" : "text-base"} ${color}`}>
        {formatOverallPercent(value)}
      </div>
    </div>
  );
}
