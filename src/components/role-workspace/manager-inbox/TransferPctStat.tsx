import { formatOverallPercent } from "@/lib/semester-grading";

export function TransferPctStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "destructive" | "warning" | "primary" | "success";
}) {
  const colors: Record<string, string> = {
    destructive: "bg-destructive/10 text-destructive border-destructive/30",
    warning: "bg-warning/10 text-warning border-warning/30",
    primary: "bg-primary/10 text-primary border-primary/30",
    success: "bg-success/10 text-success border-success/30",
  };
  return (
    <div className={`rounded-lg border p-2 text-center text-xs ${colors[tone]}`}>
      <div className="text-base font-bold">{formatOverallPercent(value)}</div>
      <div className="opacity-80">{label}</div>
    </div>
  );
}
