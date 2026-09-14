import * as XLSX from "xlsx";
import type { Student } from "@/lib/mock-data";
import type { AcademicCalendar } from "@/lib/academic-context";
import { getSelectableWeeks, workingDayKeysFromSemester } from "@/lib/academic-context";
import {
  filterStandardPrograms,
  SCIENTIFIC_PROGRAM_NAME,
} from "@/lib/scientific-grades-program";
import {
  enabledScientificFields,
  isScientificProgramEnabled,
  loadScientificConfig,
  loadScientificData,
  SCIENTIFIC_FIELD_LABELS,
  SCIENTIFIC_TOTAL_LABELS,
  scientificPeriodMaxPossible,
  studentScientificPeriodTotals,
  studentScientificWeekTotals,
} from "@/lib/scientific-grades";
import { ATTENDANCE_OPTION_LABELS } from "@/lib/grade-input-settings";
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

function combinedPeriodTotals(
  halaqaId: number,
  standardPrograms: ReturnType<typeof loadHalaqaPrograms>,
  programGrades: ReturnType<typeof loadProgramGrades>,
  studentId: string,
  weekNums: number[],
  workingDayKeys: string[],
) {
  const std = studentAllProgramsPeriodTotals(standardPrograms, programGrades, studentId, weekNums);
  const sciConfig = loadScientificConfig(halaqaId);
  const sciFields = enabledScientificFields(sciConfig.fields);
  const sciData = loadScientificData(halaqaId);

  if (!isScientificProgramEnabled(sciConfig) || sciFields.length === 0) {
    return { std, sci: null as ReturnType<typeof studentScientificPeriodTotals> | null, sciMax: 0, combinedEarned: std.earned, combinedMax: std.maxPossible };
  }

  const sci = studentScientificPeriodTotals(sciData, studentId, weekNums, sciFields, workingDayKeys);
  const sciMax = scientificPeriodMaxPossible(sciConfig, weekNums, workingDayKeys);
  return {
    std,
    sci,
    sciMax,
    combinedEarned: std.earned + sci.total,
    combinedMax: std.maxPossible + sciMax,
  };
}

function combinedWeekTotals(
  halaqaId: number,
  standardPrograms: ReturnType<typeof loadHalaqaPrograms>,
  programGrades: ReturnType<typeof loadProgramGrades>,
  studentId: string,
  weekNum: number,
  workingDayKeys: string[],
) {
  const std = studentAllProgramsWeekTotals(standardPrograms, programGrades, studentId, weekNum);
  const sciConfig = loadScientificConfig(halaqaId);
  const sciFields = enabledScientificFields(sciConfig.fields);
  const sciData = loadScientificData(halaqaId);

  if (!isScientificProgramEnabled(sciConfig) || sciFields.length === 0) {
    return { std, sci: null, combinedEarned: std.earned, combinedMax: std.maxPossible };
  }

  const sci = studentScientificWeekTotals(sciData, studentId, weekNum, sciFields, workingDayKeys);
  const sciMax = scientificPeriodMaxPossible(sciConfig, [weekNum], workingDayKeys);
  return {
    std,
    sci,
    combinedEarned: std.earned + sci.total,
    combinedMax: std.maxPossible + sciMax,
  };
}

function pct(earned: number, max: number): number {
  return max > 0 ? Math.round((earned / max) * 100) : 0;
}

