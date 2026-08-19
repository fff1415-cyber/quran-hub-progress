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
  completedDays,
}: {
  components: ComponentPercentages;
  semesterOverall: number;
  expectedProgress: number;
  isTalqeen: boolean;
  semesterLabel: string;
  elapsedDays: number;
  totalDays: number;
  completedDays: number;
}) {
  const items: { label: string; actual: number }[] = [
    { label: "الحضور", actual: components.attendance },
  ];
  if (isTalqeen) {
    items.push({ label: "الواجب", actual: components.wajib });
  } else {
    items.push(
      { label: "الحفظ", actual: components.hifz },
      { label: "المراجعة", actual: components.muraja },
      { label: "الربط", actual: components.rabt },
    );
  }

  const timelineNote =
    totalDays > 0
      ? `أنجز ${completedDays} من ${totalDays} يوم · مر ${elapsedDays} يوم (${formatOverallPercent(expectedProgress)} من الفصل)`
      : semesterLabel;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-bold text-primary">النسب الفصلية — من بداية الفصل حتى اليوم</p>
        <p className="text-xs text-muted-foreground mt-0.5">{timelineNote}</p>
      </div>

      <div className="flex justify-center">
        <SemesterDonut
          label="النسبة الكلية"
          actual={semesterOverall}
          expected={expectedProgress}
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
          />
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
        الكحلي: إنجاز فعلي · الرصاصي الفاتح: المستوى المفترض حتى اليوم · الخلفية: أيام الفصل
      </p>
    </div>
  );
}

function SemesterDonut({
  label,
  actual,
  expected,
  size = "md",
}: {
  label: string;
  actual: number;
  expected: number;
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

  const trackStroke = "var(--border)";
  const expectedStroke = "color-mix(in oklch, var(--primary) 28%, var(--card))";
  const actualStroke = "var(--primary)";

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
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={trackStroke}
            strokeWidth={stroke}
          />
          {expectedClamped > 0 && (
            <circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={expectedStroke}
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
              stroke={actualStroke}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${actualDash} ${c}`}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
          <span
            className={`font-bold leading-none text-primary ${size === "lg" ? "text-xl" : "text-base"}`}
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
