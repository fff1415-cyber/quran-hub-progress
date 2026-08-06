import type { DailyFaceQuotas, PlanTrack } from "@/lib/plan-types";
import { TRACK_FACE_QUOTAS, resolveFaceQuotas } from "@/lib/plan-daily-faces";
import { trackLabel } from "@/lib/plan-translator";

interface FaceQuotasFieldsProps {
  track: PlanTrack;
  compact?: boolean;
}

/** Read-only — daily face quotas are fixed by track (option A). */
export function FaceQuotasFields({ track, compact }: FaceQuotasFieldsProps) {
  const q: DailyFaceQuotas = resolveFaceQuotas(track);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        حصص يومية ثابتة لمسار {trackLabel(track)} — لا تُعدَّل يدوياً
      </p>
      <div className={`grid gap-3 sm:grid-cols-3 ${compact ? "text-sm" : ""}`}>
        <QuotaPill label="حفظ/يوم" value={q.daily_hifz_faces} />
        <QuotaPill label="ربط/يوم" value={q.daily_rabt_faces} />
        <QuotaPill label="مراجعة/يوم" value={q.daily_muraja_faces} />
      </div>
      <p className="text-[10px] text-muted-foreground">
        مستهدف الترم = الحصة × أيام العمل · فضي: {TRACK_FACE_QUOTAS.silver.daily_hifz_faces}/{TRACK_FACE_QUOTAS.silver.daily_rabt_faces}/{TRACK_FACE_QUOTAS.silver.daily_muraja_faces} · ذهبي: {TRACK_FACE_QUOTAS.gold.daily_hifz_faces}/{TRACK_FACE_QUOTAS.gold.daily_rabt_faces}/{TRACK_FACE_QUOTAS.gold.daily_muraja_faces}
      </p>
    </div>
  );
}

function QuotaPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-center">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-bold text-primary">{value % 1 === 0 ? value : value.toFixed(1)}</div>
    </div>
  );
}
