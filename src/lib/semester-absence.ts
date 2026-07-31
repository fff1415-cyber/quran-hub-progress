import type { AcademicCalendar } from "@/lib/academic-context";
import { workingDayKeysFromSemester } from "@/lib/academic-context";
import { isoDateToDayKey, formatLocalIsoDate } from "@/lib/operational-date";
import {
  loadGrades,
  loadNotifications,
  loadStudents,
  pushNotification,
  type GradesStore,
  type Student,
} from "@/lib/mock-data";

export const ABSENCE_THRESHOLDS = [10, 20, 30, 50] as const;
export type AbsenceThreshold = (typeof ABSENCE_THRESHOLDS)[number];

const ALERTS_KEY = "qs_absence_threshold_alerts_v1";

interface AlertRecord {
  [key: string]: AbsenceThreshold[];
}

function alertKey(semesterId: string, studentId: string): string {
  return `${semesterId}:${studentId}`;
}

function loadAlertRecord(): AlertRecord {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(ALERTS_KEY) || "{}") as AlertRecord;
  } catch {
    return {};
  }
}

function saveAlertRecord(rec: AlertRecord): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ALERTS_KEY, JSON.stringify(rec));
}

function weekNumberForDate(iso: string, calendar: AcademicCalendar): number | null {
  for (const w of calendar.weeks) {
    if (w.start_date && w.end_date && iso >= w.start_date && iso <= w.end_date) {
      return w.week_number;
    }
  }
  return null;
}

export interface SemesterAbsenceStats {
  totalSchoolDays: number;
  absences: number;
  percent: number;
}

export function semesterAbsenceStats(
  studentId: string,
  grades: GradesStore,
  calendar: AcademicCalendar,
): SemesterAbsenceStats {
  const sem = calendar.semester;
  if (!sem?.start_date) {
    return { totalSchoolDays: 0, absences: 0, percent: 0 };
  }

  const working = workingDayKeysFromSemester(sem.working_days);
  const excluded = new Set(sem.excluded_dates ?? []);
  const start = new Date(`${sem.start_date}T12:00:00`);
  const end = new Date(`${calendar.operationalDate}T12:00:00`);

  let totalSchoolDays = 0;
  let absences = 0;

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = formatLocalIsoDate(d);
    const dayKey = isoDateToDayKey(iso);
    if (!working.has(dayKey) || excluded.has(iso)) continue;

    const weekNum = weekNumberForDate(iso, calendar);
    if (weekNum === null || weekNum > calendar.currentWeekNumber) continue;

    totalSchoolDays++;
    const att = grades[studentId]?.[weekNum]?.days?.[dayKey]?.attendance;
    if (att === "absent") absences++;
  }

  const percent = totalSchoolDays > 0 ? Math.round((absences / totalSchoolDays) * 100) : 0;
  return { totalSchoolDays, absences, percent };
}

export interface AbsenceAlertRow {
  student: Student;
  stats: SemesterAbsenceStats;
  highestThreshold: AbsenceThreshold | null;
  pendingThresholds: AbsenceThreshold[];
}

function highestCrossedThreshold(percent: number): AbsenceThreshold | null {
  let hit: AbsenceThreshold | null = null;
  for (const t of ABSENCE_THRESHOLDS) {
    if (percent >= t) hit = t;
  }
  return hit;
}

export function listAbsenceAlertRows(calendar: AcademicCalendar): AbsenceAlertRow[] {
  const students = loadStudents();
  const grades = loadGrades();
  const rec = loadAlertRecord();
  const semId = calendar.semester?.id ?? "default";

  return students
    .map((student) => {
      const stats = semesterAbsenceStats(student.id, grades, calendar);
      const fired = rec[alertKey(semId, student.id)] ?? [];
      const pendingThresholds = ABSENCE_THRESHOLDS.filter(
        (t) => stats.percent >= t && !fired.includes(t),
      );
      return {
        student,
        stats,
        highestThreshold: highestCrossedThreshold(stats.percent),
        pendingThresholds,
      };
    })
    .filter((r) => r.stats.percent >= 10)
    .sort((a, b) => b.stats.percent - a.stats.percent);
}

const THRESHOLD_LABEL: Record<AbsenceThreshold, string> = {
  10: "تنبيه أول — تجاوز غياب 10%",
  20: "تنبيه ثاني — تجاوز غياب 20%",
  30: "تنبيه ثالث — تجاوز غياب 30% — تحويل للمدير",
  50: "استبعاد — تجاوز غياب 50% — تحويل للمدير",
};

/** Process new threshold crossings — secretary alerts + manager transfers at 30% and 50%. */
export function processAbsenceThresholdAlerts(calendar: AcademicCalendar): number {
  const semId = calendar.semester?.id ?? "default";
  const rec = loadAlertRecord();
  const rows = listAbsenceAlertRows(calendar);
  let created = 0;

  for (const row of rows) {
    for (const threshold of row.pendingThresholds) {
      const key = alertKey(semId, row.student.id);
      rec[key] = [...(rec[key] ?? []), threshold];

      if (threshold === 10 || threshold === 20) {
        pushNotification({
          message: `${row.student.name}: ${THRESHOLD_LABEL[threshold]} (${row.stats.percent}% — ${row.stats.absences} من ${row.stats.totalSchoolDays} يوم)`,
          type: "absence",
          targetRole: "secretary",
        });
      }

      if (threshold === 30 || threshold === 50) {
        pushNotification({
          message: `${row.student.name}: ${THRESHOLD_LABEL[threshold]} (${row.stats.percent}%)`,
          type: "absence",
          targetRole: "secretary",
        });

        const exists = loadNotifications().some(
          (n) =>
            n.type === "transfer" &&
            n.transferData?.studentId === row.student.id &&
            n.transferData?.reason.includes(`غياب ${threshold}%`) &&
            n.transferStatus !== "closed",
        );

        if (!exists) {
          pushNotification({
            message: `تحويل للمدير: ${row.student.name} — ${THRESHOLD_LABEL[threshold]} (${row.stats.percent}%)`,
            type: "transfer",
            actionTab: "transfers",
            transferStatus: "pending",
            transferData: {
              studentId: row.student.id,
              halaqaId: row.student.halaqaId,
              week: calendar.currentWeekNumber,
              reason: `غياب ${threshold}% (${row.stats.absences}/${row.stats.totalSchoolDays} يوم)`,
              fromName: "النظام — الغياب",
            },
          });
        }
      }

      created++;
    }
  }

  if (created > 0) saveAlertRecord(rec);
  return created;
}

export function thresholdBadgeLabel(t: AbsenceThreshold): string {
  return THRESHOLD_LABEL[t];
}
