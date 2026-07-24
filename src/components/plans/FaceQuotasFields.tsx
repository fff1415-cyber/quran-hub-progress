import type { DailyFaceQuotas } from "@/lib/plan-types";
import { Input } from "@/components/ui/input";

interface FaceQuotasFieldsProps {
  value: Pick<DailyFaceQuotas, "daily_rabt_faces" | "daily_muraja_faces">;
  onChange: (v: Pick<DailyFaceQuotas, "daily_rabt_faces" | "daily_muraja_faces">) => void;
  compact?: boolean;
}

export function FaceQuotasFields({ value, onChange, compact }: FaceQuotasFieldsProps) {
  const set = (key: "daily_rabt_faces" | "daily_muraja_faces", raw: string) => {
    onChange({ ...value, [key]: Math.max(0, Number(raw) || 0) });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        أوجه الربط والمراجعة يومياً — الحفظ ثابت (½=نصف وجه · 1=وجه · 2=وجهين)
      </p>
      <div className={`grid gap-3 sm:grid-cols-2 ${compact ? "" : ""}`}>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">أوجه الربط / يوم</label>
          <Input
            type="number"
            min={0}
            max={999}
            value={value.daily_rabt_faces}
            onChange={(e) => set("daily_rabt_faces", e.target.value)}
            className={compact ? "h-8 text-sm" : undefined}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">أوجه المراجعة / يوم</label>
          <Input
            type="number"
            min={0}
            max={999}
            value={value.daily_muraja_faces}
            onChange={(e) => set("daily_muraja_faces", e.target.value)}
            className={compact ? "h-8 text-sm" : undefined}
          />
        </div>
      </div>
    </div>
  );
}
