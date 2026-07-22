import {
  DAYS,
  loadAttendanceArchive,
  loadGrades,
  loadNotifications,
  type GradesStore,
  type Notification,
  type Student,
} from "@/lib/mock-data";
import { studentAcademicRecordsWithLegacy } from "@/lib/academic-record";

export interface AttendanceRow {
  date: string;
  dayKey: string;
  week: number;
  type: "absent" | "late" | "excused";
  source: "grades" | "archive";
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
}

const ATT_LABEL: Record<string, AttendanceRow["type"]> = {
  absent: "absent",
  late: "late",
  excused: "excused",
};

export function collectStudentAttendance(
  studentId: string,
  grades: GradesStore = loadGrades(),
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

  return rows.sort((a, b) => {
    const da = a.date || a.week;
    const db = b.date || b.week;
    return String(db).localeCompare(String(da));
  });
}

export function collectStudentTransfers(studentId: string): StudentTransferRow[] {
  return loadNotifications()
    .filter((n) => n.type === "transfer" && n.transferData?.studentId === studentId)
    .map((n) => transferToRow(n))
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

export function buildStudentProfileData(studentId: string): StudentProfileData {
  return {
    academic: studentAcademicRecordsWithLegacy(studentId),
    attendance: collectStudentAttendance(studentId),
    transfers: collectStudentTransfers(studentId),
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
