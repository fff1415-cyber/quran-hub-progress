import type { AcademicCalendar } from "@/lib/academic-context";
import { getElapsedSemesterDays } from "@/lib/semester-grading";
import type { DailyFaceQuotas, StudentPlanAssignment } from "@/lib/plan-types";
import type { DayEntry, GradesStore, HifzValue } from "@/lib/mock-data";
import { DAYS } from "@/lib/mock-data";

export const DEFAULT_FACE_QUOTAS: DailyFaceQuotas = {
  daily_hifz_faces: 2,
  daily_rabt_faces: 2,
  daily_muraja_faces: 2,
  faces_per_half: 1,
  faces_per_one: 2,
  faces_per_two: 4,
};

export interface FaceProgressSummary {
  workingDays: number;
  hifzActual: number;
  rabtActual: number;
  murajaActual: number;
  hifzTarget: number;
  rabtTarget: number;
  murajaTarget: number;
}

function clampFace(n: number, fallback: number): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v < 0) return fallback;
  return Math.min(v, 999);
}

export function normalizeFaceQuotas(raw: Partial<DailyFaceQuotas> | null | undefined): DailyFaceQuotas {
  const d = DEFAULT_FACE_QUOTAS;
  return {
    daily_hifz_faces: clampFace(raw?.daily_hifz_faces ?? d.daily_hifz_faces, d.daily_hifz_faces),
    daily_rabt_faces: clampFace(raw?.daily_rabt_faces ?? d.daily_rabt_faces, d.daily_rabt_faces),
    daily_muraja_faces: clampFace(raw?.daily_muraja_faces ?? d.daily_muraja_faces, d.daily_muraja_faces),
    faces_per_half: clampFace(raw?.faces_per_half ?? d.faces_per_half, d.faces_per_half),
    faces_per_one: clampFace(raw?.faces_per_one ?? d.faces_per_one, d.faces_per_one),
    faces_per_two: clampFace(raw?.faces_per_two ?? d.faces_per_two, d.faces_per_two),
  };
}

export function faceQuotasFromPlan(plan: Partial<DailyFaceQuotas> | null | undefined): DailyFaceQuotas {
  return normalizeFaceQuotas(plan);
}

export function faceQuotasFromAssignment(assignment: StudentPlanAssignment | null | undefined): DailyFaceQuotas {
  if (!assignment) return { ...DEFAULT_FACE_QUOTAS };
  return normalizeFaceQuotas(assignment);
}

export function hifzFacesFromTap(tap: HifzValue, quotas: DailyFaceQuotas): number {
  if (tap === "half") return quotas.faces_per_half;
  if (tap === "one") return quotas.faces_per_one;
  if (tap === "two") return quotas.faces_per_two;
  return 0;
}

export function facesFromDayEntry(
  entry: DayEntry | undefined,
  quotas: DailyFaceQuotas,
): { hifz: number; rabt: number; muraja: number } {
  const e = entry ?? { attendance: "", hifz: "", rabt: "", muraja: "" };
  return {
    hifz: hifzFacesFromTap(e.hifz, quotas),
    rabt: e.rabt === "pass" ? quotas.daily_rabt_faces : 0,
    muraja: e.muraja === "pass" ? quotas.daily_muraja_faces : 0,
  };
}

/** Sum faces from grades between fromIso and toIso (inclusive). */
export function aggregateFaceProgress(
  studentId: string,
  grades: GradesStore,
  calendar: AcademicCalendar,
  quotas: DailyFaceQuotas,
  fromIso?: string,
  toIso?: string,
): FaceProgressSummary {
  const days = getElapsedSemesterDays(calendar);
  const from = fromIso ?? (days[0]?.iso ?? calendar.operationalDate);
  const to = toIso ?? calendar.operationalDate;

  const inRange = days.filter((d) => d.iso >= from && d.iso <= to);
  let hifzActual = 0;
  let rabtActual = 0;
  let murajaActual = 0;

  for (const day of inRange) {
    const week = grades[studentId]?.[day.weekNumber];
    const entry = week?.days[day.dayKey];
    const part = facesFromDayEntry(entry, quotas);
    hifzActual += part.hifz;
    rabtActual += part.rabt;
    murajaActual += part.muraja;
  }

  const workingDays = inRange.length;
  const q = normalizeFaceQuotas(quotas);
  return {
    workingDays,
    hifzActual,
    rabtActual,
    murajaActual,
    hifzTarget: workingDays * q.daily_hifz_faces,
    rabtTarget: workingDays * q.daily_rabt_faces,
    murajaTarget: workingDays * q.daily_muraja_faces,
  };
}

/** Fallback when no calendar: all weeks in grades store. */
export function aggregateFaceProgressAllWeeks(
  studentId: string,
  grades: GradesStore,
  quotas: DailyFaceQuotas,
): FaceProgressSummary {
  let hifzActual = 0;
  let rabtActual = 0;
  let murajaActual = 0;
  let dayCount = 0;
  const weeks = grades[studentId] ?? {};
  for (const week of Object.values(weeks)) {
    for (const d of DAYS) {
      const entry = week.days[d.key];
      if (!entry) continue;
      const hasData = !!(entry.hifz || entry.rabt || entry.muraja || entry.attendance);
      if (!hasData) continue;
      dayCount++;
      const part = facesFromDayEntry(entry, quotas);
      hifzActual += part.hifz;
      rabtActual += part.rabt;
      murajaActual += part.muraja;
    }
  }
  const q = normalizeFaceQuotas(quotas);
  return {
    workingDays: dayCount,
    hifzActual,
    rabtActual,
    murajaActual,
    hifzTarget: dayCount * q.daily_hifz_faces,
    rabtTarget: dayCount * q.daily_rabt_faces,
    murajaTarget: dayCount * q.daily_muraja_faces,
  };
}

export function facePct(actual: number, target: number): number {
  if (target <= 0) return actual > 0 ? 100 : 0;
  return Math.round((actual / target) * 1000) / 10;
}

export function formatFaceCount(n: number): string {
  return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1);
}
