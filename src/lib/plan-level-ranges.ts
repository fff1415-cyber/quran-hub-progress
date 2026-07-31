import type { PlanTrack } from "@/lib/plan-types";
import { planLevelNumber } from "@/lib/plan-excel-import";
import type { EducationPlan } from "@/lib/plan-types";

/** Institute levels (المستوى) — ordered progression. */
export const INSTITUTE_LEVELS = [
  "التأهيل",
  "النجباء",
  "الفرسان",
  "الحفاظ",
  "الخريجين",
] as const;

export type InstituteLevel = (typeof INSTITUTE_LEVELS)[number];

export interface LevelRange {
  level: InstituteLevel;
  from: number;
  to: number;
}

export const SILVER_PHASE_RANGES: LevelRange[] = [
  { level: "التأهيل", from: 1, to: 8 },
  { level: "النجباء", from: 9, to: 20 },
  { level: "الفرسان", from: 21, to: 32 },
  { level: "الحفاظ", from: 33, to: 44 },
  { level: "الخريجين", from: 45, to: 60 },
];

export const GOLD_PHASE_RANGES: LevelRange[] = [
  { level: "التأهيل", from: 1, to: 4 },
  { level: "النجباء", from: 5, to: 10 },
  { level: "الفرسان", from: 11, to: 16 },
  { level: "الحفاظ", from: 17, to: 22 },
  { level: "الخريجين", from: 23, to: 30 },
];

export function phaseRangesForTrack(track: PlanTrack): LevelRange[] {
  return track === "gold" ? GOLD_PHASE_RANGES : SILVER_PHASE_RANGES;
}

export function maxGlobalPhase(track: PlanTrack): number {
  const ranges = phaseRangesForTrack(track);
  return ranges[ranges.length - 1]?.to ?? (track === "gold" ? 30 : 60);
}

export function normalizeInstituteLevel(raw: string): InstituteLevel | null {
  const s = raw.trim().replace(/\s+/g, " ");
  for (const name of INSTITUTE_LEVELS) {
    if (s === name || s.includes(name) || name.includes(s)) return name;
  }
  if (/تأهيل/.test(s)) return "التأهيل";
  if (/نجب/.test(s)) return "النجباء";
  if (/فرسان/.test(s)) return "الفرسان";
  if (/حفاظ/.test(s)) return "الحفاظ";
  if (/خريج/.test(s)) return "الخريجين";
  return null;
}

export function instituteLevelFromGlobalPhase(track: PlanTrack, globalPhase: number): InstituteLevel | null {
  for (const r of phaseRangesForTrack(track)) {
    if (globalPhase >= r.from && globalPhase <= r.to) return r.level;
  }
  return null;
}

export function phaseInLevelFromGlobal(track: PlanTrack, globalPhase: number): number {
  for (const r of phaseRangesForTrack(track)) {
    if (globalPhase >= r.from && globalPhase <= r.to) return globalPhase - r.from + 1;
  }
  return globalPhase;
}

/** DB plan key used in education_plans.level_number */
export function planLevelFromGlobalPhase(track: PlanTrack, globalPhase: number): number | null {
  const level = instituteLevelFromGlobalPhase(track, globalPhase);
  if (!level) return null;
  const phaseInLevel = phaseInLevelFromGlobal(track, globalPhase);
  return planLevelNumber(level, phaseInLevel);
}

export function globalPhaseFromPlanLevel(track: PlanTrack, planLevelNumber: number): number | null {
  if (track === "gold" && planLevelNumber >= 1 && planLevelNumber <= 30 && planLevelNumber < 1000) {
    return planLevelNumber;
  }
  const slot = Math.floor(planLevelNumber / 1000);
  const phaseInLevel = planLevelNumber % 1000;
  if (slot < 1 || phaseInLevel < 1) return null;
  const level = INSTITUTE_LEVELS[slot - 1];
  if (!level) return null;
  for (const r of phaseRangesForTrack(track)) {
    if (r.level === level) return r.from + phaseInLevel - 1;
  }
  return null;
}

export function validateLevelAndPhase(
  track: PlanTrack,
  instituteLevel: string,
  globalPhase: number,
): { ok: true } | { ok: false; message: string } {
  const level = normalizeInstituteLevel(instituteLevel);
  if (!level) return { ok: false, message: `المستوى غير معروف: ${instituteLevel}` };
  const expected = instituteLevelFromGlobalPhase(track, globalPhase);
  if (!expected) {
    return {
      ok: false,
      message: `رقم المرحلة ${globalPhase} خارج النطاق (${track === "gold" ? "1–30" : "1–60"})`,
    };
  }
  if (expected !== level) {
    return {
      ok: false,
      message: `رقم المرحلة ${globalPhase} يخص «${expected}» وليس «${level}»`,
    };
  }
  return { ok: true };
}

export function nextGlobalPhase(track: PlanTrack, current: number): number | null {
  if (current < 1) return 1;
  const max = maxGlobalPhase(track);
  if (current >= max) return null;
  return current + 1;
}

export function findPlanByGlobalPhase(
  plans: EducationPlan[],
  track: PlanTrack,
  globalPhase: number,
): EducationPlan | null {
  const key = planLevelFromGlobalPhase(track, globalPhase);
  if (key === null) return null;
  const direct = plans.find((p) => p.track === track && p.level_number === key);
  if (direct) return direct;
  if (track === "gold" && globalPhase >= 1 && globalPhase <= 30) {
    return plans.find((p) => p.track === "gold" && p.level_number === globalPhase) ?? null;
  }
  if (track === "silver" && globalPhase >= 1 && globalPhase <= 60) {
    return plans.find((p) => p.track === "silver" && p.level_number === globalPhase) ?? null;
  }
  return null;
}

/** First global phase (التأهيل — المرحلة 1): muraja starts at segment 16. */
export const FIRST_PHASE_MURAJA_START = 16;

export function murajaStartSegment(globalPhase: number): number | null {
  return globalPhase === 1 ? FIRST_PHASE_MURAJA_START : null;
}

export function isFirstGlobalPhase(globalPhase: number): boolean {
  return globalPhase === 1;
}
