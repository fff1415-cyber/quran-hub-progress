import type { ComponentPercentages } from "@/lib/semester-grading";
import { formatOverallPercent } from "@/lib/semester-grading";

export function StudentWeeklyPercentSummary({
  components,
  semesterOverall,
  expectedProgress,
  isTalqeen,
  semesterLabel,
  elapsedDays,
  totalDays,
}: {
  components: ComponentPercentages;
  semesterOverall: number;
  expectedProgress: number;
  isTalqeen: boolean;
  semesterLabel: string;
  elapsedDays: number;
  totalDays: number;
}) {
  const items: { label: string; actual: number; accent: "gold" | "success" | "primary" }[] = [
    { label: "الحضور", actual: components.attendance, accent: "primary" },
  ];
  if (isTalqeen) {
    items.push({ label: "الواجب", actual: components.wajib, accent: "success" });
  } else {
    items.push(
      { label: "الحفظ", actual: components.hifz, accent: "success" },
      { label: "المراجعة", actual: components.muraja, accent: "primary" },
      { label: "الربط", actual: components.rabt, accent: "primary" },
    );
  }

  const timelineNote =
    totalDays > 0
      ? `مر ${elapsedDays} من ${totalDays} يوم عمل · ${formatOverallPercent(expectedProgress)} من الفصل`
      : semesterLabel;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-bold text-primary">النسب الفصلية — من بداية الفصل</p>
        <p className="text-xs text-muted-foreground mt-0.5">{timelineNote}</p>
      </div>

      <div className="flex justify-center">
        <SemesterDonut
          label="النسبة الكلية"
          actual={semesterOverall}
          expected={expectedProgress}
          accent="gold"
          size="lg"
        />
      </div>

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <SemesterDonut
            key={item.label}
            label={item.label}
            actual={item.actual}
            expected={expectedProgress}
            accent={item.accent}
          />
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
        اللون الفاتح: المستوى المفترض حتى اليوم · اللون الغامق: إنجاز الطالب
      </p>
    </div>
  );
}

function SemesterDonut({
  label,
  actual,
  expected,
  accent = "primary",
  size = "md",
}: {
  label: string;
  actual: number;
  expected: number;
  accent?: "gold" | "success" | "primary";
  size?: "md" | "lg";
}) {
  const dim = size === "lg" ? 112 : 88;
  const r = size === "lg" ? 44 : 34;
  const stroke = size === "lg" ? 10 : 8;
  const c = 2 * Math.PI * r;
  const cap = 100;
  const actualClamped = Math.min(Math.max(actual, 0), cap);
  const expectedClamped = Math.min(Math.max(expected, 0), cap);
  const actualDash = (actualClamped / cap) * c;
  const expectedDash = (expectedClamped / cap) * c;

  const gradId = `donut-gold-strong-${label.replace(/\s/g, "")}`;

  const strongStroke =
    accent === "gold"
      ? `url(#${gradId})`
      : accent === "success"
        ? "var(--success)"
        : "var(--primary)";

  const lightStroke =
    accent === "gold"
      ? "oklch(0.78 0.13 80 / 0.35)"
      : accent === "success"
        ? "oklch(0.62 0.15 145 / 0.35)"
        : "oklch(0.45 0.08 250 / 0.28)";

  const status =
    actualClamped >= expectedClamped - 2
      ? actualClamped > expectedClamped + 2
        ? "متقدم"
        : "على المسار"
      : "متأخر";

  const statusClass =
    status === "متقدم"
      ? "text-success"
      : status === "على المسار"
        ? "text-primary"
        : "text-warning";

  const displayActual = actual % 1 === 0 ? String(Math.round(actual)) : actual.toFixed(1);

  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative" style={{ width: dim, height: dim }}>
        <svg viewBox="0 0 100 100" className="-rotate-90 w-full h-full" aria-hidden>
          {accent === "gold" && (
            <defs>
              <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="oklch(0.78 0.13 80)" />
                <stop offset="100%" stopColor="oklch(0.88 0.09 85)" />
              </linearGradient>
            </defs>
          )}
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="oklch(0.22 0.03 250)"
            strokeWidth={stroke}
          />
          {expectedClamped > 0 && (
            <circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={lightStroke}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${expectedDash} ${c}`}
            />
          )}
          {actualClamped > 0 && (
            <circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={strongStroke}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${actualDash} ${c}`}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
          <span
            className={`font-bold leading-none ${size === "lg" ? "text-xl gold-text" : "text-base"} ${
              accent === "gold" ? "gold-text" : accent === "success" ? "text-success" : "text-primary"
            }`}
          >
            {displayActual}%
          </span>
        </div>
      </div>
      <div className="text-xs font-bold text-foreground mt-2">{label}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">
        المفترض {formatOverallPercent(expected)}
      </div>
      <div className={`text-[10px] font-bold mt-0.5 ${statusClass}`}>{status}</div>
    </div>
  );
}
