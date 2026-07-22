import * as XLSX from "xlsx";
import type { ImportPlanPayload, PlanTrack } from "@/lib/plan-types";

/** Expected columns (Arabic or English): track, level, segment_index, hifz, rabt, muraja */
const COL = {
  track: ["track", "المسار", "نوع", "type"],
  level: ["level_number", "level", "المستوى", "جزء", "مرحلة", "level_num"],
  segment: ["segment_index", "segment", "المقطع", "رقم_المقطع", "مقطع"],
  hifz: ["hifz_plan", "hifz", "حفظ", "خطة_الحفظ", "plan_hifz"],
  rabt: ["rabt_plan", "rabt", "ربط", "خطة_الربط", "plan_rabt"],
  muraja: ["muraja_plan", "muraja", "muraja", "مراجعة", "خطة_المراجعة", "plan_muraja"],
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

export function parsePlansExcel(buffer: ArrayBuffer): ImportPlanPayload[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }) as unknown[][];
  if (rows.length < 2) return [];

  const headers = (rows[0] as unknown[]).map((h) => String(h));
  const iTrack = findCol(headers, COL.track);
  const iLevel = findCol(headers, COL.level);
  const iSeg = findCol(headers, COL.segment);
  const iHifz = findCol(headers, COL.hifz);
  const iRabt = findCol(headers, COL.rabt);
  const iMuraja = findCol(headers, COL.muraja);

  const map = new Map<string, ImportPlanPayload>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    if (!row || row.every((c) => String(c).trim() === "")) continue;

    const track = iTrack >= 0 ? parseTrack(row[iTrack]) : null;
    const level = iLevel >= 0 ? Number(row[iLevel]) : NaN;
    if (!track || !Number.isFinite(level) || level < 1) continue;

    const key = `${track}:${level}`;
    if (!map.has(key)) {
      map.set(key, { track, level_number: level, segments: [] });
    }
    const plan = map.get(key)!;
    plan.segments.push({
      segment_index: iSeg >= 0 ? Number(row[iSeg]) || plan.segments.length + 1 : plan.segments.length + 1,
      hifz_plan: iHifz >= 0 ? String(row[iHifz] ?? "") : "",
      rabt_plan: iRabt >= 0 ? String(row[iRabt] ?? "") : "",
      muraja_plan: iMuraja >= 0 ? String(row[iMuraja] ?? "") : "",
    });
  }

  return Array.from(map.values());
}
