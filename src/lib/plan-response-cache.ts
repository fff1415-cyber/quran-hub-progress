import { getToken } from "@/lib/cloud-sync";
import { getActiveComplexId } from "@/lib/tenant";
import { hasPendingSardWrites } from "@/lib/mock-data";

const key = "qshatawi_sard_queue_v2";
type PlanResponseSnapshot = { token: string | null; complex: number | undefined; queue: string | null };

/** This is a response fence, not an authorization or a persisted identity. */
export function capturePlanResponse(): PlanResponseSnapshot {
  return { token: getToken(), complex: getActiveComplexId(), queue: localStorage.getItem(key) };
}

export function assertPlanResponseCurrent(before: PlanResponseSnapshot): void {
  if (getToken() !== before.token || getActiveComplexId() !== before.complex) {
    throw new Error("تغيّرت الجلسة أثناء طلب الخطة؛ افتح استمارة الطالب للتحقق من النتيجة");
  }
}

/** A confirmed server operation can still have an older queue snapshot than current local work. */
export function applyPlanSardResponse(before: PlanResponseSnapshot, value: unknown): void {
  assertPlanResponseCurrent(before);
  if (value == null) return;
  if (!Array.isArray(value)) throw new Error("لم يؤكد الخادم قائمة السرد؛ بقيت القائمة المحفوظة دون تغيير");
  if (hasPendingSardWrites() || localStorage.getItem(key) !== before.queue) return;
  localStorage.setItem(key, JSON.stringify(value));
}
