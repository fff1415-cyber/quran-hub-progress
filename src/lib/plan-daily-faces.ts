import type { AcademicCalendar } from "@/lib/academic-context";
import { getElapsedSemesterDays, getTotalSemesterWorkingDays } from "@/lib/semester-grading";
import type { DailyFaceQuotas, PlanTrack, StudentPlanAssignment } from "@/lib/plan-types";
import type { DayEntry, GradesStore, HifzValue, Student } from "@/lib/mock-data";
import { sumWeekCompensationFaces } from "@/lib/mock-data";
import type { EducationPlan } from "@/lib/plan-types";

/** Fixed hifz tap → faces (not configurable per level). */
export const FIXED_HIFZ_FACES = {
  half: 0.5,
  one: 1,
  two: 2,
} as const;

/** Official daily face quotas by track (option A — fixed, not per-plan editable). */
export const TRACK_FACE_QUOTAS: Record<
  PlanTrack,
  Pick<DailyFaceQuotas, "daily_hifz_faces" | "daily_rabt_faces" | "daily_muraja_faces">
> = {
  silver: { daily_hifz_faces: 0.5, daily_rabt_faces: 10, daily_muraja_faces: 10 },
  gold: { daily_hifz_faces: 1, daily_rabt_faces: 20, daily_muraja_faces: 20 },
};

/** @deprecated use TRACK_FACE_QUOTAS — kept for legacy imports */
export const DEFAULT_FACE_QUOTAS: Pick<DailyFaceQuotas, "daily_rabt_faces" | "daily_muraja_faces"> = {
  daily_rabt_faces: TRACK_FACE_QUOTAS.gold.daily_rabt_faces,
  daily_muraja_faces: TRACK_FACE_QUOTAS.gold.daily_muraja_faces,
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

/** Single source of truth — all face targets derive from student track. */
export function resolveFaceQuotas(levelType: PlanTrack | Student["levelType"]): DailyFaceQuotas {
  const t = TRACK_FACE_QUOTAS[levelType];
  return {
    daily_hifz_faces: t.daily_hifz_faces,
    daily_rabt_faces: t.daily_rabt_faces,
    daily_muraja_faces: t.daily_muraja_faces,
    faces_per_half: FIXED_HIFZ_FACES.half,
    faces_per_one: FIXED_HIFZ_FACES.one,
    faces_per_two: FIXED_HIFZ_FACES.two,
  };
}

export function termFaceTargets(
  quotas: Pick<DailyFaceQuotas, "daily_hifz_faces" | "daily_rabt_faces" | "daily_muraja_faces">,
  termDays: number,
): Pick<FaceProgressSummary, "hifzTarget" | "rabtTarget" | "murajaTarget"> {
  return {
    hifzTarget: termDays * quotas.daily_hifz_faces,
    rabtTarget: termDays * quotas.daily_rabt_faces,
    murajaTarget: termDays * quotas.daily_muraja_faces,
  };
}

function clampInt(n: number, fallback: number): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v < 0) return fallback;
  return Math.min(v, 999);
}

/** Legacy normalizer — prefer resolveFaceQuotas(track). */
export function normalizeTaskQuotas(
  raw: Partial<Pick<DailyFaceQuotas, "daily_rabt_faces" | "daily_muraja_faces">> | null | undefined,
  track?: PlanTrack,
): Pick<DailyFaceQuotas, "daily_rabt_faces" | "daily_muraja_faces"> {
  if (track) {
    const t = TRACK_FACE_QUOTAS[track];
    return { daily_rabt_faces: t.daily_rabt_faces, daily_muraja_faces: t.daily_muraja_faces };
  }
  const d = DEFAULT_FACE_QUOTAS;
  return {
    daily_rabt_faces: clampInt(raw?.daily_rabt_faces ?? d.daily_rabt_faces, d.daily_rabt_faces),
    daily_muraja_faces: clampInt(raw?.daily_muraja_faces ?? d.daily_muraja_faces, d.daily_muraja_faces),
  };
}

export function normalizeFaceQuotas(
  raw: Partial<DailyFaceQuotas> | null | undefined,
  track?: PlanTrack,
): DailyFaceQuotas {
  if (track) return resolveFaceQuotas(track);
  const tasks = normalizeTaskQuotas(raw);
  return {
    ...tasks,
    daily_hifz_faces: TRACK_FACE_QUOTAS.gold.daily_hifz_faces,
    faces_per_half: FIXED_HIFZ_FACES.half,
    faces_per_one: FIXED_HIFZ_FACES.one,
    faces_per_two: FIXED_HIFZ_FACES.two,
  };
}

/** @deprecated Pass levelType via resolveFaceQuotas — assignment DB values are not authoritative. */
export function faceQuotasFromAssignment(
  assignment: StudentPlanAssignment | null | undefined,
  levelType?: PlanTrack | Student["levelType"],
): DailyFaceQuotas {
  if (levelType) return resolveFaceQuotas(levelType);
  return normalizeFaceQuotas(assignment ?? undefined);
}

