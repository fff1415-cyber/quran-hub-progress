// Cloud sync layer: persists students/halaqat/role_accounts to Supabase
// so data shows on any device. Uses localStorage as instant cache.
import { supabase } from "@/integrations/supabase/client";
import type { Student, Halaqa } from "./mock-data";
import { ROLE_ACCOUNTS, saveStudents, saveHalaqat } from "./mock-data";

interface CloudStudentRow {
  id: string;
  name: string;
  halaqa_id: number;
  national_id: string;
  parent_phone: string;
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
  teacher_code: string;
  assistant_name: string;
  assistant_code: string;
}

function studentToRow(s: Student): CloudStudentRow {
  return {
    id: s.id, name: s.name, halaqa_id: s.halaqaId,
    national_id: s.nationalId, parent_phone: s.parentPhone,
    level: s.level, level_type: s.levelType,
    assigned_to: s.assignedTo ?? null,
    memorized: s.memorized ?? null,
  };
}
function rowToStudent(r: CloudStudentRow): Student {
  return {
    id: r.id, name: r.name, halaqaId: r.halaqa_id,
    nationalId: r.national_id, parentPhone: r.parent_phone,
    level: r.level, levelType: (r.level_type === "silver" ? "silver" : "gold") as "gold" | "silver",
    assignedTo: (r.assigned_to as "teacher" | "assistant" | undefined) ?? undefined,
    memorized: r.memorized ?? undefined,
  };
}
function halaqaToRow(h: Halaqa): CloudHalaqaRow {
  return {
    id: h.id, name: h.name, is_talqeen: h.isTalqeen,
    teacher_name: h.teacherName, teacher_code: h.teacherCode,
    assistant_name: h.assistantName, assistant_code: h.assistantCode,
  };
}
function rowToHalaqa(r: CloudHalaqaRow): Halaqa {
  return {
    id: r.id, name: r.name, isTalqeen: r.is_talqeen,
    teacherName: r.teacher_name, teacherCode: r.teacher_code,
    assistantName: r.assistant_name, assistantCode: r.assistant_code,
  };
}

let seeded = false;

/** Pull latest students/halaqat from Cloud → cache to localStorage. Seeds defaults if empty. */
export async function syncFromCloud(): Promise<{ students: Student[]; halaqat: Halaqa[] } | null> {
  try {
    const [hRes, sRes] = await Promise.all([
      supabase.from("halaqat").select("*").order("id"),
      supabase.from("students").select("*").order("name"),
    ]);
    if (hRes.error) throw hRes.error;
    if (sRes.error) throw sRes.error;

    let halaqat = (hRes.data || []).map(rowToHalaqa);
    let students = (sRes.data || []).map(rowToStudent);

    // First-run seeding of default halaqat
    if (halaqat.length === 0 && !seeded) {
      seeded = true;
      await supabase.from("halaqat").upsert(HALAQAT.map(halaqaToRow));
      const reload = await supabase.from("halaqat").select("*").order("id");
      halaqat = (reload.data || []).map(rowToHalaqa);
    }

    // Seed role_accounts once
    const ra = await supabase.from("role_accounts").select("code").limit(1);
    if (!ra.error && (ra.data || []).length === 0) {
      await supabase.from("role_accounts").upsert(
        ROLE_ACCOUNTS.map((a) => ({ role: a.role, name: a.name, code: a.code, permissions: [] })),
        { onConflict: "code" }
      );
    }

    saveHalaqat(halaqat);
    saveStudents(students);
    return { students, halaqat };
  } catch (e) {
    console.warn("Cloud sync failed, using local cache:", e);
    return null;
  }
}

/** Upsert students to Cloud + local cache. */
export async function pushStudents(students: Student[]) {
  saveStudents(students);
  const rows = students.map(studentToRow);
  if (rows.length === 0) return;
  const { error } = await supabase.from("students").upsert(rows, { onConflict: "id" });
  if (error) console.error("pushStudents:", error);
}

/** Update a single student (partial). */
export async function patchStudent(id: string, patch: Partial<Student>) {
  const row: {
    name?: string; halaqa_id?: number; national_id?: string;
    parent_phone?: string; level?: string; level_type?: string;
    assigned_to?: string | null; memorized?: string | null;
  } = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.halaqaId !== undefined) row.halaqa_id = patch.halaqaId;
  if (patch.nationalId !== undefined) row.national_id = patch.nationalId;
  if (patch.parentPhone !== undefined) row.parent_phone = patch.parentPhone;
  if (patch.level !== undefined) row.level = patch.level;
  if (patch.levelType !== undefined) row.level_type = patch.levelType;
  if ("assignedTo" in patch) row.assigned_to = patch.assignedTo ?? null;
  if ("memorized" in patch) row.memorized = patch.memorized ?? null;
  const { error } = await supabase.from("students").update(row).eq("id", id);
  if (error) console.error("patchStudent:", error);
}

/** Delete a student from Cloud + cache. */
export async function deleteStudent(id: string) {
  const { error } = await supabase.from("students").delete().eq("id", id);
  if (error) console.error("deleteStudent:", error);
}

/** Upsert halaqat to Cloud. */
export async function pushHalaqat(halaqat: Halaqa[]) {
  saveHalaqat(halaqat);
  const { error } = await supabase.from("halaqat").upsert(halaqat.map(halaqaToRow), { onConflict: "id" });
  if (error) console.error("pushHalaqat:", error);
}

export async function deleteHalaqa(id: number) {
  const { error } = await supabase.from("halaqat").delete().eq("id", id);
  if (error) console.error("deleteHalaqa:", error);
}

// ---- Role accounts (used by manager permissions UI) ----
export interface CloudRoleAccount {
  id: string;
  role: string;
  name: string;
  code: string;
  permissions: string[];
}

export async function loadRoleAccountsCloud(): Promise<CloudRoleAccount[]> {
  const { data, error } = await supabase.from("role_accounts").select("*").order("created_at");
  if (error) { console.error(error); return []; }
  return (data || []) as CloudRoleAccount[];
}

export async function upsertRoleAccount(acc: { id?: string; role: string; name: string; code: string; permissions: string[] }) {
  const { error } = await supabase.from("role_accounts").upsert(acc, { onConflict: "code" });
  if (error) console.error("upsertRoleAccount:", error);
}

export async function deleteRoleAccount(id: string) {
  const { error } = await supabase.from("role_accounts").delete().eq("id", id);
  if (error) console.error("deleteRoleAccount:", error);
}
