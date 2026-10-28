import type { StudentPlanSheetData } from "@/lib/plan-types";

/** The same assignment range drives completion and the displayed percentage. */
export function planHifzProgress(sheet: StudentPlanSheetData) {
  const validStart = sheet.assignment && sheet.plan && sheet.segments.some(s => s.segment_index === sheet.assignment!.start_segment_index);
  const eligible = new Set(validStart
    ? sheet.segments.filter(s => s.segment_index >= sheet.assignment!.start_segment_index).map(s => s.segment_index) : []);
  const done = new Set(sheet.completions.filter(c => c.task_type === "hifz" && eligible.has(c.segment_index)).map(c => c.segment_index)).size;
  const total = eligible.size;
  return { done, total, percent: total ? Math.round(done / total * 100) : 0, complete: total > 0 && done === total };
}
