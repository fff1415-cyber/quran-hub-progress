// Cloud sync layer — all data via Hostinger PHP API
import type { GradesStore, Halaqa, LatePermission, MessageTemplateKey, Notification, SardHistoryItem, SardQueueItem, Student } from "./mock-data";
import {
  saveGrades,
  saveHalaqat,
  saveLatePermissions,
  saveMessageTemplates,
  saveNotifications,
  saveSardHistory,
  saveSardQueue,
  saveStudents,
  loadStudents,
  loadHalaqat,
  loadGrades,
  mergeGradesStores,
  ensureGradesSemester,
} from "./mock-data";
import { saveWeeklyTestsSettings, saveWeeklyTests, ensureWeeklyTestsSemester } from "./weekly-tests";
import { saveStaffAttendanceSettings, saveStaffCheckIns } from "./staff-attendance";
import { saveStudentPortalVisibility, type StudentPortalVisibility } from "./student-portal-settings";
import { saveComplexFeatures, type ComplexFeatures } from "./complex-features";
import { saveFinancialLedger, type FinancialLedgerStore } from "./financial-ledger";
import { savePushNotificationSettings, type PushNotificationSettings } from "./push-notification-settings";
import { saveTarbawiStore, type TarbawiStore, ensureTarbawiSemester, mergeTarbawiStores, loadTarbawiStore } from "./tarbawi-program";
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
import { fetchActiveCalendar, loadCachedCalendar } from "./academic-context";
import { mergeAbsenceAlertRecordFromCloud, ABSENCE_ALERTS_APP_STATE_KEY } from "./semester-absence";
import { getActiveComplexId } from "@/lib/tenant";
import {
  getAuthItem,
  getToken,
  setToken,
  clearToken,
  hasAuthToken,
} from "@/lib/auth-session";

export { getToken, setToken, clearToken, hasAuthToken };

const SYNC_FRESH_KEY = "qs_cloud_sync_at";
/** Skip full roster + app_state pull when synced recently (navigation within session). */
const SYNC_TTL_MS = 3 * 60 * 1000;

export function isCloudSyncFresh(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  const raw = sessionStorage.getItem(SYNC_FRESH_KEY);
  if (!raw) return false;
  const at = Number(raw);
  return Number.isFinite(at) && Date.now() - at < SYNC_TTL_MS;
}

export function markCloudSyncFresh(): void {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(SYNC_FRESH_KEY, String(Date.now()));
  }
}

export function invalidateCloudSyncCache(): void {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(SYNC_FRESH_KEY);
  }
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
    halaqaId: Number(r.halaqa_id),
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
    id: Number(r.id),
    name: r.name,
    isTalqeen: Boolean(r.is_talqeen),
    teacherName: r.teacher_name ?? "",
    teacherCode: r.teacher_code ?? "",
    assistantName: r.assistant_name ?? "",
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

function resolveComplexIdHint(explicit?: number): number | undefined {
  if (explicit && explicit > 0) return explicit;
  const active = getActiveComplexId();
  if (active && active > 0) return active;
  const fromSession = Number(getAuthItem("qs_complex") ?? 0);
  return Number.isFinite(fromSession) && fromSession > 0 ? fromSession : undefined;
}

/** Fetch halaqat for a known complex id — does not depend on module-level tenant cache alone. */
export async function fetchHalaqatForComplex(complexId: number): Promise<Halaqa[]> {
  if (!Number.isFinite(complexId) || complexId <= 0) return [];

  const token = getToken();
  let rows: CloudHalaqaRow[] = [];

  if (token) {
    const auth = await Promise.allSettled([secureListHalaqatFull({ data: { token } })]);
    if (auth[0].status === "fulfilled" && Array.isArray(auth[0].value) && auth[0].value.length > 0) {
      rows = auth[0].value as CloudHalaqaRow[];
    }
  }

  if (rows.length === 0) {
    try {
      const pub = await listPublicHalaqat(complexId);
      if (Array.isArray(pub)) rows = pub as CloudHalaqaRow[];
    } catch (e) {
      console.warn("Public halaqat fetch failed:", e);
    }
  }

  const halaqat = rows
    .map(rowToHalaqa)
    .filter((h) => Number.isFinite(h.id) && h.id > 0 && h.name.trim() !== "");

  if (halaqat.length > 0) saveHalaqat(halaqat);
  return halaqat;
}

