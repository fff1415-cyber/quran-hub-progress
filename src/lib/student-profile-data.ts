import {
  DAYS,
  loadAttendanceArchive,
  loadGrades,
  loadNotifications,
  type GradesStore,
  type Notification,
  type Student,
  type TransferActionRecord,
} from "@/lib/mock-data";
import type { AcademicPhaseRecord } from "@/lib/academic-record";
import { studentAcademicRecordsWithLegacy } from "@/lib/academic-record";
import type { AcademicCalendar } from "@/lib/academic-context";
import { getSemesterDayDateMap } from "@/lib/semester-grading";
import { transferActionRoleLabel } from "@/lib/transfer-actions";

export interface AttendanceRow {
  date: string;
  dayKey: string;
  week: number;
  type: "absent" | "late" | "excused";
  source: "grades" | "archive";
}

/** Teacher transfer to administration — treated as violation; date = day of transfer. */
export interface StudentViolationActionRow {
  role: string;
  byName: string;
  text: string;
  at: string;
}

export interface StudentViolationRow {
  id: string;
  date: string;
  type: string;
  fromName: string;
  week: number;
  status: string;
  actions: StudentViolationActionRow[];
}

export interface StudentTransferRow {
  id: string;
  date: string;
  fromName: string;
  reason: string;
  week: number;
  status: string;
  message: string;
}

export interface StudentProfileData {
  academic: AcademicPhaseRecord[];
  attendance: AttendanceRow[];
  transfers: StudentTransferRow[];
  violations: StudentViolationRow[];
}

const ATT_LABEL: Record<string, AttendanceRow["type"]> = {
  absent: "absent",
  late: "late",
  excused: "excused",
};

const DAY_AR: Record<string, string> = {
  sun: "الأحد",
  mon: "الاثنين",
  tue: "الثلاثاء",
  wed: "الأربعاء",
  thu: "الخميس",
};

export function formatProfileDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function dayKeyLabel(dayKey: string): string {
  return DAY_AR[dayKey] ?? dayKey;
}

function resolveAttendanceDates(
  rows: AttendanceRow[],
  calendar?: AcademicCalendar | null,
): AttendanceRow[] {
  if (!calendar) return rows;
  const map = getSemesterDayDateMap(calendar);
  if (map.size === 0) return rows;
  return rows.map((r) => {
    if (r.date) return r;
    const iso = map.get(`${r.week}:${r.dayKey}`);
    return iso ? { ...r, date: iso } : r;
  });
}

export function collectStudentAttendance(
  studentId: string,
  grades: GradesStore = loadGrades(),
  calendar?: AcademicCalendar | null,
): AttendanceRow[] {
  const rows: AttendanceRow[] = [];
  const weeks = grades[studentId] || {};
  Object.entries(weeks).forEach(([weekStr, w]) => {
    const week = parseInt(weekStr, 10);
    DAYS.forEach((d) => {
      const att = w.days[d.key]?.attendance;
      if (att && att !== "present" && ATT_LABEL[att]) {
        rows.push({
          date: "",
          dayKey: d.key,
          week,
          type: ATT_LABEL[att],
          source: "grades",
        });
      }
    });
  });

  const archive = loadAttendanceArchive().filter((a) => a.studentId === studentId);
  archive.forEach((a) => {
    rows.push({
      date: a.date,
      dayKey: a.dayKey,
      week: 0,
      type: a.type,
      source: "archive",
    });
  });

  const resolved = resolveAttendanceDates(rows, calendar);
  return resolved.sort((a, b) => {
    const da = a.date || `${a.week}:${a.dayKey}`;
    const db = b.date || `${b.week}:${b.dayKey}`;
    return db.localeCompare(da);
  });
}

export function collectStudentTransfers(studentId: string): StudentTransferRow[] {
  return loadNotifications()
    .filter((n) => isTeacherTransfer(n, studentId))
    .map((n) => transferToRow(n))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Original teacher → manager transfers only (not secretary/supervisor forwards). */
function isTeacherTransfer(n: Notification, studentId: string): boolean {
  return n.type === "transfer"
    && n.transferData?.studentId === studentId
    && !n.targetRole;
}

function mapActions(actions: TransferActionRecord[] | undefined): StudentViolationActionRow[] {
  return (actions ?? []).map((a) => ({
    role: transferActionRoleLabel(a.role),
    byName: a.byName,
    text: a.text,
    at: a.at,
  }));
}

/** Violations = teacher transfers; violation date is the transfer notification date. */
export function collectStudentViolations(studentId: string): StudentViolationRow[] {
  return loadNotifications()
    .filter((n) => isTeacherTransfer(n, studentId))
    .map((n) => {
      const td = n.transferData!;
      return {
        id: n.id,
        date: n.createdAt,
        type: td.reason,
        fromName: td.fromName,
        week: td.week,
        status: n.transferStatus ?? "pending",
        actions: mapActions(td.actions),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function transferToRow(n: Notification): StudentTransferRow {
  const td = n.transferData!;
  return {
    id: n.id,
    date: n.createdAt,
    fromName: td.fromName,
    reason: td.reason,
    week: td.week,
    status: n.transferStatus ?? "pending",
    message: n.message,
  };
}

export function buildStudentProfileData(
  studentId: string,
  calendar?: AcademicCalendar | null,
): StudentProfileData {
  const transfers = collectStudentTransfers(studentId);
  return {
    academic: studentAcademicRecordsWithLegacy(studentId),
    attendance: collectStudentAttendance(studentId, loadGrades(), calendar),
    transfers,
    violations: collectStudentViolations(studentId),
  };
}

export function matchesStudentSearch(student: Student, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  return student.name.includes(q) || student.nationalId.includes(q);
}

export function attendanceTypeLabel(type: AttendanceRow["type"]): string {
  return type === "absent" ? "غياب" : type === "late" ? "تأخر" : "استئذان";
}

export function transferStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: "عند الإدارة",
    to_secretary: "محوّل للسكرتير",
    to_supervisor: "محوّل للمشرف",
    struggling: "يحتاج متابعة",
    closed: "مُغلق",
  };
  return map[status] ?? status;
}

export function violationCategoryLabel(): string {
  return "تحويل للإدارة";
}
