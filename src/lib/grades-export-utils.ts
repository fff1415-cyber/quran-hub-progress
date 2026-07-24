import {
  DAYS,
  loadGrades,
  loadSardHistory,
  HIFZ_LABELS,
  type GradesStore,
  type Student,
  type WeekRecord,
} from "@/lib/mock-data";
import { studentAcademicRecordsWithLegacy } from "@/lib/academic-record";
import type { AcademicCalendar, AcademicWeekRow } from "@/lib/academic-context";
import { getSelectableWeeks, resolveWeekForDate } from "@/lib/academic-context";
import { isoDateToDayKey } from "@/lib/operational-date";
import { weekLabel } from "@/lib/arabic-numbers";
import type { HalaqaCustomField } from "@/lib/halaqa-custom-fields";
import { semesterOverallPercentage, semesterComponentPercentages, studentWeekOverallPercentage } from "@/lib/semester-grading";
import * as XLSX from "xlsx";

export interface PeriodDayStats {
  present: number;
  absent: number;
  late: number;
  excused: number;
  hifz: number;
  murajaPass: number;
  murajaFail: number;
  rabtPass: number;
  rabtFail: number;
}

export interface StudentPeriodExportRow extends PeriodDayStats {
  weeksIncluded: number[];
  overallPercent: number;
  weekPercent: number;
  attendancePercent: number;
  hifzPercent: number;
  murajaPercent: number;
  rabtPercent: number;
  wajibPercent: number;
  sardPassed: number;
}

const ATT_LABEL: Record<string, string> = {
  present: "حاضر",
  late: "متأخر",
  excused: "مستأذن",
  absent: "غائب",
  "": "—",
};

function clampToToday(calendar: AcademicCalendar, toIso: string): string {
  return toIso > calendar.operationalDate ? calendar.operationalDate : toIso;
}

function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  if (Number.isNaN(d.getTime()) || Number.isNaN(last.getTime())) return out;
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Academic weeks overlapping [from, to], capped at current week / today. */
export function weeksInExportRange(
  calendar: AcademicCalendar,
  fromIso: string,
  toIso: string,
): number[] {
  const cappedTo = clampToToday(calendar, toIso);
  if (fromIso > cappedTo) return [];

  const selectable = getSelectableWeeks(calendar);
  const dated = selectable.filter((w) => w.start_date && w.end_date);

  if (dated.length > 0) {
    return selectable
      .filter((w) => w.start_date <= cappedTo && w.end_date >= fromIso)
      .map((w) => w.week_number);
  }

  const lo = resolveWeekForDate(calendar.weeks, fromIso);
  const hi = resolveWeekForDate(calendar.weeks, cappedTo);
  const nums: number[] = [];
  for (let w = Math.min(lo, hi); w <= Math.max(lo, hi); w++) {
    if (w <= calendar.currentWeekNumber) nums.push(w);
  }
  return nums;
}

function weekRow(calendar: AcademicCalendar, weekNum: number): AcademicWeekRow | undefined {
  return calendar.weeks.find((w) => w.week_number === weekNum);
}

function eachDayInWeekPeriod(
  calendar: AcademicCalendar,
  weekNum: number,
  fromIso: string,
  toIso: string,
  fn: (dayKey: string, isoDate: string | null) => void,
): void {
  const cappedTo = clampToToday(calendar, toIso);
  const wk = weekRow(calendar, weekNum);
  if (wk?.start_date && wk?.end_date) {
    const rangeStart = wk.start_date > fromIso ? wk.start_date : fromIso;
    const rangeEnd = wk.end_date < cappedTo ? wk.end_date : cappedTo;
    if (rangeStart > rangeEnd) return;
    for (const iso of datesBetween(rangeStart, rangeEnd)) {
      fn(isoDateToDayKey(iso), iso);
    }
    return;
  }
  DAYS.forEach((d) => fn(d.key, null));
}

function emptyPeriodStats(): PeriodDayStats {
  return {
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
    hifz: 0,
    murajaPass: 0,
    murajaFail: 0,
    rabtPass: 0,
    rabtFail: 0,
  };
}

