import type { AcademicCalendar } from "@/lib/academic-context";
import { getElapsedSemesterDays } from "@/lib/semester-grading";
import type { DailyFaceQuotas, StudentPlanAssignment } from "@/lib/plan-types";
import type { DayEntry, GradesStore, HifzValue } from "@/lib/mock-data";
import { DAYS } from "@/lib/mock-data";

/** Fixed hifz tap → faces (not configurable per level). */
export const FIXED_HIFZ_FACES = {
  half: 0.5,
  one: 1,
  two: 2,
} as const;

export const DEFAULT_FACE_QUOTAS: Pick<DailyFaceQuotas, "daily_rabt_faces" | "daily_muraja_faces"> = {
  daily_rabt_faces: 2,
  daily_muraja_faces: 2,
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

function clampInt(n: number, fallback: number): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v < 0) return fallback;
  return Math.min(v, 999);
}

/** Only rabt/muraja daily targets are configurable; hifz uses fixed taps. */
export function normalizeTaskQuotas(
  raw: Partial<Pick<DailyFaceQuotas, "daily_rabt_faces" | "daily_muraja_faces">> | null | undefined,
): Pick<DailyFaceQuotas, "daily_rabt_faces" | "daily_muraja_faces"> {
  const d = DEFAULT_FACE_QUOTAS;
  return {
    daily_rabt_faces: clampInt(raw?.daily_rabt_faces ?? d.daily_rabt_faces, d.daily_rabt_faces),
    daily_muraja_faces: clampInt(raw?.daily_muraja_faces ?? d.daily_muraja_faces, d.daily_muraja_faces),
  };
}

/** Full quotas object for DB / assignment (hifz fields are fixed defaults). */
export function normalizeFaceQuotas(raw: Partial<DailyFaceQuotas> | null | undefined): DailyFaceQuotas {
  const tasks = normalizeTaskQuotas(raw);
  return {
    ...tasks,
    daily_hifz_faces: 1,
    faces_per_half: FIXED_HIFZ_FACES.half,
    faces_per_one: FIXED_HIFZ_FACES.one,
    faces_per_two: FIXED_HIFZ_FACES.two,
  };
}

export function faceQuotasFromAssignment(assignment: StudentPlanAssignment | null | undefined): DailyFaceQuotas {
  if (!assignment) return normalizeFaceQuotas(undefined);
  return normalizeFaceQuotas(assignment);
}

export function hifzFacesFromTap(tap: HifzValue): number {
  if (tap === "half") return FIXED_HIFZ_FACES.half;
  if (tap === "one") return FIXED_HIFZ_FACES.one;
  if (tap === "two") return FIXED_HIFZ_FACES.two;
  return 0;
}

export function facesFromDayEntry(
  entry: DayEntry | undefined,
  quotas: Pick<DailyFaceQuotas, "daily_rabt_faces" | "daily_muraja_faces">,
): { hifz: number; rabt: number; muraja: number } {
  const e = entry ?? { attendance: "", hifz: "", rabt: "", muraja: "" };
  const q = normalizeTaskQuotas(quotas);
  return {
    hifz: hifzFacesFromTap(e.hifz),
    rabt: e.rabt === "pass" ? q.daily_rabt_faces : 0,
    muraja: e.muraja === "pass" ? q.daily_muraja_faces : 0,
  };
}

export function aggregateFaceProgress(
  studentId: string,
  grades: GradesStore,
  calendar: AcademicCalendar,
  quotas: Pick<DailyFaceQuotas, "daily_rabt_faces" | "daily_muraja_faces">,
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
    const part = facesFromDayEntry(week?.days[day.dayKey], quotas);
    hifzActual += part.hifz;
    rabtActual += part.rabt;
    murajaActual += part.muraja;
  }

  const workingDays = inRange.length;
  const q = normalizeTaskQuotas(quotas);
  return {
    workingDays,
    hifzActual,
    rabtActual,
    murajaActual,
    hifzTarget: workingDays * 1,
    rabtTarget: workingDays * q.daily_rabt_faces,
    murajaTarget: workingDays * q.daily_muraja_faces,
  };
}

export function aggregateFaceProgressAllWeeks(
  studentId: string,
  grades: GradesStore,
  quotas: Pick<DailyFaceQuotas, "daily_rabt_faces" | "daily_muraja_faces">,
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
  const q = normalizeTaskQuotas(quotas);
  return {
    workingDays: dayCount,
    hifzActual,
    rabtActual,
    murajaActual,
    hifzTarget: dayCount * 1,
    rabtTarget: dayCount * q.daily_rabt_faces,
    murajaTarget: dayCount * q.daily_muraja_faces,
  };
}

import type { EducationPlan } from "@/lib/plan-types";

export function faceQuotasFromPlan(
  plan: EducationPlan,
): Pick<DailyFaceQuotas, "daily_rabt_faces" | "daily_muraja_faces"> {
  return normalizeTaskQuotas(plan);
}

export function facePct(actual: number, target: number): number {
  if (target <= 0) return actual > 0 ? 100 : 0;
  return Math.round((actual / target) * 1000) / 10;
}

export function formatFaceCount(n: number): string {
  return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1);
}
