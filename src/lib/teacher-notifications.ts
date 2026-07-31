import { pushNotification } from "@/lib/mock-data";

/** Notify the teacher of a student's halaqa about plan/sard movements. */
export function notifyTeacherHalaqa(
  halaqaId: number,
  message: string,
  type: "sard" | "info" | "transfer" = "sard",
): void {
  pushNotification({
    message,
    type,
    targetHalaqaId: halaqaId,
  });
}

export function daysSinceIso(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export function daysSinceLabel(iso: string): string {
  const d = daysSinceIso(iso);
  if (d === 0) return "مخلّص اليوم";
  if (d === 1) return "مخلّص منذ يوم";
  if (d === 2) return "مخلّص منذ يومين";
  return `مخلّص منذ ${d} أيام`;
}