export function downloadHalaqaProgramsWorkbook(
  students: Student[],
  halaqaId: number,
  halaqaName: string,
  calendar: AcademicCalendar,
  fromIso: string,
  toIso: string,
) {
  const allPrograms = loadHalaqaPrograms(halaqaId);
  const standardPrograms = filterStandardPrograms(allPrograms);
  const allGrades = loadProgramGrades(halaqaId);
  const sciConfig = loadScientificConfig(halaqaId);
  const sciFields = enabledScientificFields(sciConfig.fields);
  const showSci = isScientificProgramEnabled(sciConfig) && sciFields.length > 0;
  const workingDayKeys = workingDayKeysFromSemester(calendar.semester);
  const weeks = getSelectableWeeks(calendar).filter(
    (w) => w.end_date >= fromIso && w.start_date <= toIso,
  );
  const weekNums = weeks.map((w) => w.week_number);

  const wb = XLSX.utils.book_new();

  const summaryRows: (string | number)[][] = [
    ["تصدير برنامج الحلقة"],
    ["الحلقة", halaqaName],
    ["من", fromIso, "إلى", toIso],
    ["الأسابيع", weekNums.map((w) => weekLabel(w)).join("، ")],
    [],
    [
      "الطالب",
      "برامج عادية (رقم)",
      "برامج عادية (حد)",
      "برامج عادية %",
      ...(showSci ? ([SCIENTIFIC_PROGRAM_NAME, "علمي (حد)", "علمي %"] as const) : []),
      "الإجمالي (رقم)",
      "الحد الأقصى",
      "النسبة %",
    ],
  ];

  for (const s of students) {
    const t = combinedPeriodTotals(halaqaId, standardPrograms, allGrades, s.id, weekNums, workingDayKeys);
    summaryRows.push([
      s.name,
      t.std.earned,
      t.std.maxPossible,
      pct(t.std.earned, t.std.maxPossible),
      ...(showSci && t.sci
        ? [t.sci.total, t.sciMax, pct(t.sci.total, t.sciMax)]
        : showSci
          ? [0, 0, 0]
          : []),
      t.combinedEarned,
      t.combinedMax,
      pct(t.combinedEarned, t.combinedMax),
    ]);
  }

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "ملخص شامل");

  if (showSci) {
    const configRows: (string | number)[][] = [
      ["إعدادات البرنامج العلمي — نقاط المعلّم"],
      ["الحلقة", halaqaName],
      [],
      ["البند", "القيمة"],
    ];
    if (sciConfig.fields.attendance && sciConfig.defaultScores.attendance) {
      for (const [opt, label] of Object.entries(ATTENDANCE_OPTION_LABELS)) {
        configRows.push([
          `حضور — ${label}`,
          sciConfig.defaultScores.attendance[opt as keyof typeof ATTENDANCE_OPTION_LABELS] ?? "—",
        ]);
      }
    }
    for (const field of ["hifz", "rabt", "muraja"] as const) {
      if (sciConfig.fields[field]) {
        configRows.push([SCIENTIFIC_FIELD_LABELS[field], sciConfig.defaultScores[field] ?? "—"]);
      }
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(configRows), "نقاط العلمي");

    const sciHeader: (string | number)[] = [
      "الطالب",
      "الأسبوع",
      ...sciFields.map((f) => SCIENTIFIC_TOTAL_LABELS[f]),
      "مجموع العلمي",
      "الحد الأقصى",
      "النسبة %",
    ];
    const sciRows: (string | number)[][] = [sciHeader];
    const sciData = loadScientificData(halaqaId);

    for (const s of students) {
      for (const wk of weeks) {
        const totals = studentScientificWeekTotals(
          sciData,
          s.id,
          wk.week_number,
          sciFields,
          workingDayKeys,
        );
        const max = scientificPeriodMaxPossible(sciConfig, [wk.week_number], workingDayKeys);
        sciRows.push([
          s.name,
          weekLabel(wk.week_number),
          ...sciFields.map((f) => totals[f]),
          totals.total,
          max,
          pct(totals.total, max),
        ]);
      }
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sciRows), "البرنامج العلمي");
  }

  const weeklyHeader: (string | number)[] = [
    "الطالب",
    "الأسبوع",
    ...standardPrograms.flatMap((p) => {
      const slots = programSlots(p);
      return slots.map((sl) => `${p.name} — ${sl.label}`);
    }),
    ...(showSci ? sciFields.map((f) => `${SCIENTIFIC_PROGRAM_NAME} — ${SCIENTIFIC_FIELD_LABELS[f]}`) : []),
    ...(showSci ? [`${SCIENTIFIC_PROGRAM_NAME} — الكلي`] : []),
    "إجمالي (رقم)",
    "الحد الأقصى",
    "النسبة %",
  ];
  const weeklyRows: (string | number)[][] = [weeklyHeader];

  for (const s of students) {
    for (const wk of weeks) {
      const row: (string | number)[] = [s.name, weekLabel(wk.week_number)];
      for (const p of standardPrograms) {
        const slots = programSlots(p);
        const vals = allGrades[s.id]?.[wk.week_number]?.[p.id] ?? {};
        for (const sl of slots) {
          const label = vals[sl.key] ?? "—";
          const pts = label !== "—" ? programLevelScore(p, label) : "—";
          row.push(`${label}${label !== "—" ? ` (${pts})` : ""}`);
        }
      }
      const combined = combinedWeekTotals(
        halaqaId,
        standardPrograms,
        allGrades,
        s.id,
        wk.week_number,
        workingDayKeys,
      );
      if (showSci && combined.sci) {
        for (const field of sciFields) {
          row.push(combined.sci[field]);
        }
        row.push(combined.sci.total);
      }
      row.push(combined.combinedEarned, combined.combinedMax, pct(combined.combinedEarned, combined.combinedMax));
      weeklyRows.push(row);
    }
  }

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(weeklyRows), "تفاصيل أسبوعية");

  for (const p of standardPrograms) {
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
        const rowPct = max > 0 ? Math.round((earned / max) * 100) : 0;
        rows.push([
          s.name,
          weekLabel(wk.week_number),
          ...slots.map((sl) => {
            const v = vals[sl.key];
            return v ? `${v} (${programLevelScore(p, v)})` : "—";
          }),
          earned,
          rowPct,
        ]);
      }
    }
    const safeName = p.name.slice(0, 28).replace(/[\\/?*[\]]/g, "");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), safeName || "برنامج");
  }

  const safeHalaqa = halaqaName.replace(/[\\/?*[\]]/g, "_").slice(0, 24);
  XLSX.writeFile(wb, `برنامج-الحلقة-${safeHalaqa}-${fromIso}_${toIso}.xlsx`);
}
