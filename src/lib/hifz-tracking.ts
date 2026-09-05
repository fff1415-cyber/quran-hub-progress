/**
 * Complex-wide hifz progress for supervisor oversight.
 */
import type { AcademicCalendar } from "@/lib/academic-context";
import type { GradesStore, Halaqa, Student } from "@/lib/mock-data";
import {
  aggregateFaceProgress,
  facePct,
  resolveFaceQuotas,
} from "@/lib/plan-daily-faces";
import { semesterDayCompletionReport } from "@/lib/semester-grading";

export type HifzTrackingRow = {
  studentId: string;
  studentName: string;
  halaqaId: number;
  halaqaName: string;
  levelType: Student["levelType"];
  /** Face progress % vs term hifz target (from semester start). */
  hifzPercent: number;
  actualFaces: number;
  targetFaces: number;
  lateDays: number;
};

export function computeStudentHifzTracking(
  student: Student,
  halaqa: Halaqa | undefined,
  grades: GradesStore,
  calendar: AcademicCalendar,
): HifzTrackingRow | null {
  if (halaqa?.isTalqeen) return null;

  const quotas = resolveFaceQuotas(student.levelType);
  const progress = aggregateFaceProgress(student.id, grades, calendar, quotas);
  const completion = semesterDayCompletionReport(
    student.id,
    false,
    grades,
    calendar,
  );

  return {
    studentId: student.id,
    studentName: student.name,
    halaqaId: student.halaqaId,
    halaqaName: halaqa?.name ?? "—",
    levelType: student.levelType,
    hifzPercent: facePct(progress.hifzActual, progress.hifzTarget),
    actualFaces: progress.hifzActual,
    targetFaces: progress.hifzTarget,
    lateDays: completion.dayCounts.lateDays,
  };
}

export function computeAllHifzTrackingRows(
  halaqat: Halaqa[],
  students: Student[],
  grades: GradesStore,
  calendar: AcademicCalendar,
): HifzTrackingRow[] {
  const halaqaById = new Map(halaqat.map((h) => [h.id, h]));
  const rows: HifzTrackingRow[] = [];

  for (const student of students) {
    const halaqa = halaqaById.get(student.halaqaId);
    const row = computeStudentHifzTracking(student, halaqa, grades, calendar);
    if (row) rows.push(row);
  }

  return rows;
}

export type HifzTrackingSortKey = "percent-asc" | "percent-desc" | "faces-asc" | "faces-desc" | "late-asc" | "late-desc";

export function sortHifzTrackingRows(rows: HifzTrackingRow[], sortKey: HifzTrackingSortKey): HifzTrackingRow[] {
  const sorted = [...rows];
  switch (sortKey) {
    case "percent-asc":
      return sorted.sort((a, b) => a.hifzPercent - b.hifzPercent || a.studentName.localeCompare(b.studentName, "ar"));
    case "percent-desc":
      return sorted.sort((a, b) => b.hifzPercent - a.hifzPercent || a.studentName.localeCompare(b.studentName, "ar"));
    case "faces-asc":
      return sorted.sort((a, b) => a.actualFaces - b.actualFaces || a.studentName.localeCompare(b.studentName, "ar"));
    case "faces-desc":
      return sorted.sort((a, b) => b.actualFaces - a.actualFaces || a.studentName.localeCompare(b.studentName, "ar"));
    case "late-asc":
      return sorted.sort((a, b) => a.lateDays - b.lateDays || a.studentName.localeCompare(b.studentName, "ar"));
    case "late-desc":
      return sorted.sort((a, b) => b.lateDays - a.lateDays || a.studentName.localeCompare(b.studentName, "ar"));
    default:
      return sorted.sort((a, b) => a.studentName.localeCompare(b.studentName, "ar"));
  }
}
