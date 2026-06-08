// Cloud sync layer — sensitive operations are proxied through server functions
// in `secure-data.functions.ts`. Non-sensitive columns are read directly via
// the anon Supabase client (RLS + column grants restrict what is visible).
import { supabase } from "@/integrations/supabase/client";
import type { GradesStore, Halaqa, LatePermission, MessageTemplateKey, Notification, SardHistoryItem, SardQueueItem, Student } from "./mock-data";
import { saveGrades, saveHalaqat, saveLatePermissions, saveMessageTemplates, saveNotifications, saveSardHistory, saveSardQueue, saveStudents } from "./mock-data";
import {
  secureListStudents,
  secureListHalaqatFull,
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
  level: string;
  level_type: string;
  assigned_to: string | null;
  memorized: string | null;
}

interface CloudHalaqaRow {
  id: number;
  name: string;
  is_talqeen: boolean;
  teacher_name: string;
  teacher_code?: string;
  assistant_name: string;
  assistant_code?: string;
}

function rowToStudent(r: CloudStudentRow): Student {
  return {
    id: r.id,
    name: r.name,
    halaqaId: r.halaqa_id,
    nationalId: r.national_id ?? "",
    parentPhone: r.parent_phone ?? "",
    level: r.level,
    levelType: (r.level_type === "silver" ? "silver" : "gold"),
    assignedTo: (r.assigned_to as "teacher" | "assistant" | undefined) ?? undefined,
    memorized: r.memorized ?? undefined,
  };
}
function rowToHalaqa(r: CloudHalaqaRow): Halaqa {
  return {
    id: r.id,
    name: r.name,
    isTalqeen: r.is_talqeen,
    teacherName: r.teacher_name,
    teacherCode: r.teacher_code ?? "",
    assistantName: r.assistant_name,
    assistantCode: r.assistant_code ?? "",
  };
}
function studentToRow(s: Student): CloudStudentRow {
  return {
    id: s.id,
    name: s.name,
    halaqa_id: s.halaqaId,
    national_id: s.nationalId,
    parent_phone: s.parentPhone,
    level: s.level,
    level_type: s.levelType,
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

/**
 * Pull latest students/halaqat. If a staff token is present, fetch full rows
 * (including national_id / parent_phone / teacher codes). Otherwise fetch only
 * the public columns allowed by column-level GRANTs.
 */
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
      const [hRes, sRes] = await Promise.all([
        supabase
          .from("halaqat")
          .select("id, name, is_talqeen, teacher_name, assistant_name")
          .order("id"),
        supabase
          .from("students")
          .select("id, name, halaqa_id, level, level_type, assigned_to, memorized")
          .order("name"),
      ]);
      if (hRes.error) throw hRes.error;
      if (sRes.error) throw sRes.error;
      halaqat = (hRes.data ?? []).map(rowToHalaqa);
      students = (sRes.data ?? []).map(rowToStudent);
    }

    if (token) {
      const stateRows = await secureListAppState({ data: { token } }) as { key: string; value: unknown }[];
      const state = new Map(stateRows.map((row) => [row.key, row.value]));
      sessionStorage.setItem("qs_syncing", "1");
      if (state.has("grades")) saveGrades(state.get("grades") as GradesStore);
      if (state.has("sard_queue")) saveSardQueue(state.get("sard_queue") as SardQueueItem[]);
      if (state.has("sard_history")) saveSardHistory(state.get("sard_history") as SardHistoryItem[]);
      if (state.has("notifications")) saveNotifications(state.get("notifications") as Notification[]);
      if (state.has("message_templates")) saveMessageTemplates(state.get("message_templates") as Record<MessageTemplateKey, string>);
      if (state.has("late_permissions")) saveLatePermissions(state.get("late_permissions") as LatePermission[]);
      sessionStorage.removeItem("qs_syncing");
    }

    saveHalaqat(halaqat);
    saveStudents(students);
    return { students, halaqat };
  } catch (e) {
    console.warn("Cloud sync failed, using local cache:", e);
    return null;
  }
}

// ---- Mutations (all server-side via signed token) ----
function tokenOrThrow(): string {
  const t = getToken();
  if (!t) throw new Error("الجلسة منتهية — أعد تسجيل الدخول");
  return t;
}

export async function pushStudents(students: Student[]) {
  saveStudents(students);
  if (students.length === 0) return;
  await secureUpsertStudents({ data: { token: tokenOrThrow(), students: students.map(studentToRow) } });
}

export async function patchStudent(id: string, patch: Partial<Student>) {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.halaqaId !== undefined) row.halaqa_id = patch.halaqaId;
  if (patch.nationalId !== undefined) row.national_id = patch.nationalId;
  if (patch.parentPhone !== undefined) row.parent_phone = patch.parentPhone;
  if (patch.level !== undefined) row.level = patch.level;
  if (patch.levelType !== undefined) row.level_type = patch.levelType;
  if ("assignedTo" in patch) row.assigned_to = patch.assignedTo ?? null;
  if ("memorized" in patch) row.memorized = patch.memorized ?? null;
  await securePatchStudent({ data: { token: tokenOrThrow(), id, patch: row as never } });
}

export async function deleteStudent(id: string) {
  await secureDeleteStudent({ data: { token: tokenOrThrow(), id } });
}

export async function pushHalaqat(halaqat: Halaqa[]) {
  saveHalaqat(halaqat);
  if (halaqat.length === 0) return;
  await secureUpsertHalaqat({ data: { token: tokenOrThrow(), halaqat: halaqat.map(halaqaToRow) } });
}

export async function deleteHalaqa(id: number) {
  await secureDeleteHalaqa({ data: { token: tokenOrThrow(), id } });
}

// ---- Role accounts (manager-only) ----
export interface CloudRoleAccount {
  id: string;
  role: string;
  name: string;
  code: string;
  permissions: string[];
}

export async function loadRoleAccountsCloud(): Promise<CloudRoleAccount[]> {
  try {
    const rows = await secureListRoleAccounts({ data: { token: tokenOrThrow() } });
    return (rows ?? []) as CloudRoleAccount[];
  } catch (e) {
    console.error(e);
    return [];
  }
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

export async function pushAppState(key: "grades" | "sard_queue" | "sard_history" | "notifications" | "message_templates" | "late_permissions", value: unknown) {
  await secureSetAppState({ data: { token: tokenOrThrow(), key, value } });
}
