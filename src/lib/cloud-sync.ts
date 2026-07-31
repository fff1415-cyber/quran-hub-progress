// Cloud sync layer — all data via Hostinger PHP API
import type { GradesStore, Halaqa, LatePermission, MessageTemplateKey, Notification, SardHistoryItem, SardQueueItem, Student } from "./mock-data";
import { saveGrades, saveHalaqat, saveLatePermissions, saveMessageTemplates, saveNotifications, saveSardHistory, saveSardQueue, saveStudents, ensureGradesSemester } from "./mock-data";
import { saveWeeklyTestsSettings, saveWeeklyTests, ensureWeeklyTestsSemester } from "./weekly-tests";
import { saveStaffAttendanceSettings, saveStaffCheckIns } from "./staff-attendance";
import { saveStudentPortalVisibility, type StudentPortalVisibility } from "./student-portal-settings";
import { saveTarbawiStore, type TarbawiStore, ensureTarbawiSemester } from "./tarbawi-program";
import type { AcademicPhaseRecord } from "./academic-record";
import { saveAcademicRecords } from "./academic-record";
import type { HalaqaProgramsStore, HalaqaProgramGradesStore } from "./halaqa-programs";
import { saveAllHalaqaPrograms, saveAllProgramGrades } from "./halaqa-programs";
import {
  secureListStudents,
  secureListHalaqatFull,
  listPublicStudents,
  listPublicHalaqat,
  secureUpsertStudents,
  securePatchStudent,
  secureDeleteStudent,
  secureUpsertHalaqat,
  secureDeleteHalaqa,
  secureListRoleAccounts,
  secureUpsertRoleAccount,
  secureDeleteRoleAccount,
  secureListAppState,
  secureSetAppState,
} from "./secure-data.functions";
import { fetchActiveCalendar } from "./academic-context";

const TOKEN_KEY = "qs_token";
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string) {
  if (typeof window !== "undefined") sessionStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  if (typeof window !== "undefined") sessionStorage.removeItem(TOKEN_KEY);
}

interface CloudStudentRow {
  id: string;
  name: string;
  halaqa_id: number;
  national_id?: string;
  parent_phone?: string;
  student_phone?: string;
  level: string;
  level_type: string;
  institute_level?: string | null;
  phase_number?: number | null;
  assigned_to: string | null;
  memorized: string | null;
}

interface CloudHalaqaRow {
  id: number;
  name: string;
  is_talqeen: boolean | number;
  teacher_name: string;
  teacher_code?: string;
  assistant_name: string;
  assistant_code?: string;
}

function rowToStudent(r: CloudStudentRow): Student {
  const phaseFromRow = r.phase_number ?? parseInt(r.level, 10);
  const phaseNumber = Number.isFinite(phaseFromRow) && phaseFromRow > 0 ? phaseFromRow : undefined;
  return {
    id: r.id,
    name: r.name,
    halaqaId: r.halaqa_id,
    nationalId: r.national_id ?? "",
    parentPhone: r.parent_phone ?? "",
    studentPhone: r.student_phone ?? undefined,
    level: r.level,
    levelType: r.level_type === "silver" ? "silver" : "gold",
    instituteLevel: r.institute_level ?? undefined,
    phaseNumber,
    assignedTo: (r.assigned_to as "teacher" | "assistant" | undefined) ?? undefined,
    memorized: r.memorized ?? undefined,
  };
}
function rowToHalaqa(r: CloudHalaqaRow): Halaqa {
  return {
    id: r.id,
    name: r.name,
    isTalqeen: Boolean(r.is_talqeen),
    teacherName: r.teacher_name,
    teacherCode: r.teacher_code ?? "",
    assistantName: r.assistant_name,
    assistantCode: r.assistant_code ?? "",
  };
}
function studentToRow(s: Student): CloudStudentRow {
  const phase = s.phaseNumber ?? parseInt(s.level, 10);
  return {
    id: s.id,
    name: s.name,
    halaqa_id: s.halaqaId,
    national_id: s.nationalId,
    parent_phone: s.parentPhone,
    student_phone: s.studentPhone ?? "",
    level: s.level,
    level_type: s.levelType,
    institute_level: s.instituteLevel ?? null,
    phase_number: Number.isFinite(phase) && phase > 0 ? phase : null,
    assigned_to: s.assignedTo ?? null,
    memorized: s.memorized ?? null,
  };
}
function halaqaToRow(h: Halaqa): CloudHalaqaRow {
  return {
    id: h.id,
    name: h.name,
    is_talqeen: h.isTalqeen,
    teacher_name: h.teacherName,
    teacher_code: h.teacherCode,
    assistant_name: h.assistantName,
    assistant_code: h.assistantCode,
  };
}

