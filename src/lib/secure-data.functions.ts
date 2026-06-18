// تم تحويل هذا الملف ليعمل بالكامل من جهة المتصفح (Client-Side) ليتوافق مع استضافة Hostinger

import { supabase } from "@/integrations/supabase/client";

// دالة بسيطة لتوليد رمز جلسة (وهمي) ليتم حفظه في المتصفح
function generateSimpleToken(payload: any) {
  return btoa(JSON.stringify(payload));
}

// ---------- LOGIN ----------
export async function loginByCode({ data }: { data: { code: string } }) {
  const code = data.code.trim();

  // 1. البحث في حسابات الإدارة والمشرفين
  const { data: ra, error: raError } = await supabase
    .from("role_accounts")
    .select("role, name, code")
    .eq("code", code)
    .maybeSingle();

  if (ra) {
    return {
      token: generateSimpleToken({ role: ra.role, name: ra.name, exp: Date.now() + 86400000 }),
      role: ra.role,
      name: ra.name,
      halaqaId: null,
    };
  }

  // 2. البحث في حسابات المعلمين والمساعدين
  const { data: hT, error: hTError } = await supabase
    .from("halaqat")
    .select("id, teacher_name, teacher_code, assistant_name, assistant_code")
    .or(`teacher_code.eq.${code},assistant_code.eq.${code}`)
    .maybeSingle();

  if (hT) {
    if (hT.teacher_code === code) {
      return {
        token: generateSimpleToken({ role: "teacher", name: hT.teacher_name, halaqaId: hT.id }),
        role: "teacher",
        name: hT.teacher_name,
        halaqaId: hT.id,
      };
    }
    if (hT.assistant_code === code) {
      return {
        token: generateSimpleToken({ role: "assistant", name: hT.assistant_name, halaqaId: hT.id }),
        role: "assistant",
        name: hT.assistant_name,
        halaqaId: hT.id,
      };
    }
  }

  throw new Error("رمز العضوية غير صحيح");
}

export async function loginByNationalId({ data }: { data: { nationalId: string } }) {
  const nid = data.nationalId.trim();
  const { data: r, error } = await supabase
    .from("students")
    .select("id, name, halaqa_id")
    .eq("national_id", nid)
    .maybeSingle();

  if (!r) throw new Error("رقم الهوية غير مسجل");

  return {
    token: generateSimpleToken({ role: "student", name: r.name, studentId: r.id }),
    studentId: r.id,
    name: r.name,
    halaqaId: r.halaqa_id,
  };
}

// ---------- STUDENTS ----------
export async function secureListStudents() {
  const { data, error } = await supabase.from("students").select("*").order("name");
  if (error) throw new Error(error.message);
  return data || [];
}

export async function secureUpsertStudents({ data }: { data: { students: any[] } }) {
  if (data.students.length === 0) return { ok: true };
  const { error } = await supabase.from("students").upsert(data.students, { onConflict: "id" });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function securePatchStudent({ data }: { data: { id: string; patch: any } }) {
  const { error } = await supabase.from("students").update(data.patch).eq("id", data.id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function secureDeleteStudent({ data }: { data: { id: string } }) {
  const { error } = await supabase.from("students").delete().eq("id", data.id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

// ---------- HALAQAT ----------
export async function secureListHalaqatFull() {
  const { data, error } = await supabase.from("halaqat").select("*").order("id");
  if (error) throw new Error(error.message);
  return data || [];
}

export async function secureUpsertHalaqat({ data }: { data: { halaqat: any[] } }) {
  if (data.halaqat.length === 0) return { ok: true };
  const { error } = await supabase.from("halaqat").upsert(data.halaqat, { onConflict: "id" });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function secureDeleteHalaqa({ data }: { data: { id: number } }) {
  const { error } = await supabase.from("halaqat").delete().eq("id", data.id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

// ---------- ROLE ACCOUNTS ----------
export async function secureListRoleAccounts() {
  const { data, error } = await supabase.from("role_accounts").select("*").order("created_at");
  if (error) throw new Error(error.message);
  return data || [];
}

export async function secureUpsertRoleAccount({ data }: { data: { account: any } }) {
  const { error } = await supabase.from("role_accounts").upsert(data.account, { onConflict: "code" });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function secureDeleteRoleAccount({ data }: { data: { id: string } }) {
  const { error } = await supabase.from("role_accounts").delete().eq("id", data.id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

// ---------- SHARED APP STATE ----------
export async function secureListAppState() {
  const { data, error } = await supabase.from("app_state").select("key, value");
  if (error) throw new Error(error.message);
  return data || [];
}

export async function secureSetAppState({ data }: { data: { key: string; value: any } }) {
  const { error } = await supabase.from("app_state").upsert({ key: data.key, value: data.value }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  return { ok: true };
}
