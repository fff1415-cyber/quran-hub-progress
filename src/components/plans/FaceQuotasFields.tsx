import type { DailyFaceQuotas } from "@/lib/plan-types";
import { Input } from "@/components/ui/input";

interface FaceQuotasFieldsProps {
  value: DailyFaceQuotas;
  onChange: (v: DailyFaceQuotas) => void;
  showTapMapping?: boolean;
  compact?: boolean;
}

export function FaceQuotasFields({
  value,
  onChange,
  showTapMapping = true,
  compact,
}: FaceQuotasFieldsProps) {
  const set = (key: keyof DailyFaceQuotas, raw: string) => {
    onChange({ ...value, [key]: Math.max(0, Number(raw) || 0) });
  };

  const field = (key: keyof DailyFaceQuotas, label: string) => (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      <Input
        type="number"
        min={0}
        max={999}
        value={value[key]}
        onChange={(e) => set(key, e.target.value)}
        className={compact ? "h-8 text-sm" : undefined}
      />
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        الأهداف اليومية (أوجه) — تُنسخ من الخطة ويمكن تخصيصها لكل طالب
      </p>
      <div className={`grid gap-3 ${compact ? "grid-cols-3" : "sm:grid-cols-3"}`}>
        {field("daily_hifz_faces", "أوجه الحفظ / يوم")}
        {field("daily_rabt_faces", "أوجه الربط / يوم")}
        {field("daily_muraja_faces", "أوجه المراجعة / يوم")}
      </div>
      {showTapMapping && (
        <>
          <p className="text-xs text-muted-foreground pt-1">
            تحويل ضغطة الحفظ (½ / 1 / 2) إلى أوجه
          </p>
          <div className={`grid gap-3 ${compact ? "grid-cols-3" : "sm:grid-cols-3"}`}>
            {field("faces_per_half", "½ = … وجه")}
            {field("faces_per_one", "1 = … وجه")}
            {field("faces_per_two", "2 = … وجه")}
          </div>
        </>
      )}
    </div>
  );
}