function tallyDayEntry(stats: PeriodDayStats, e: WeekRecord["days"][string] | undefined): void {
  if (!e) return;
  const hasTask = !!(e.hifz || e.rabt || e.muraja);
  if (e.attendance === "absent") stats.absent++;
  else if (e.attendance === "late") stats.late++;
  else if (e.attendance === "excused") stats.excused++;
  else if (e.attendance === "present" || (e.attendance === "" && hasTask)) stats.present++;

  if (e.hifz) stats.hifz++;
  if (e.muraja === "pass") stats.murajaPass++;
  else if (e.muraja === "fail") stats.murajaFail++;
  if (e.rabt === "pass") stats.rabtPass++;
  else if (e.rabt === "fail") stats.rabtFail++;
}

export function aggregateStudentPeriod(
  student: Student,
  grades: GradesStore,
  calendar: AcademicCalendar,
  weekNums: number[],
  fromIso: string,
  toIso: string,
  isTalqeen: boolean,
): StudentPeriodExportRow | null {
  const studentGrades = grades[student.id];
  if (!studentGrades) return null;

  const stats = emptyPeriodStats();

  for (const wn of weekNums) {
    const week = studentGrades[wn];
    if (!week) continue;
    eachDayInWeekPeriod(calendar, wn, fromIso, toIso, (dayKey) => {
      tallyDayEntry(stats, week.days[dayKey]);
    });
  }

  const cappedTo = clampToToday(calendar, toIso);
  const components = semesterComponentPercentages(student.id, student.levelType, isTalqeen, grades, calendar);
  return {
    ...stats,
    weeksIncluded: weekNums,
    overallPercent: semesterOverallPercentage(student.id, student.levelType, isTalqeen, grades, calendar),
    weekPercent: studentWeekOverallPercentage(student.id, isTalqeen, grades, calendar.currentWeekNumber),
    attendancePercent: components.attendance,
    hifzPercent: components.hifz,
    murajaPercent: components.muraja,
    rabtPercent: components.rabt,
    wajibPercent: components.wajib,
    sardPassed: countPassedSardInRange(student.id, fromIso, cappedTo),
  };
}

export function countPassedSardInRange(studentId: string, fromIso: string, toIso: string): number {
  const fromMs = new Date(`${fromIso}T00:00:00`).getTime();
  const toMs = new Date(`${toIso}T23:59:59`).getTime();
  const seen = new Set<string>();

  const add = (id: string, at: string) => {
    const t = new Date(at).getTime();
    if (t >= fromMs && t <= toMs) seen.add(id);
  };

  loadSardHistory()
    .filter((h) => h.studentId === studentId && h.result === "passed")
    .forEach((h) => add(h.id, h.at));

  studentAcademicRecordsWithLegacy(studentId)
    .filter((r) => r.result === "passed")
    .forEach((r) => add(r.id, r.testDate));

  return seen.size;
}

function latestCustomFieldValues(
  studentGrades: GradesStore[string] | undefined,
  calendar: AcademicCalendar,
  weekNums: number[],
  fromIso: string,
  toIso: string,
  customFields: HalaqaCustomField[],
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!studentGrades || customFields.length === 0) return out;

  const cappedTo = clampToToday(calendar, toIso);
  for (const wn of weekNums) {
    const week = studentGrades[wn];
    if (!week) continue;
    eachDayInWeekPeriod(calendar, wn, fromIso, cappedTo, (dayKey) => {
      const e = week.days[dayKey];
      if (!e?.custom) return;
      customFields.forEach((f) => {
        const v = e.custom?.[f.id];
        if (v) out[f.id] = v;
      });
    });
  }
  return out;
}