export async function syncFromCloud(): Promise<{ students: Student[]; halaqat: Halaqa[] } | null> {
  try {
    const token = getToken();
    let halaqat: Halaqa[];
    let students: Student[];

    if (token) {
      const [h, s] = await Promise.all([
        secureListHalaqatFull({ data: { token } }),
        secureListStudents({ data: { token } }),
      ]);
      halaqat = (h as CloudHalaqaRow[]).map(rowToHalaqa);
      students = (s as CloudStudentRow[]).map(rowToStudent);
    } else {
      const [h, s] = await Promise.all([listPublicHalaqat(), listPublicStudents()]);
      halaqat = (h as CloudHalaqaRow[]).map(rowToHalaqa);
      students = (s as CloudStudentRow[]).map(rowToStudent);
    }

    if (token) {
      const calendar = await fetchActiveCalendar(true);
      const semesterReset = ensureGradesSemester(calendar.semester?.id ?? null);
      const weeklyTestsReset = ensureWeeklyTestsSemester(calendar.semester?.id ?? null);
      const tarbawiReset = ensureTarbawiSemester(calendar.semester?.id ?? null);

      const stateRows = await secureListAppState({ data: { token } });
      const state = new Map(stateRows.map((row) => [row.key, row.value]));
      sessionStorage.setItem("qs_syncing", "1");
      if (!semesterReset && state.has("grades")) saveGrades(state.get("grades") as GradesStore);
      if (!weeklyTestsReset && state.has("weekly_tests")) saveWeeklyTests(state.get("weekly_tests") as import("./weekly-tests").WeeklyTestsStore);
      if (state.has("weekly_tests_settings")) saveWeeklyTestsSettings(state.get("weekly_tests_settings") as import("./weekly-tests").WeeklyTestsSettings);
      if (state.has("staff_attendance_settings")) saveStaffAttendanceSettings(state.get("staff_attendance_settings") as import("./staff-attendance").StaffAttendanceSettings);
      if (state.has("staff_attendance")) saveStaffCheckIns(state.get("staff_attendance") as import("./staff-attendance").StaffCheckIn[]);
      if (state.has("sard_queue")) saveSardQueue(state.get("sard_queue") as SardQueueItem[]);
      if (state.has("sard_history")) saveSardHistory(state.get("sard_history") as SardHistoryItem[]);
      if (state.has("academic_records")) saveAcademicRecords(state.get("academic_records") as AcademicPhaseRecord[]);
      if (state.has("halaqa_programs")) saveAllHalaqaPrograms(state.get("halaqa_programs") as HalaqaProgramsStore);
      if (state.has("halaqa_program_grades")) saveAllProgramGrades(state.get("halaqa_program_grades") as HalaqaProgramGradesStore);
      if (state.has("notifications")) saveNotifications(state.get("notifications") as Notification[]);
      if (state.has("message_templates")) saveMessageTemplates(state.get("message_templates") as Record<MessageTemplateKey, string>);
      if (state.has("late_permissions")) saveLatePermissions(state.get("late_permissions") as LatePermission[]);
      if (state.has("student_portal_settings")) saveStudentPortalVisibility(state.get("student_portal_settings") as StudentPortalVisibility);
      if (!tarbawiReset && state.has("tarbawi_program")) saveTarbawiStore(state.get("tarbawi_program") as TarbawiStore);
      sessionStorage.removeItem("qs_syncing");

      if (semesterReset) {
        try {
          await secureSetAppState({ data: { token, key: "grades", value: {} } });
          await secureSetAppState({ data: { token, key: "weekly_tests", value: {} } });
        } catch {
          /* local reset is enough */
        }
      }
      if (tarbawiReset) {
        try {
          await secureSetAppState({ data: { token, key: "tarbawi_program", value: { settingsBySemester: {}, plans: {} } } });
        } catch {
          /* local reset is enough */
        }
      }
    }

    saveHalaqat(halaqat);
    saveStudents(students);
    return { students, halaqat };
  } catch (e) {
    console.warn("Cloud sync failed, using local cache:", e);
    return null;
  }
}

