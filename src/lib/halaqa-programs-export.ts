import * as XLSX from "xlsx";
import type { Student } from "@/lib/mock-data";
import type { AcademicCalendar } from "@/lib/academic-context";
import { getSelectableWeeks } from "@/lib/academic-context";
import {
  loadHalaqaPrograms,
  loadProgramGrades,
  programLevelScore,
  programMaxSlotScore,
  programSlots,
  studentAllProgramsPeriodTotals,
  studentAllProgramsWeekTotals,
} from "@/lib/halaqa-programs";
import { weekLabel } from "@/lib/arabic-numbers";

export function downloadHalaqaProgramsWorkbook(
  students: Student[],
  halaqaId: number,
  halaqaName: string,
  calendar: AcademicCalendar,
  fromIso: string,
  toIso: string,
) {
  const programs = loadHalaqaPrograms(halaqaId);
  const allGrades = loadProgramGrades(halaqaId);
  const weeks = getSelectableWeeks(calendar).filter(
    (w) => w.end_date >= fromIso && w.start_date <= toIso,
  );
  const weekNums = weeks.map((w) => w.week_number);

  const wb = XLSX.utils.book_new();

  const summaryRows: (string | number)[][] = [
    ["برنامج الحلقة — مستقل عن الدرجات الرسمية"],
    ["الحلقة", halaqaName],
    ["من", fromIso, "إلى", toIso],
    [],
    ["الطالب", "المجموع (رقم)", "الحد الأقصى", "النسبة %", "الأسابيع"],
  ];

  for (const s of students) {
    const totals = studentAllProgramsPeriodTotals(programs, allGrades, s.id, weekNums);
    summaryRows.push([
      s.name,
      totals.earned,
      totals.maxPossible,
      totals.percent,
      weekNums.map((w) => weekLabel(w)).join("، "),
    ]);
  }

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "ملخص المجموع");

  const weeklyHeader: (string | number)[] = [
    "الطالب",
    "الأسبوع",
    ...programs.flatMap((p) => {
      const slots = programSlots(p);
      return slots.flatMap((sl) => [`${p.name} — ${sl.label}`]);
    }),
    "المجموع (رقم)",
    "الحد الأقصى",
    "النسبة %",
  ];
  const weeklyRows: (string | number)[][] = [weeklyHeader];

  for (const s of students) {
    for (const wk of weeks) {
      const row: (string | number)[] = [s.name, weekLabel(wk.week_number)];
      for (const p of programs) {
        const slots = programSlots(p);
        const vals = allGrades[s.id]?.[wk.week_number]?.[p.id] ?? {};
        for (const sl of slots) {
          const label = vals[sl.key] ?? "—";
          const pts = label !== "—" ? programLevelScore(p, label) : "—";
          row.push(`${label}${label !== "—" ? ` (${pts})` : ""}`);
        }
      }
      const wkTotals = studentAllProgramsWeekTotals(programs, allGrades, s.id, wk.week_number);
      row.push(wkTotals.earned, wkTotals.maxPossible, wkTotals.percent);
      weeklyRows.push(row);
    }
  }

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(weeklyRows), "تفاصيل أسبوعية");

  for (const p of programs) {
    const slots = programSlots(p);
    const slotMax = programMaxSlotScore(p);
    const header = [
      "الطالب",
      "الأسبوع",
      ...slots.map((sl) => sl.label),
      "مجموع البرنامج",
      `نسبة البرنامج % (من ${slotMax} لكل خانة)`,
    ];
    const rows: (string | number)[][] = [header];
    for (const s of students) {
      for (const wk of weeks) {
        const vals = allGrades[s.id]?.[wk.week_number]?.[p.id] ?? {};
        let earned = 0;
        let max = 0;
        for (const sl of slots) {
          max += slotMax;
          const v = vals[sl.key];
          if (v) earned += programLevelScore(p, v);
        }
        const pct = max > 0 ? Math.round((earned / max) * 100) : 0;
        rows.push([
          s.name,
          weekLabel(wk.week_number),
          ...slots.map((sl) => {
            const v = vals[sl.key];
            return v ? `${v} (${programLevelScore(p, v)})` : "—";
          }),
          earned,
          pct,
        ]);
      }
    }
    const safeName = p.name.slice(0, 28).replace(/[\\/?*[\]]/g, "");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), safeName || "برنامج");
  }

  XLSX.writeFile(wb, `برنامج-الحلقة-${halaqaName}-${fromIso}.xlsx`);
}
