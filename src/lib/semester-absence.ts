import type { AcademicCalendar } from "@/lib/academic-context";
import {
  loadGrades,
  loadNotifications,
  loadStudents,
  pushNotification,
  type GradesStore,
  type Student,
} from "@/lib/mock-data";
import { getElapsedSemesterDays, getTotalSemesterWorkingDays } from "@/lib/semester-grading";
import { hasAuthToken } from "@/lib/auth-session";

export const ABSENCE_THRESHOLDS = [10, 20, 30, 50] as const;
export type AbsenceThreshold = (typeof ABSENCE_THRESHOLDS)[number];

const ALERTS_KEY = "qs_absence_threshold_alerts_v1";
export const ABSENCE_ALERTS_APP_STATE_KEY = "absence_threshold_alerts";

interface AlertRecord {
  [key: string]: AbsenceThreshold[];
}

function alertKey(semesterId: string, studentId: string): string {
  return `${semesterId}:${studentId}`;
}

function mergeAlertRecords(a: AlertRecord, b: AlertRecord): AlertRecord {
  const merged: AlertRecord = { ...a };
  for (const [key, thresholds] of Object.entries(b)) {
    const prev = merged[key] ?? [];
    merged[key] = [...new Set([...prev, ...thresholds])].sort((x, y) => x - y);
  }
  return merged;
}

function readLocalAlertRecord(): AlertRecord {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(ALERTS_KEY) || "{}") as AlertRecord;
  } catch {
    return {};
  }
}

function writeLocalAlertRecord(rec: AlertRecord): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ALERTS_KEY, JSON.stringify(rec));
}

function loadAlertRecord(): AlertRecord {
  return readLocalAlertRecord();
}

function saveAlertRecord(rec: AlertRecord, options?: { skipCloud?: boolean }): void {
  writeLocalAlertRecord(rec);
  if (options?.skipCloud || typeof window === "undefined" || !hasAuthToken()) return;
  if (sessionStorage.getItem("qs_syncing") === "1") return;
  void import("./cloud-sync")
    .then((m) => m.pushAppState(ABSENCE_ALERTS_APP_STATE_KEY, rec))
    .catch(() => undefined);
}

/** Merge cloud alert record into local cache (during roster sync). */
export function mergeAbsenceAlertRecordFromCloud(cloud: unknown): void {
  if (!cloud || typeof cloud !== "object") return;
  const merged = mergeAlertRecords(readLocalAlertRecord(), cloud as AlertRecord);
  writeLocalAlertRecord(merged);
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
  const totalSchoolDays = getTotalSemesterWorkingDays(calendar);
  if (totalSchoolDays <= 0) {
    return { totalSchoolDays: 0, absences: 0, percent: 0 };
  }

  let absences = 0;
  for (const day of getElapsedSemesterDays(calendar)) {
    const att = grades[studentId]?.[day.weekNumber]?.days?.[day.dayKey]?.attendance;
    if (att === "absent") absences++;
  }

  const percent = Math.round((absences / totalSchoolDays) * 100);
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

function absenceAlertAlreadySent(
  student: Student,
  threshold: AbsenceThreshold,
  semId: string,
): boolean {
  const fired = loadAlertRecord()[alertKey(semId, student.id)] ?? [];
  if (fired.includes(threshold)) return true;

  const marker = `غياب ${threshold}%`;
  return loadNotifications().some(
    (n) =>
      n.type === "absence" &&
      n.message.includes(student.name) &&
      (n.message.includes(marker) || n.message.includes(THRESHOLD_LABEL[threshold])),
  );
}

/** Process new threshold crossings — secretary alerts + manager transfers at 30% and 50%. */
export function processAbsenceThresholdAlerts(calendar: AcademicCalendar): number {
  if (!calendar.semester?.start_date || getTotalSemesterWorkingDays(calendar) <= 0) {
    return 0;
  }

  const semId = calendar.semester.id;
  const rec = loadAlertRecord();
  const rows = listAbsenceAlertRows(calendar);
  let created = 0;
  let dirty = false;

  for (const row of rows) {
    for (const threshold of row.pendingThresholds) {
      if (absenceAlertAlreadySent(row.student, threshold, semId)) {
        const key = alertKey(semId, row.student.id);
        if (!(rec[key] ?? []).includes(threshold)) {
          rec[key] = [...(rec[key] ?? []), threshold];
          dirty = true;
        }
        continue;
      }

      const key = alertKey(semId, row.student.id);
      rec[key] = [...(rec[key] ?? []), threshold];

      if (threshold === 10 || threshold === 20) {
        pushNotification({
          message: `${row.student.name}: ${THRESHOLD_LABEL[threshold]} (${row.stats.percent}% — ${row.stats.absences} من ${row.stats.totalSchoolDays} يوم)`,
          type: "absence",
          targetRole: "secretary",
          transferData: {
            studentId: row.student.id,
            halaqaId: row.student.halaqaId,
            week: calendar.currentWeekNumber,
            reason: `غياب ${threshold}%`,
            fromName: "النظام — الغياب",
          },
        });
      }

      if (threshold === 30 || threshold === 50) {
        pushNotification({
          message: `${row.student.name}: ${THRESHOLD_LABEL[threshold]} (${row.stats.percent}% — ${row.stats.absences} من ${row.stats.totalSchoolDays} يوم)`,
          type: "absence",
          targetRole: "secretary",
          transferData: {
            studentId: row.student.id,
            halaqaId: row.student.halaqaId,
            week: calendar.currentWeekNumber,
            reason: `غياب ${threshold}%`,
            fromName: "النظام — الغياب",
          },
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
      dirty = true;
    }
  }

  if (dirty) saveAlertRecord(rec);
  return created;
}

export function thresholdBadgeLabel(t: AbsenceThreshold): string {
  return THRESHOLD_LABEL[t];
}
