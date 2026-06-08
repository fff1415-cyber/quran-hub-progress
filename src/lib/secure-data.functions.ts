// All credential-sensitive reads & writes go through these server functions.
// Tokens are HMAC-signed using SUPABASE_SERVICE_ROLE_KEY (server-only secret)
// and stored client-side in sessionStorage as `qs_token`.

import { createServerFn } from "@tanstack/react-start";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TOKEN_TTL_SEC = 60 * 60 * 12; // 12h

interface TokenPayload {
  role: string;
  name: string;
  halaqaId?: number | null;
  studentId?: string;
  exp: number;
}

function secret(): string {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("Missing server secret");
  return s;
}
function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64urlDecode(str: string) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}
function sign(payload: TokenPayload): string {
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(createHmac("sha256", secret()).update(body).digest());
  return `${body}.${sig}`;
}
function verify(token: string | undefined | null): TokenPayload | null {
  if (!token || typeof token !== "string") return null;
  const idx = token.indexOf(".");
  if (idx < 1) return null;
  const body = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = b64url(createHmac("sha256", secret()).update(body).digest());
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(b64urlDecode(body).toString()) as TokenPayload;
    if (!p.exp || p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch {
    return null;
  }
}
function requireStaff(p: TokenPayload | null): TokenPayload {
  if (!p) throw new Error("غير مصرح بالوصول");
  if (p.role === "student") throw new Error("صلاحية غير كافية");
  return p;
}
function requireManager(p: TokenPayload | null): TokenPayload {
  if (!p || p.role !== "manager") throw new Error("صلاحية المدير مطلوبة");
  return p;
}
function requireManagerOrSecretary(p: TokenPayload | null): TokenPayload {
  if (!p || (p.role !== "manager" && p.role !== "secretary"))
    throw new Error("صلاحية غير كافية");
  return p;
}

const AppStateKey = z.enum([
  "grades",
  "sard_queue",
  "sard_history",
  "notifications",
  "message_templates",
  "late_permissions",
]);

// ---------- LOGIN ----------
export const loginByCode = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ code: z.string().min(1).max(32) }).parse(d))
  .handler(async ({ data }) => {
    const code = data.code.trim();
    const ra = await supabaseAdmin
      .from("role_accounts")
      .select("role, name, code")
      .eq("code", code)
      .maybeSingle();
    const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC;
    if (ra.data) {
      return {
        token: sign({ role: ra.data.role, name: ra.data.name, halaqaId: null, exp }),
        role: ra.data.role,
        name: ra.data.name,
        halaqaId: null as number | null,
      };
    }
    const hT = await supabaseAdmin
      .from("halaqat")
      .select("id, teacher_name, teacher_code, assistant_name, assistant_code")
      .or(`teacher_code.eq.${code},assistant_code.eq.${code}`)
      .maybeSingle();
    if (hT.data) {
      if (hT.data.teacher_code === code) {
        return {
          token: sign({ role: "teacher", name: hT.data.teacher_name, halaqaId: hT.data.id, exp }),
          role: "teacher",
          name: hT.data.teacher_name,
          halaqaId: hT.data.id,
        };
      }
      if (hT.data.assistant_code === code) {
        return {
          token: sign({ role: "assistant", name: hT.data.assistant_name, halaqaId: hT.data.id, exp }),
          role: "assistant",
          name: hT.data.assistant_name,
          halaqaId: hT.data.id,
        };
      }
    }
    throw new Error("رمز العضوية غير صحيح");
  });

export const loginByNationalId = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ nationalId: z.string().min(1).max(20) }).parse(d))
  .handler(async ({ data }) => {
    const nid = data.nationalId.trim();
    const r = await supabaseAdmin
      .from("students")
      .select("id, name, halaqa_id")
      .eq("national_id", nid)
      .maybeSingle();
    if (!r.data) throw new Error("رقم الهوية غير مسجل");
    const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC;
    return {
      token: sign({
        role: "student",
        name: r.data.name,
        studentId: r.data.id,
        halaqaId: r.data.halaqa_id,
        exp,
      }),
      studentId: r.data.id,
      name: r.data.name,
      halaqaId: r.data.halaqa_id,
    };
  });