/** Fetch halaqat from API — authenticated first, then public fallback. Always caches locally. */
export async function fetchHalaqatRoster(complexId?: number): Promise<Halaqa[]> {
  const cid = resolveComplexIdHint(complexId);
  if (cid) return fetchHalaqatForComplex(cid);

  const token = getToken();
  let rows: CloudHalaqaRow[] = [];

  if (token) {
    const auth = await Promise.allSettled([
      secureListHalaqatFull({ data: { token } }),
    ]);
    if (auth[0].status === "fulfilled" && Array.isArray(auth[0].value)) {
      rows = auth[0].value as CloudHalaqaRow[];
    }
  }

  if (rows.length === 0) {
    try {
      const pub = await listPublicHalaqat();
      if (Array.isArray(pub)) rows = pub as CloudHalaqaRow[];
    } catch (e) {
      console.warn("Public halaqat fetch failed:", e);
    }
  }

  const halaqat = rows
    .map(rowToHalaqa)
    .filter((h) => Number.isFinite(h.id) && h.id > 0 && h.name.trim() !== "");

  if (halaqat.length > 0) saveHalaqat(halaqat);
  return halaqat;
}

export async function syncFromCloud(options?: {
  force?: boolean;
}): Promise<{ students: Student[]; halaqat: Halaqa[] } | null> {
  try {
    if (!options?.force && isCloudSyncFresh()) {
      return { students: loadStudents(), halaqat: loadHalaqat() };
    }

    const token = getToken();
    let halaqat: Halaqa[];
    let students: Student[];

    if (token) {
      const [hResult, sResult] = await Promise.allSettled([
        secureListHalaqatFull({ data: { token } }),
        secureListStudents({ data: { token } }),
      ]);
      if (hResult.status === "fulfilled") {
        halaqat = (hResult.value as CloudHalaqaRow[]).map(rowToHalaqa);
      } else {
        halaqat = await fetchHalaqatRoster();
      }
      if (sResult.status === "fulfilled") {
        students = (sResult.value as CloudStudentRow[]).map(rowToStudent);
      } else {
        try {
          students = ((await listPublicStudents()) as CloudStudentRow[]).map(rowToStudent);
        } catch {
          students = [];
        }
      }
    } else {
      const [hResult, sResult] = await Promise.allSettled([
        listPublicHalaqat(),
        listPublicStudents(),
      ]);
      halaqat =
        hResult.status === "fulfilled"
          ? (hResult.value as CloudHalaqaRow[]).map(rowToHalaqa)
          : [];
      students =
        sResult.status === "fulfilled"
          ? (sResult.value as CloudStudentRow[]).map(rowToStudent)
          : [];
      if (halaqat.length === 0) {
        halaqat = await fetchHalaqatRoster();
      }
    }

    // Persist core roster first — never overwrite existing cache with an empty list.
    if (halaqat.length > 0) saveHalaqat(halaqat);
    saveStudents(students);

    if (token) {
      try {
        const calendar = await fetchActiveCalendar(!loadCachedCalendar());
        const semesterReset = ensureGradesSemester(calendar.semester?.id ?? null);
        const weeklyTestsReset = ensureWeeklyTestsSemester(calendar.semester?.id ?? null);
        const tarbawiReset = ensureTarbawiSemester(calendar.semester?.id ?? null);

        const stateRows = await secureListAppState({ data: { token } });
        const state = new Map(stateRows.map((row) => [row.key, row.value]));
        sessionStorage.setItem("qs_syncing", "1");
        if (!semesterReset && state.has("grades")) {
          const cloud = state.get("grades") as GradesStore;
          saveGrades(mergeGradesStores(loadGrades(), cloud), { sync: false });
        }
        if (!weeklyTestsReset && state.has("weekly_tests")) saveWeeklyTests(state.get("weekly_tests") as import("./weekly-tests").WeeklyTestsStore);
        if (state.has("weekly_tests_settings")) saveWeeklyTestsSettings(state.get("weekly_tests_settings") as import("./weekly-tests").WeeklyTestsSettings);
        if (state.has("staff_attendance_settings")) saveStaffAttendanceSettings(state.get("staff_attendance_settings") as import("./staff-attendance").StaffAttendanceSettings);
        if (state.has("staff_attendance")) saveStaffCheckIns(state.get("staff_attendance") as import("./staff-attendance").StaffCheckIn[]);
        if (state.has("sard_queue")) saveSardQueue(state.get("sard_queue") as SardQueueItem[]);
        if (state.has("sard_history")) saveSardHistory(state.get("sard_history") as SardHistoryItem[]);
        if (state.has("academic_records")) saveAcademicRecords(state.get("academic_records") as AcademicPhaseRecord[]);
        if (state.has("halaqa_programs")) saveAllHalaqaPrograms(state.get("halaqa_programs") as HalaqaProgramsStore);
        if (state.has("halaqa_program_grades")) saveAllProgramGrades(state.get("halaqa_program_grades") as HalaqaProgramGradesStore);
        if (state.has("scientific_grades")) {
          const { replaceScientificGradesStore } = await import("./scientific-grades");
          replaceScientificGradesStore(state.get("scientific_grades") as import("./scientific-grades").ScientificGradesStore);
        }
        if (state.has("notifications")) saveNotifications(state.get("notifications") as Notification[]);
        if (state.has(ABSENCE_ALERTS_APP_STATE_KEY)) {
          mergeAbsenceAlertRecordFromCloud(state.get(ABSENCE_ALERTS_APP_STATE_KEY));
        }
        if (state.has("message_templates")) saveMessageTemplates(state.get("message_templates") as Record<MessageTemplateKey, string>);
        if (state.has("late_permissions")) saveLatePermissions(state.get("late_permissions") as LatePermission[]);
        if (state.has("student_portal_settings")) saveStudentPortalVisibility(state.get("student_portal_settings") as StudentPortalVisibility);
        if (state.has("push_notification_settings")) {
          savePushNotificationSettings(state.get("push_notification_settings") as PushNotificationSettings);
        }
        if (state.has("complex_features")) saveComplexFeatures(state.get("complex_features") as ComplexFeatures);
        if (state.has("financial_ledger")) saveFinancialLedger(state.get("financial_ledger") as FinancialLedgerStore);
        if (!tarbawiReset && state.has("tarbawi_program")) {
          const cloud = state.get("tarbawi_program") as TarbawiStore;
          const local = loadTarbawiStore();
          const { merged, pushToCloud } = mergeTarbawiStores(local, cloud);
          saveTarbawiStore(merged);
          if (pushToCloud) {
            try {
              await secureSetAppState({ data: { token, key: "tarbawi_program", value: merged } });
            } catch {
              /* local merge kept — will retry on next save */
            }
          }
        } else if (!tarbawiReset && !state.has("tarbawi_program")) {
          const local = loadTarbawiStore();
          const hasLocal = Object.keys(local.settingsBySemester).length > 0 || Object.keys(local.plans).length > 0;
          if (hasLocal) {
            try {
              await secureSetAppState({ data: { token, key: "tarbawi_program", value: local } });
            } catch {
              /* ignore */
            }
          }
        }
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
      } catch (stateErr) {
        sessionStorage.removeItem("qs_syncing");
        console.warn("Cloud app-state sync failed (roster kept):", stateErr);
      }
    }

    markCloudSyncFresh();
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
    saveHalaqat(halaqat, { allowEmpty: true });
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
  key: "grades" | "sard_queue" | "sard_history" | "academic_records" | "halaqa_programs" | "halaqa_program_grades" | "scientific_grades" | "notifications" | "message_templates" | "late_permissions" | "weekly_tests" | "weekly_tests_settings" | "staff_attendance" | "staff_attendance_settings" | "student_portal_settings" | "complex_features" | "push_notification_settings" | "tarbawi_program" | "financial_ledger" | typeof ABSENCE_ALERTS_APP_STATE_KEY,
  value: unknown,
) {
  await secureSetAppState({ data: { token: tokenOrThrow(), key, value } });
}

export async function fetchCloudGrades(): Promise<GradesStore> {
  const rows = await secureListAppState({ data: { token: tokenOrThrow(), key: "grades" } });
  const row = rows.find((r) => r.key === "grades");
  if (!row || row.value == null || typeof row.value !== "object" || Array.isArray(row.value)) {
    return {};
  }
  return row.value as GradesStore;
}

let gradesPushQueue: Promise<GradesStore> = Promise.resolve({} as GradesStore);

/** Skip redundant cloud pulls when the remote grades blob is unchanged. */
let lastPulledCloudHash = "";

function gradesPayloadHash(g: GradesStore): string {
  return JSON.stringify(g);
}

/** Upload local grades after merging with the latest cloud copy (teacher + assistant). */
export async function pushMergedGrades(local: GradesStore): Promise<GradesStore> {
  const run = async (): Promise<GradesStore> => {
    let cloud: GradesStore = {};
    try {
      cloud = await fetchCloudGrades();
    } catch {
      cloud = {};
    }
    const merged = mergeGradesStores(cloud, local);
    await secureSetAppState({ data: { token: tokenOrThrow(), key: "grades", value: merged } });
    saveGrades(merged, { sync: false });
    lastPulledCloudHash = gradesPayloadHash(merged);
    return merged;
  };
  const next = gradesPushQueue.then(run, run);
  gradesPushQueue = next.then(
    (v) => v,
    () => local,
  );
  return next;
}

/** Pull cloud grades and merge into local without echoing a push. */
export async function pullMergedGrades(): Promise<GradesStore | null> {
  const token = getToken();
  if (!token) return null;
  const cloud = await fetchCloudGrades();
  const cloudHash = gradesPayloadHash(cloud);
  if (cloudHash === lastPulledCloudHash) return null;

  const local = loadGrades();
  const merged = mergeGradesStores(local, cloud);
  const mergedHash = gradesPayloadHash(merged);
  lastPulledCloudHash = cloudHash;

  if (mergedHash === gradesPayloadHash(local)) return null;

  const prev = sessionStorage.getItem("qs_syncing");
  sessionStorage.setItem("qs_syncing", "1");
  try {
    saveGrades(merged, { sync: false });
  } finally {
    if (prev) sessionStorage.setItem("qs_syncing", prev);
    else sessionStorage.removeItem("qs_syncing");
  }
  return merged;
}