export function buildTeacherGradesWorkbook(
  students: Student[],
  halaqaName: string,
  calendar: AcademicCalendar,
  fromIso: string,
  toIso: string,
  isTalqeen: boolean,
  customFields: HalaqaCustomField[] = [],
): XLSX.WorkBook {
  const grades = loadGrades();
  const cappedTo = clampToToday(calendar, toIso);
  const weekNums = weeksInExportRange(calendar, fromIso, cappedTo);

  const wb = XLSX.utils.book_new();

  const summary: (string | number)[][] = [
    [`حلقة: ${halaqaName}`, `من ${fromIso} إلى ${cappedTo}`],
    [],
    isTalqeen
      ? [
          "الطالب", "المستوى", "النوع",
          "نسبة الحضور %", "نسبة الواجب %",
          "نسبة الأسبوع %", "النسبة الكلية %",
          "سرد مجتاز", ...customFields.map((f) => f.label), "الأسابيع المشمولة",
        ]
      : [
          "الطالب", "المستوى", "النوع",
          "نسبة الحضور %", "نسبة الحفظ %", "نسبة المراجعة %", "نسبة الربط %",
          "نسبة الأسبوع %", "النسبة الكلية %",
          "سرد مجتاز", ...customFields.map((f) => f.label), "الأسابيع المشمولة",
        ],
  ];

  students.forEach((s) => {
    const row = aggregateStudentPeriod(s, grades, calendar, weekNums, fromIso, cappedTo, isTalqeen);
    const weeksLabel = weekNums.map((w) => weekLabel(w)).join("، ");
    const customVals = latestCustomFieldValues(grades[s.id], calendar, weekNums, fromIso, cappedTo, customFields);
    const customCols = customFields.map((f) => customVals[f.id] ?? "—");
    if (!row) {
      const empty = isTalqeen
        ? [s.name, s.level, s.levelType === "gold" ? "ذهبي" : "فضي", 0, 0, 0, 0, 0, ...customCols, weeksLabel]
        : [s.name, s.level, s.levelType === "gold" ? "ذهبي" : "فضي", 0, 0, 0, 0, 0, 0, 0, ...customCols, weeksLabel];
      summary.push(empty);
      return;
    }
    summary.push(
      isTalqeen
        ? [
            s.name, s.level, s.levelType === "gold" ? "ذهبي" : "فضي",
            row.attendancePercent, row.wajibPercent,
            row.weekPercent, row.overallPercent,
            row.sardPassed, ...customCols, weeksLabel,
          ]
        : [
            s.name, s.level, s.levelType === "gold" ? "ذهبي" : "فضي",
            row.attendancePercent, row.hifzPercent, row.murajaPercent, row.rabtPercent,
            row.weekPercent, row.overallPercent,
            row.sardPassed, ...customCols, weeksLabel,
          ],
    );
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "ملخص الطلاب");

  const daily: (string | number)[][] = [
    ["الطالب", "الأسبوع", "اليوم", "التاريخ", "الحضور", "الحفظ", "الربط", "المراجعة", ...customFields.map((f) => f.label)],
  ];
  students.forEach((s) => {
    const studentGrades = grades[s.id];
    if (!studentGrades) return;
    for (const wn of weekNums) {
      const week = studentGrades[wn];
      if (!week) continue;
      eachDayInWeekPeriod(calendar, wn, fromIso, cappedTo, (dayKey, isoDate) => {
        const e = week.days[dayKey];
        if (!e) return;
        const hasCustom = customFields.some((f) => e.custom?.[f.id]);
        if (!e.attendance && !e.hifz && !e.rabt && !e.muraja && !hasCustom) return;
        const dayLabel = DAYS.find((d) => d.key === dayKey)?.label ?? dayKey;
        daily.push([
          s.name, weekLabel(wn), dayLabel, isoDate ?? "—",
          ATT_LABEL[e.attendance] || "—",
          HIFZ_LABELS[e.hifz] || "—",
          e.rabt === "pass" ? "✓" : e.rabt === "fail" ? "✗" : "—",
          e.muraja === "pass" ? "✓" : e.muraja === "fail" ? "✗" : "—",
          ...customFields.map((f) => e.custom?.[f.id] ?? "—"),
        ]);
      });
    }
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(daily), "تفاصيل يومية");

  return wb;
}

export function defaultExportFromDate(calendar: AcademicCalendar): string {
  const selectable = getSelectableWeeks(calendar);
  const first = selectable[0];
  if (first?.start_date) return first.start_date;
  if (calendar.semester?.start_date) return calendar.semester.start_date;
  return calendar.operationalDate;
}

export function downloadTeacherGradesWorkbook(
  students: Student[],
  halaqaName: string,
  calendar: AcademicCalendar,
  fromIso: string,
  toIso: string,
  isTalqeen: boolean,
  customFields: HalaqaCustomField[] = [],
): void {
  const wb = buildTeacherGradesWorkbook(students, halaqaName, calendar, fromIso, toIso, isTalqeen, customFields);
  const cappedTo = clampToToday(calendar, toIso);
  const safeName = halaqaName.replace(/[^\w\u0600-\u06FF-]+/g, "_");
  XLSX.writeFile(wb, `درجات_${safeName}_${fromIso}_${cappedTo}.xlsx`);
}
