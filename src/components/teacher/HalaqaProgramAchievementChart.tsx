import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import type { AcademicCalendar } from "@/lib/academic-context";
import { formatWeekOptionLabel, getSelectableWeeks } from "@/lib/academic-context";
import { buildCombinedProgramTotals } from "@/lib/halaqa-program-combined-totals";
import type { HalaqaProgram } from "@/lib/halaqa-programs";
import { loadProgramGrades } from "@/lib/halaqa-programs";
import { filterStandardPrograms } from "@/lib/scientific-grades-program";
import {
  enabledScientificFields,
  loadScientificConfig,
  loadScientificData,
  SCIENTIFIC_GRADES_CHANGED_EVENT,
  type ScientificGradeField,
} from "@/lib/scientific-grades";
import { loadStudents } from "@/lib/mock-data";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Download, ImageIcon } from "lucide-react";
import { toast } from "sonner";

type Props = {
  halaqaId: number;
  halaqaName: string;
  programs: HalaqaProgram[];
  grades: ReturnType<typeof loadProgramGrades>;
  students: ReturnType<typeof loadStudents>;
  weekNum: number;
  calendar: AcademicCalendar;
  selectableWeeks: ReturnType<typeof getSelectableWeeks>;
  workingDayKeys: string[];
  onWeekChange: (n: number) => void;
};

type ChartRow = {
  id: string;
  name: string;
  percent: number;
  earned: number;
  maxPossible: number;
  hasData: boolean;
  color: string;
};

const DARK_GREEN = { r: 21, g: 128, b: 61 };
const LIGHT_GREEN = { r: 134, g: 239, b: 172 };
const RED = { r: 220, g: 38, b: 38 };

function lerp(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}

function lerpColor(
  from: { r: number; g: number; b: number },
  to: { r: number; g: number; b: number },
  t: number,
) {
  const r = lerp(from.r, to.r, t);
  const g = lerp(from.g, to.g, t);
  const b = lerp(from.b, to.b, t);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Vertical student name under each bar — pivot below axis so labels don't overlap bars. */
function VerticalNameTick({
  x,
  y,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
}) {
  if (x == null || y == null || !payload?.value) return null;
  const pivotY = y + 8;
  return (
    <text
      x={x}
      y={pivotY}
      fill="currentColor"
      fontSize={11}
      textAnchor="start"
      transform={`rotate(-90, ${x}, ${pivotY})`}
    >
      {payload.value}
    </text>
  );
}

/** أخضر غامق للأفضل → أخضر فاتح في الوسط → أحمر للأضعف */
export function rankBarColor(rankIndex: number, total: number): string {
  if (total <= 1) return lerpColor(DARK_GREEN, DARK_GREEN, 0);
  const t = rankIndex / (total - 1);
  if (t <= 0.5) return lerpColor(DARK_GREEN, LIGHT_GREEN, t * 2);
  return lerpColor(LIGHT_GREEN, RED, (t - 0.5) * 2);
}

function buildChartRows(
  students: ReturnType<typeof loadStudents>,
  getTotals: (studentId: string) => ReturnType<typeof buildCombinedProgramTotals>,
): ChartRow[] {
  const ranked = students
    .map((s) => {
      const totals = getTotals(s.id);
      return {
        id: s.id,
        name: s.name,
        percent: totals.hasPercent ? totals.percent : 0,
        earned: totals.earned,
        maxPossible: totals.maxPossible,
        hasData: totals.hasData,
      };
    })
    .sort((a, b) => b.percent - a.percent || b.earned - a.earned || a.name.localeCompare(b.name, "ar"));

  return ranked.map((row, index) => ({
    ...row,
    color: rankBarColor(index, ranked.length),
  }));
}

async function downloadSvgAsPng(container: HTMLElement, filename: string) {
  const svg = container.querySelector("svg.recharts-surface");
  if (!svg) {
    toast.error("تعذّر العثور على الرسم — جرّب بعد ظهور الأعمدة");
    return;
  }

  const rect = svg.getBoundingClientRect();
  const width = Math.max(1, Math.ceil(rect.width || container.clientWidth));
  const height = Math.max(1, Math.ceil(rect.height || container.clientHeight));
  if (width <= 1 || height <= 1) {
    toast.error("الرسم غير جاهز بعد — انتظر ثانية ثم أعد المحاولة");
    return;
  }
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  if (!clone.getAttribute("xmlns")) {
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }

  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", "100%");
  bg.setAttribute("height", "100%");
  bg.setAttribute("fill", "#ffffff");
  clone.insertBefore(bg, clone.firstChild);

  const source = new XMLSerializer().serializeToString(clone);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;

  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas"));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("blob"));
          return;
        }
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
        resolve();
      }, "image/png");
    };
    img.onerror = () => reject(new Error("image"));
    img.src = url;
  });
}