export function faceQuotasFromPlan(plan: EducationPlan): DailyFaceQuotas {
  return resolveFaceQuotas(plan.track);
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
  return {
    hifz: hifzFacesFromTap(e.hifz),
    rabt: e.rabt === "pass" ? quotas.daily_rabt_faces : 0,
    muraja: e.muraja === "pass" ? quotas.daily_muraja_faces : 0,
  };
}

function sumFacesFromAllGradeEntries(
  studentId: string,
  grades: GradesStore,
  quotas: DailyFaceQuotas,
): Pick<FaceProgressSummary, "hifzActual" | "rabtActual" | "murajaActual"> {
  let hifzActual = 0;
  let rabtActual = 0;
  let murajaActual = 0;
  const weeks = grades[studentId] ?? {};

  for (const week of Object.values(weeks)) {
    hifzActual += sumWeekCompensationFaces(week);
    murajaActual += week.compensationMurajaFaces ?? 0;
    for (const entry of Object.values(week.days ?? {})) {
      const part = facesFromDayEntry(entry, quotas);
      hifzActual += part.hifz;
      rabtActual += part.rabt;
      murajaActual += part.muraja;
    }
  }

  return { hifzActual, rabtActual, murajaActual };
}

function periodFaceTargets(quotas: DailyFaceQuotas, dayCount: number) {
  return termFaceTargets(quotas, dayCount);
}

export function aggregateFaceProgress(
  studentId: string,
  grades: GradesStore,
  calendar: AcademicCalendar,
  quotas: DailyFaceQuotas,
  fromIso?: string,
  toIso?: string,
): FaceProgressSummary {
  const days = getElapsedSemesterDays(calendar);

  if (days.length === 0) {
    return aggregateFaceProgressAllWeeks(studentId, grades, quotas);
  }

  const from = fromIso ?? (days[0]?.iso ?? calendar.operationalDate);
  const to = toIso ?? calendar.operationalDate;
  const inRange = days.filter((d) => d.iso >= from && d.iso <= to);
  const workingDays = inRange.length;

  const useFullSemesterRange =
    !fromIso &&
    !toIso &&
    from === (days[0]?.iso ?? from) &&
    to === calendar.operationalDate;

  if (useFullSemesterRange) {
    const elapsed = getElapsedSemesterDays(calendar);
    let hifzActual = 0;
    let rabtActual = 0;
    let murajaActual = 0;
    const weekNumsSeen = new Set<number>();

    for (const day of elapsed) {
      const week = grades[studentId]?.[day.weekNumber];
      const part = facesFromDayEntry(week?.days[day.dayKey], quotas);
      hifzActual += part.hifz;
      rabtActual += part.rabt;
      murajaActual += part.muraja;
      weekNumsSeen.add(day.weekNumber);
    }

    for (const wn of weekNumsSeen) {
      const week = grades[studentId]?.[wn];
      if (!week) continue;
      hifzActual += sumWeekCompensationFaces(week);
      murajaActual += week.compensationMurajaFaces ?? 0;
    }

    const termDays = getTotalSemesterWorkingDays(calendar);
    return {
      workingDays: elapsed.length,
      hifzActual,
      rabtActual,
      murajaActual,
      ...termFaceTargets(quotas, termDays),
    };
  }

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

  const countedDayKeys = new Set(inRange.map((d) => `${d.weekNumber}:${d.dayKey}`));
  const weekNumsInRange = new Set(inRange.map((d) => d.weekNumber));

  for (const wn of weekNumsInRange) {
    const week = grades[studentId]?.[wn];
    if (!week?.days) continue;
    hifzActual += sumWeekCompensationFaces(week);
    murajaActual += week.compensationMurajaFaces ?? 0;
    for (const [dayKey, entry] of Object.entries(week.days)) {
      if (countedDayKeys.has(`${wn}:${dayKey}`)) continue;
      const part = facesFromDayEntry(entry, quotas);
      if (!part.hifz && !part.rabt && !part.muraja) continue;
      hifzActual += part.hifz;
      rabtActual += part.rabt;
      murajaActual += part.muraja;
    }
  }

  return {
    workingDays,
    hifzActual,
    rabtActual,
    murajaActual,
    ...periodFaceTargets(quotas, workingDays),
  };
}

export function aggregateFaceProgressAllWeeks(
  studentId: string,
  grades: GradesStore,
  quotas: DailyFaceQuotas,
): FaceProgressSummary {
  const totals = sumFacesFromAllGradeEntries(studentId, grades, quotas);
  let dayCount = 0;
  const weeks = grades[studentId] ?? {};
  for (const week of Object.values(weeks)) {
    for (const entry of Object.values(week.days ?? {})) {
      if (!entry) continue;
      if (entry.hifz || entry.rabt || entry.muraja || entry.attendance) dayCount += 1;
    }
  }
  return {
    workingDays: dayCount,
    ...totals,
    ...periodFaceTargets(quotas, dayCount),
  };
}

export function facePct(actual: number, target: number): number {
  if (target <= 0) return actual > 0 ? 100 : 0;
  return Math.round((actual / target) * 1000) / 10;
}

export function formatFaceCount(n: number): string {
  return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1);
}