// ---------- STUDENTS ----------
const StudentRow = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  halaqa_id: z.number().int(),
  national_id: z.string().min(1).max(20),
  parent_phone: z.string().max(20).optional().default(""),
  level: z.string().max(8),
  level_type: z.enum(["gold", "silver"]),
  assigned_to: z.string().nullable().optional(),
  memorized: z.string().nullable().optional(),
});

export const secureListStudents = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string() }).parse(d))
  .handler(async ({ data }) => {
    requireStaff(verify(data.token));
    const { data: rows, error } = await supabaseAdmin
      .from("students")
      .select("*")
      .order("name");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const secureUpsertStudents = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ token: z.string(), students: z.array(StudentRow).max(2000) }).parse(d),
  )
  .handler(async ({ data }) => {
    requireManagerOrSecretary(verify(data.token));
    if (data.students.length === 0) return { ok: true };
    const { error } = await supabaseAdmin
      .from("students")
      .upsert(data.students, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const securePatchStudent = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        token: z.string(),
        id: z.string().min(1).max(64),
        patch: z.object({
          name: z.string().min(1).max(120).optional(),
          halaqa_id: z.number().int().optional(),
          national_id: z.string().min(1).max(20).optional(),
          parent_phone: z.string().max(20).optional(),
          level: z.string().max(8).optional(),
          level_type: z.enum(["gold", "silver"]).optional(),
          assigned_to: z.string().nullable().optional(),
          memorized: z.string().nullable().optional(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    requireManagerOrSecretary(verify(data.token));
    const { error } = await supabaseAdmin
      .from("students")
      .update(data.patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const secureDeleteStudent = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string(), id: z.string().min(1).max(64) }).parse(d))
  .handler(async ({ data }) => {
    requireManagerOrSecretary(verify(data.token));
    const { error } = await supabaseAdmin.from("students").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- HALAQAT ----------
const HalaqaRow = z.object({
  id: z.number().int(),
  name: z.string().min(1).max(120),
  is_talqeen: z.boolean(),
  teacher_name: z.string().max(120),
  teacher_code: z.string().max(32),
  assistant_name: z.string().max(120),
  assistant_code: z.string().max(32),
});

export const secureListHalaqatFull = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string() }).parse(d))
  .handler(async ({ data }) => {
    requireStaff(verify(data.token));
    const { data: rows, error } = await supabaseAdmin
      .from("halaqat")
      .select("*")
      .order("id");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const secureUpsertHalaqat = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ token: z.string(), halaqat: z.array(HalaqaRow).max(200) }).parse(d),
  )
  .handler(async ({ data }) => {
    requireManager(verify(data.token));
    if (data.halaqat.length === 0) return { ok: true };
    const { error } = await supabaseAdmin
      .from("halaqat")
      .upsert(data.halaqat, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const secureDeleteHalaqa = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string(), id: z.number().int() }).parse(d))
  .handler(async ({ data }) => {
    requireManager(verify(data.token));
    const { error } = await supabaseAdmin.from("halaqat").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- ROLE ACCOUNTS ----------
export const secureListRoleAccounts = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string() }).parse(d))
  .handler(async ({ data }) => {
    requireManager(verify(data.token));
    const { data: rows, error } = await supabaseAdmin
      .from("role_accounts")
      .select("*")
      .order("created_at");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const secureUpsertRoleAccount = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        token: z.string(),
        account: z.object({
          id: z.string().uuid().optional(),
          role: z.string().min(1).max(32),
          name: z.string().min(1).max(120),
          code: z.string().min(1).max(32),
          permissions: z.array(z.string().max(64)).max(50),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    requireManager(verify(data.token));
    const { error } = await supabaseAdmin
      .from("role_accounts")
      .upsert(data.account, { onConflict: "code" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const secureDeleteRoleAccount = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    requireManager(verify(data.token));
    const { error } = await supabaseAdmin.from("role_accounts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