function tokenOrThrow(): string {
  const t = getToken();
  if (!t) throw new Error("الجلسة منتهية — أعد تسجيل الدخول");
  return t;
}

export async function pushStudents(students: Student[]) {
  if (students.length === 0) {
    saveStudents(students);
    return;
  }
  await secureUpsertStudents({ data: { token: tokenOrThrow(), students: students.map(studentToRow) } });
  saveStudents(students);
}

export async function patchStudent(id: string, patch: Partial<Student>) {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.halaqaId !== undefined) row.halaqa_id = patch.halaqaId;
  if (patch.nationalId !== undefined) row.national_id = patch.nationalId;
  if (patch.parentPhone !== undefined) row.parent_phone = patch.parentPhone;
  if (patch.studentPhone !== undefined) row.student_phone = patch.studentPhone ?? "";
  if (patch.level !== undefined) row.level = patch.level;
  if (patch.levelType !== undefined) row.level_type = patch.levelType;
  if (patch.instituteLevel !== undefined) row.institute_level = patch.instituteLevel ?? null;
  if (patch.phaseNumber !== undefined) row.phase_number = patch.phaseNumber ?? null;
  if ("assignedTo" in patch) row.assigned_to = patch.assignedTo ?? null;
  if ("memorized" in patch) row.memorized = patch.memorized ?? null;
  await securePatchStudent({ data: { token: tokenOrThrow(), id, patch: row } });
}

export async function deleteStudent(id: string) {
  await secureDeleteStudent({ data: { token: tokenOrThrow(), id } });
}

export async function pushHalaqat(halaqat: Halaqa[]) {
  if (halaqat.length === 0) {
    saveHalaqat(halaqat);
    return;
  }
  await secureUpsertHalaqat({ data: { token: tokenOrThrow(), halaqat: halaqat.map(halaqaToRow) } });
  saveHalaqat(halaqat);
}

export async function deleteHalaqa(id: number) {
  await secureDeleteHalaqa({ data: { token: tokenOrThrow(), id } });
}

export interface CloudRoleAccount {
  id: string;
  role: string;
  name: string;
  code: string;
  permissions: string[];
}

export async function loadRoleAccountsCloud(): Promise<CloudRoleAccount[]> {
  const rows = await secureListRoleAccounts({ data: { token: tokenOrThrow() } });
  return (rows ?? []) as CloudRoleAccount[];
}

export async function upsertRoleAccount(acc: {
  id?: string;
  role: string;
  name: string;
  code: string;
  permissions: string[];
}) {
  await secureUpsertRoleAccount({ data: { token: tokenOrThrow(), account: acc } });
}

export async function deleteRoleAccount(id: string) {
  await secureDeleteRoleAccount({ data: { token: tokenOrThrow(), id } });
}

export async function pushAppState(
  key: "grades" | "sard_queue" | "sard_history" | "academic_records" | "halaqa_programs" | "halaqa_program_grades" | "notifications" | "message_templates" | "late_permissions" | "weekly_tests" | "weekly_tests_settings" | "staff_attendance" | "staff_attendance_settings" | "student_portal_settings" | "tarbawi_program",
  value: unknown,
) {
  await secureSetAppState({ data: { token: tokenOrThrow(), key, value } });
}
