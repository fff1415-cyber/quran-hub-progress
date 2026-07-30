import * as XLSX from "xlsx";
import type { Student } from "@/lib/mock-data";
import type { AcademicCalendar } from "@/lib/academic-context";
import { getSelectableWeeks, workingDayKeysFromSemester } from "@/lib/academic-context";
import {
  loadHalaqaPrograms,
  loadProgramGrades,
  programSlots,
  studentProgramWeekScore,
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
  const workingKeys = workingDayKeysFromSemester(calendar.semester?.working_days);
  const weeks = getSelectableWeeks(calendar).filter(
    (w) => w.end_date >= fromIso && w.start_date <= toIso,
  );

  const wb = XLSX.utils.book_new();

  const summaryRows: (string | number)[][] = [
    ["برنامج الحلقة — مستقل عن الدرجات الرسمية"],
    ["الحلقة", halaqaName],
    ["من", fromIso, "إلى", toIso],
    [],
    ["الطالب", ...programs.flatMap((p) => [`${p.name} (متوسط %)`, `${p.name} (الدرجة الكلية ${p.maxScore})`])],
  ];

  for (const s of students) {
    const row: (string | number)[] = [s.name];
    for (const p of programs) {
      const slots = programSlots(p, workingKeys);
      let sum = 0;
      let count = 0;
      for (const wk of weeks) {
        const vals = allGrades[s.id]?.[wk.week_number]?.[p.id];
        const sc = studentProgramWeekScore(p, slots, vals);
        if (sc > 0) {
          sum += sc;
          count++;
        }
      }
      const avg = count > 0 ? Math.round(sum / count) : 0;
      row.push(avg, avg);
    }
    summaryRows.push(row);
  }

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "ملخص البرامج");

  for (const p of programs) {
    const slots = programSlots(p, workingKeys);
    const header = ["الطالب", "الأسبوع", ...slots.map((sl) => sl.label), "نسبة الأسبوع %"];
    const rows: (string | number)[][] = [header];
    for (const s of students) {
      for (const wk of weeks) {
        const vals = allGrades[s.id]?.[wk.week_number]?.[p.id] ?? {};
        const score = studentProgramWeekScore(p, slots, vals);
        rows.push([
          s.name,
          weekLabel(wk.week_number),
          ...slots.map((sl) => vals[sl.key] ?? "—"),
          score,
        ]);
      }
    }
    const safeName = p.name.slice(0, 28).replace(/[\\/?*[\]]/g, "");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), safeName || "برنامج");
  }

  XLSX.writeFile(wb, `برنامج-الحلقة-${halaqaName}-${fromIso}.xlsx`);
}
