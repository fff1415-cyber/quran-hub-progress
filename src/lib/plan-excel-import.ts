import * as XLSX from "xlsx";
import type { ImportPlanPayload, PlanTrack } from "@/lib/plan-types";

/** Five institute tiers (column C in جداول الخطط.xlsx). */
export const PLAN_TIER_NAMES = [
  "التأهيل",
  "النجباء",
  "الفرسان",
  "الحفاظ",
  "الخريجين",
] as const;

export type PlanTierName = (typeof PLAN_TIER_NAMES)[number];

const TIER_ORDER: Record<string, number> = Object.fromEntries(
  PLAN_TIER_NAMES.map((name, i) => [name, i + 1]),
);

const PHASE_ORDINAL: Record<number, string> = {
  1: "الأولى",
  2: "الثانية",
  3: "الثالثة",
  4: "الرابعة",
  5: "الخامسة",
  6: "السادسة",
  7: "السابعة",
  8: "الثامنة",
  9: "التاسعة",
  10: "العاشرة",
};

/** Title shown above each plan card, e.g. «التأهيل — المرحلة الأولى». */
export function formatPlanTitle(tierName: string, phaseNumber: number): string {
  const tier = tierName.trim();
  const ord = PHASE_ORDINAL[phaseNumber] ?? `${phaseNumber}`;
  return `${tier} — المرحلة ${ord}`;
}

export function isKnownPlanTier(tierName: string): boolean {
  return (TIER_ORDER[tierName.trim()] ?? 0) >= 1;
}

/** Stable DB key: tier slot × 1000 + phase (التأهيل/1 → 1001, النجباء/2 → 2002). */
export function planLevelNumber(tierName: string, phaseNumber: number): number {
  const slot = TIER_ORDER[tierName.trim()] ?? 0;
  if (slot < 1 || phaseNumber < 1) return 0;
  return slot * 1000 + phaseNumber;
}

const COL = {
  track: ["track", "المسار", "لمسار", "نوع", "type"],
  phase: ["phase", "phase_number", "المرحلة", "رقم_المرحلة"],
  tier: ["tier", "tier_name", "المستوى", "level_name"],
  legacyLevel: ["level_number", "level", "جزء", "level_num"],
  segment: ["segment_index", "segment", "المقطع", "رقم_المقطع", "مقطع"],
  hifz: ["hifz_plan", "hifz", "حفظ", "خطة_الحفظ", "plan_hifz"],
  rabt: ["rabt_plan", "rabt", "ربط", "خطة_الربط", "plan_rabt"],
  muraja: ["muraja_plan", "muraja", "مراجعة", "خطة_المراجعة", "plan_muraja"],
};

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "_");
}

function findCol(headers: string[], keys: string[]): number {
  const normalized = headers.map(norm);
  for (const k of keys) {
    const i = normalized.indexOf(norm(k));
    if (i >= 0) return i;
  }
  return -1;
}

function parseTrack(raw: unknown): PlanTrack | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s.includes("gold") || s.includes("ذهب") || s === "g") return "gold";
  if (s.includes("silver") || s.includes("فض") || s === "s") return "silver";
  return null;
}

function cell(row: unknown[], index: number): string {
  return index >= 0 ? String(row[index] ?? "").trim() : "";
}

function normalizeSegments(plan: ImportPlanPayload): void {
  plan.segments.sort((a, b) => (a.segment_index ?? 0) - (b.segment_index ?? 0));
  plan.segments.forEach((seg, i) => {
    seg.segment_index = i + 1;
  });
}

export function parsePlansExcel(buffer: ArrayBuffer): ImportPlanPayload[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }) as unknown[][];
  if (rows.length < 2) return [];

  const headers = (rows[0] as unknown[]).map((h) => String(h));
  const iTrack = findCol(headers, COL.track);
  const iPhase = findCol(headers, COL.phase);
  const iTier = findCol(headers, COL.tier);
  const iLegacyLevel = findCol(headers, COL.legacyLevel);
  const iSeg = findCol(headers, COL.segment);
  const iHifz = findCol(headers, COL.hifz);
  const iRabt = findCol(headers, COL.rabt);
  const iMuraja = findCol(headers, COL.muraja);

  const useTierFormat = iPhase >= 0 && iTier >= 0;
  const map = new Map<string, ImportPlanPayload>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    if (!row || row.every((c) => String(c).trim() === "")) continue;

    const track = iTrack >= 0 ? parseTrack(row[iTrack]) : null;
    if (!track) continue;

    let key: string;
    let payload: ImportPlanPayload;

    if (useTierFormat) {
      const tierName = cell(row, iTier);
      const phaseNumber = Number(row[iPhase]);
      if (!tierName || !Number.isFinite(phaseNumber) || phaseNumber < 1) continue;
      if (!isKnownPlanTier(tierName)) continue;

      key = `${track}:${tierName}:${phaseNumber}`;
      if (!map.has(key)) {
        payload = {
          track,
          level_number: planLevelNumber(tierName, phaseNumber),
          tier_name: tierName,
          phase_number: phaseNumber,
          title: formatPlanTitle(tierName, phaseNumber),
          segments: [],
        };
        map.set(key, payload);
      } else {
        payload = map.get(key)!;
      }
    } else {
      const level = iLegacyLevel >= 0 ? Number(row[iLegacyLevel]) : NaN;
      if (!Number.isFinite(level) || level < 1) continue;

      key = `${track}:${level}`;
      if (!map.has(key)) {
        payload = {
          track,
          level_number: level,
          segments: [],
        };
        map.set(key, payload);
      } else {
        payload = map.get(key)!;
      }
    }

    const plan = map.get(key)!;
    const segRaw = iSeg >= 0 ? Number(row[iSeg]) : plan.segments.length + 1;
    plan.segments.push({
      segment_index: Number.isFinite(segRaw) && segRaw > 0 ? segRaw : plan.segments.length + 1,
      hifz_plan: cell(row, iHifz),
      rabt_plan: cell(row, iRabt),
      muraja_plan: cell(row, iMuraja),
    });
  }

  const plans = Array.from(map.values());
  for (const plan of plans) {
    normalizeSegments(plan);
    if (!plan.title) {
      plan.title =
        plan.track === "gold"
          ? `جزء ${plan.level_number}`
          : `مرحلة ${plan.level_number}`;
    }
  }

  return plans.sort(
    (a, b) => a.track.localeCompare(b.track) || a.level_number - b.level_number,
  );
}