export function HalaqaProgramAchievementChart({
  halaqaId,
  halaqaName,
  programs,
  grades,
  students,
  weekNum,
  calendar,
  selectableWeeks,
  workingDayKeys,
  onWeekChange,
}: Props) {
  const [view, setView] = useState<"weekly" | "cumulative">("weekly");
  const [sciDataVersion, setSciDataVersion] = useState(0);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bump = () => setSciDataVersion((v) => v + 1);
    window.addEventListener(SCIENTIFIC_GRADES_CHANGED_EVENT, bump);
    return () => window.removeEventListener(SCIENTIFIC_GRADES_CHANGED_EVENT, bump);
  }, []);

  const standardPrograms = useMemo(() => filterStandardPrograms(programs), [programs]);
  const sciConfig = useMemo(() => loadScientificConfig(halaqaId), [halaqaId, sciDataVersion]);
  const sciFields = useMemo(
    (): ScientificGradeField[] => enabledScientificFields(sciConfig.fields),
    [sciConfig.fields, sciDataVersion],
  );
  const sciData = useMemo(
    () => loadScientificData(halaqaId),
    [halaqaId, sciDataVersion],
  );

  const cumulativeWeekNums = useMemo(
    () => selectableWeeks.filter((w) => w.week_number <= weekNum).map((w) => w.week_number),
    [selectableWeeks, weekNum],
  );

  const getTotals = useCallback(
    (studentId: string) => {
      const weekNums = view === "weekly" ? [weekNum] : cumulativeWeekNums;
      return buildCombinedProgramTotals(
        standardPrograms,
        grades,
        studentId,
        weekNums,
        sciData,
        sciFields,
        workingDayKeys,
        sciConfig,
      );
    },
    [
      view,
      weekNum,
      cumulativeWeekNums,
      standardPrograms,
      grades,
      sciData,
      sciFields,
      workingDayKeys,
      sciConfig,
    ],
  );

  const chartData = useMemo(() => buildChartRows(students, getTotals), [students, getTotals]);

  const nameLabelArea = useMemo(() => {
    const longest = chartData.reduce((max, row) => Math.max(max, row.name.length), 0);
    return Math.min(140, Math.max(72, longest * 7 + 16));
  }, [chartData]);

  const chartConfig = {
    percent: { label: "النسبة", color: "hsl(var(--primary))" },
  };

  const viewLabel = view === "weekly" ? `أسبوع ${weekNum}` : `تراكمي حتى الأسبوع ${weekNum}`;
  const exportFilename = `${halaqaName}-انجاز-${view === "weekly" ? `اسبوع-${weekNum}` : `تراكمي-${weekNum}`}.png`;

  const handleExport = async () => {
    if (!chartRef.current) return;
    try {
      await downloadSvgAsPng(chartRef.current, exportFilename);
      toast.success("تم تنزيل صورة الرسم");
    } catch {
      toast.error("تعذّر تصدير الصورة");
    }
  };

  if (programs.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center text-muted-foreground">
        <p>لا توجد برامج — أنشئ برامجاً أولاً لعرض الإنجاز</p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(weekNum)} onValueChange={(v) => onWeekChange(Number(v))}>
            <SelectTrigger className="w-[min(100%,320px)] font-bold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {selectableWeeks.map((wk) => (
                <SelectItem key={wk.week_number} value={String(wk.week_number)}>
                  {formatWeekOptionLabel(wk, wk.week_number === calendar.currentWeekNumber)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setView("weekly")}
              className={cn(
                "px-3 py-2 text-sm font-bold transition-colors",
                view === "weekly" ? "bg-primary text-primary-foreground" : "hover:bg-secondary",
              )}
            >
              أسبوعي
            </button>
            <button
              type="button"
              onClick={() => setView("cumulative")}
              className={cn(
                "px-3 py-2 text-sm font-bold transition-colors border-r border-border",
                view === "cumulative" ? "bg-primary text-primary-foreground" : "hover:bg-secondary",
              )}
            >
              تراكمي
            </button>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" className="font-bold gap-1" onClick={handleExport}>
          <Download className="w-4 h-4" />
          تنزيل صورة
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        إنجاز الطلاب — {viewLabel} · مرتّب من الأعلى إلى الأدنى · أخضر غامق (الأفضل) → أخضر فاتح → أحمر (الأضعف)
      </p>

      {students.length === 0 ? (
        <p className="text-center py-12 text-muted-foreground text-sm">لا يوجد طلاب</p>
      ) : chartData.every((row) => !row.hasData && row.maxPossible === 0) ? (
        <div className="text-center py-12 text-muted-foreground">
          <ImageIcon className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">لا توجد بيانات إنجاز بعد لهذه الفترة</p>
        </div>
      ) : (
        <div
          ref={chartRef}
          className="w-full"
          style={{ height: Math.min(560, Math.max(380, 280 + nameLabelArea)) }}
        >
          <ChartContainer
            config={chartConfig}
            className="!aspect-auto h-full w-full [&_.recharts-cartesian-axis-tick_text]:fill-foreground [&_.recharts-cartesian-axis-tick_text]:text-[11px] [&_.recharts-responsive-container]:!h-full"
          >
          <BarChart
            data={chartData}
            margin={{ top: 12, right: 8, left: 0, bottom: 8 }}
            accessibilityLayer
          >
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                interval={0}
                height={nameLabelArea}
                tick={VerticalNameTick}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                width={40}
              />
              <ChartTooltip
                cursor={{ fill: "hsl(var(--muted) / 0.35)" }}
                content={
                  <ChartTooltipContent
                    formatter={(value, _name, item) => {
                      const row = item.payload as ChartRow;
                      return (
                        <div className="flex flex-col gap-0.5 text-right">
                          <span className="font-bold">{row.percent}%</span>
                          <span className="text-muted-foreground text-xs">
                            {row.hasData ? `${row.earned} / ${row.maxPossible}` : "لا بيانات بعد"}
                          </span>
                        </div>
                      );
                    }}
                    labelFormatter={(label) => String(label)}
                  />
                }
              />
              <Bar
                dataKey="percent"
                radius={[6, 6, 0, 0]}
                maxBarSize={56}
                isAnimationActive={false}
                minPointSize={3}
              >
                {chartData.map((row) => (
                  <Cell key={row.id} fill={row.color} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground pt-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: lerpColor(DARK_GREEN, DARK_GREEN, 0) }} />
          الأفضل
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: lerpColor(DARK_GREEN, LIGHT_GREEN, 1) }} />
          متوسط
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: lerpColor(LIGHT_GREEN, RED, 1) }} />
          الأضعف
        </span>
      </div>
    </div>
  );
}
