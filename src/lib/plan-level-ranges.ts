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
  { level: "الفرسان", from: 21, to: 33 },
  { level: "الحفاظ", from: 34, to: 42 },
  { level: "الخريجين", from: 43, to: 60 },
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
  // Column B of the imported syllabus is the overall phase number, not a
  // counter that starts over at each institute level.
  return planLevelNumber(level, globalPhase);
}

export function globalPhaseFromPlanLevel(track: PlanTrack, planLevelNumber: number, catalog?: EducationPlan[]): number | null {
  if (planLevelNumber >= 1 && planLevelNumber < 1000 && planLevelNumber <= maxGlobalPhase(track)) {
    return planLevelNumber;
  }
  const slot = Math.floor(planLevelNumber / 1000);
  const phase = planLevelNumber % 1000;
  if (slot < 1 || phase < 1) return null;
  const level = INSTITUTE_LEVELS[slot - 1];
  if (!level) return null;
  if (slot > 1 && catalog?.some((p) => p.track === track && p.level_number === slot * 1000 + 1)) {
    // A complete old tier-local catalog starts this tier at 1.
    return legacyGlobalPhaseFromPlanLevel(track, planLevelNumber);
  }
  for (const r of phaseRangesForTrack(track)) {
    if (r.level !== level) continue;
    if (phase >= r.from && phase <= r.to) return phase;
    if (track === "silver" && isSilverSplitPhase(level, phase)) return phase;
    // Older catalogs numbered each tier from one. Keep those readable.
    if (phase <= r.to - r.from + 1) return r.from + phase - 1;
  }
  return null;
}

/** The silver syllabus has two consecutive plans at each of these boundaries. */
export function isSilverSplitPhase(level: InstituteLevel, phase: number): boolean {
  return (level === "الفرسان" && phase === 20)
    || (level === "الحفاظ" && phase === 33)
    || (level === "الخريجين" && phase === 42);
}

/** The phase previously inferred by treating the imported number as tier-local. */
export function legacyGlobalPhaseFromPlanLevel(track: PlanTrack, planLevelNumber: number): number | null {
  if (planLevelNumber >= 1 && planLevelNumber < 1000) return planLevelNumber;
  const slot = Math.floor(planLevelNumber / 1000);
  const phase = planLevelNumber % 1000;
  const legacyStarts = track === "gold" ? [1, 5, 11, 17, 23] : [1, 9, 21, 33, 45];
  const start = legacyStarts[slot - 1];
  if (!start || phase < 1) return null;
  const legacyPhase = start + phase - 1;
  return legacyPhase <= maxGlobalPhase(track) ? legacyPhase : null;
}

export function instituteLevelFromPlanLevel(planLevelNumber: number): InstituteLevel | null {
  return INSTITUTE_LEVELS[Math.floor(planLevelNumber / 1000) - 1] ?? null;
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
  if (expected !== level && !(track === "silver" && isSilverSplitPhase(level, globalPhase))) {
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
  preferredLevel?: string,
): EducationPlan | null {
  const level = preferredLevel ? normalizeInstituteLevel(preferredLevel) : instituteLevelFromGlobalPhase(track, globalPhase);
  const key = level ? planLevelNumber(level, globalPhase) : null;
  if (key === null) return null;
  if (level) {
    const slot = INSTITUTE_LEVELS.indexOf(level) + 1;
    if (slot > 1 && plans.some((p) => p.track === track && p.level_number === slot * 1000 + 1)) {
      const start = (track === "gold" ? [1, 5, 11, 17, 23] : [1, 9, 21, 33, 45])[slot - 1];
      const local = planLevelNumber(level, globalPhase - start + 1);
      const old = plans.find((p) => p.track === track && p.level_number === local);
      if (old) return old;
    }
  }
  const direct = plans.find((p) => p.track === track && p.level_number === key);
  if (direct) return direct;
  // Support old tier-local catalogs without preferring them over the real
  // overall phase when both happen to be present.
  if (level) {
    const range = phaseRangesForTrack(track).find((r) => r.level === level);
    if (range && globalPhase >= range.from && globalPhase <= range.to) {
      const local = planLevelNumber(level, globalPhase - range.from + 1);
      const old = plans.find((p) => p.track === track && p.level_number === local);
      if (old) return old;
    }
  }
  if (track === "gold" && globalPhase >= 1 && globalPhase <= 30) {
    return plans.find((p) => p.track === "gold" && p.level_number === globalPhase) ?? null;
  }
  if (track === "silver" && globalPhase >= 1 && globalPhase <= 60) {
    return plans.find((p) => p.track === "silver" && p.level_number === globalPhase) ?? null;
  }
  return null;
}

export function followingPlan(
  plans: EducationPlan[],
  current: EducationPlan,
  studentPhase?: number,
): { plan: EducationPlan; phase: number } | null {
  const track = current.track;
  const currentPhase = globalPhaseFromPlanLevel(track, current.level_number, plans);
  if (currentPhase === null) return null;

  const oldPhase = legacyGlobalPhaseFromPlanLevel(track, current.level_number);
  if (studentPhase && studentPhase !== currentPhase && studentPhase === oldPhase) {
    // Existing students may have been linked to a tier-local interpretation
    // while their profile was promoted to the intended overall phase. Leave
    // their completed sheet intact and use their recorded phase at the pass.
    const target = nextGlobalPhase(track, studentPhase);
    const plan = target === null ? null : findPlanByGlobalPhase(plans, track, target);
    return plan ? { plan, phase: target! } : null;
  }

  const catalog = plans.filter((p) => p.track === track).sort((a, b) => a.level_number - b.level_number);
  const position = catalog.findIndex((p) => p.id === current.id);
  const next = catalog[position + 1];
  if (position < 0 || !next) return null;
  const phase = globalPhaseFromPlanLevel(track, next.level_number, plans);
  const fromTier = Math.floor(current.level_number / 1000);
  const toTier = Math.floor(next.level_number / 1000);
  const split = track === "silver" && phase === currentPhase
    && ((fromTier === 2 && toTier === 3 && phase === 20)
      || (fromTier === 3 && toTier === 4 && phase === 33)
      || (fromTier === 4 && toTier === 5 && phase === 42));
  if (phase === currentPhase + 1 && (toTier === fromTier || toTier === fromTier + 1)) {
    return { plan: next, phase };
  }
  return split ? { plan: next, phase: phase! } : null;
}

/** First global phase (التأهيل — المرحلة 1): muraja starts at segment 16. */
export const FIRST_PHASE_MURAJA_START = 16;

export function murajaStartSegment(globalPhase: number): number | null {
  return globalPhase === 1 ? FIRST_PHASE_MURAJA_START : null;
}

export function isFirstGlobalPhase(globalPhase: number): boolean {
  return globalPhase === 1;
}
