import { cn } from "@/lib/utils";
import type { KioskCheckInStatus } from "@/lib/kiosk-service";

type Props = {
  status: KioskCheckInStatus;
  message: string;
  studentName?: string;
  visible: boolean;
};

const STATUS_STYLES: Record<
  KioskCheckInStatus,
  { ring: string; bg: string; text: string; label: string }
> = {
  success: {
    ring: "ring-emerald-400/60",
    bg: "bg-emerald-500/15",
    text: "text-emerald-700",
    label: "تم التحضير",
  },
  already_checked_in: {
    ring: "ring-amber-400/60",
    bg: "bg-amber-500/15",
    text: "text-amber-800",
    label: "مسجّل مسبقاً",
  },
  not_working_day: {
    ring: "ring-amber-400/60",
    bg: "bg-amber-500/15",
    text: "text-amber-800",
    label: "يوم غير دراسي",
  },
  invalid_qr: {
    ring: "ring-red-400/60",
    bg: "bg-red-500/15",
    text: "text-red-700",
    label: "رمز غير صالح",
  },
  error: {
    ring: "ring-red-400/60",
    bg: "bg-red-500/15",
    text: "text-red-700",
    label: "خطأ",
  },
};

export function KioskFeedback({ status, message, studentName, visible }: Props) {
  if (!visible) {
    return null;
  }

  const style = STATUS_STYLES[status];

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/35 backdrop-blur-sm animate-in fade-in duration-200",
      )}
      aria-live="assertive"
    >
      <div
        className={cn(
          "max-w-lg w-full rounded-3xl p-8 text-center shadow-2xl ring-4",
          style.ring,
          style.bg,
        )}
      >
        <p className={cn("text-sm font-semibold tracking-wide mb-2", style.text)}>{style.label}</p>
        {studentName ? (
          <h2 className={cn("text-3xl md:text-4xl font-bold mb-3", style.text)}>{studentName}</h2>
        ) : null}
        <p className={cn("text-lg md:text-xl font-medium", style.text)}>{message}</p>
      </div>
    </div>
  );
}
