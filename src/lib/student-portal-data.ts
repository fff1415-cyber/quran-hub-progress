import type { AcademicCalendar } from "@/lib/academic-context";
import {
  loadAttendanceArchive,
  loadGrades,
  type GradesStore,
} from "@/lib/mock-data";
import { getElapsedSemesterDays } from "@/lib/semester-grading";
import { attendanceTypeLabel } from "@/lib/student-profile-data";

export interface PortalAbsenceRow {
  date: string;
  dayKey: string;
  week: number;
  type: "absent" | "excused";
}

const DAY_AR: Record<string, string> = {
  sun: "الأحد",
  mon: "الاثنين",
  tue: "الثلاثاء",
  wed: "الأربعاء",
  thu: "الخميس",
};

export function dayNameAr(dayKey: string): string {
  return DAY_AR[dayKey] ?? dayKey;
}

export function formatPortalDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString("ar-SA", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

/** غياب واستئذان فقط — مع التاريخ من بداية الفصل. */
export function collectPortalAbsenceRows(
  studentId: string,
  calendar: AcademicCalendar,
  grades: GradesStore = loadGrades(),
): PortalAbsenceRow[] {
  const rows: PortalAbsenceRow[] = [];
  const seen = new Set<string>();

  for (const day of getElapsedSemesterDays(calendar)) {
    const att = grades[studentId]?.[day.weekNumber]?.days[day.dayKey]?.attendance;
    if (att !== "absent" && att !== "excused") continue;
    const key = `${day.iso}:${att}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      date: day.iso,
      dayKey: day.dayKey,
      week: day.weekNumber,
      type: att,
    });
  }

  const archive = loadAttendanceArchive().filter((a) => a.studentId === studentId);
  for (const a of archive) {
    if (a.type !== "absent" && a.type !== "excused") continue;
    const key = `${a.date || a.dayKey}:${a.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      date: a.date,
      dayKey: a.dayKey,
      week: a.week,
      type: a.type,
    });
  }

  return rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

export { attendanceTypeLabel };
