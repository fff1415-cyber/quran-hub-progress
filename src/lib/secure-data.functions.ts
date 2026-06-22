// Client-side API layer — Hostinger PHP + MySQL backend

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

function apiUrl(path: string): string {
  if (!API_BASE) {
    throw new Error("VITE_API_URL is not configured");
  }
  return `${API_BASE}/api${path}`;
}

async function apiFetch<T>(
  path: string,
  options: RequestInit & { auth?: string } = {},
): Promise<T> {
  const { auth, headers, ...rest } = options;
  const res = await fetch(apiUrl(path), {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...headers,
    },
  });
  const text = await res.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      throw new Error("استجابة غير صالحة من الخادم — تحقق من مجلد api/ وملف .htaccess");
    }
  }
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return body as T;
}

// ---------- LOGIN ----------
export async function loginByCode({ data }: { data: { code: string } }) {
  return apiFetch<{
    token: string;
    role: string;
    name: string;
    halaqaId: number | null;
  }>("/login/code", {
    method: "POST",
    body: JSON.stringify({ code: data.code.trim() }),
  });
}

export async function loginByNationalId({ data }: { data: { nationalId: string } }) {
  return apiFetch<{
    token: string;
    studentId: string;
    name: string;
    halaqaId: number;
  }>("/login/national-id", {
    method: "POST",
    body: JSON.stringify({ nationalId: data.nationalId.trim() }),
  });
}

// ---------- STUDENTS ----------
export async function secureListStudents({ data }: { data: { token: string } }) {
  return apiFetch<unknown[]>("/students", { method: "GET", auth: data.token });
}

export async function listPublicStudents() {
  return apiFetch<unknown[]>("/students/public", { method: "GET" });
}

export async function secureUpsertStudents({ data }: { data: { token: string; students: unknown[] } }) {
  if (data.students.length === 0) return { ok: true };
  return apiFetch<{ ok: boolean }>("/students", {
    method: "POST",
    auth: data.token,
    body: JSON.stringify({ students: data.students }),
  });
}

export async function securePatchStudent({ data }: { data: { token: string; id: string; patch: unknown } }) {
  return apiFetch<{ ok: boolean }>("/students", {
    method: "PATCH",
    auth: data.token,
    body: JSON.stringify({ id: data.id, patch: data.patch }),
  });
}

export async function secureDeleteStudent({ data }: { data: { token: string; id: string } }) {
  return apiFetch<{ ok: boolean }>("/students", {
    method: "DELETE",
    auth: data.token,
    body: JSON.stringify({ id: data.id }),
  });
}

// ---------- HALAQAT ----------
export async function secureListHalaqatFull({ data }: { data: { token: string } }) {
  return apiFetch<unknown[]>("/halaqat", { method: "GET", auth: data.token });
}

export async function listPublicHalaqat() {
  return apiFetch<unknown[]>("/halaqat/public", { method: "GET" });
}

export async function secureUpsertHalaqat({ data }: { data: { token: string; halaqat: unknown[] } }) {
  if (data.halaqat.length === 0) return { ok: true };
  return apiFetch<{ ok: boolean }>("/halaqat", {
    method: "POST",
    auth: data.token,
    body: JSON.stringify({ halaqat: data.halaqat }),
  });
}

export async function secureDeleteHalaqa({ data }: { data: { token: string; id: number } }) {
  return apiFetch<{ ok: boolean }>("/halaqat", {
    method: "DELETE",
    auth: data.token,
    body: JSON.stringify({ id: data.id }),
  });
}

// ---------- ROLE ACCOUNTS ----------
export async function secureListRoleAccounts({ data }: { data: { token: string } }) {
  return apiFetch<unknown[]>("/role-accounts", { method: "GET", auth: data.token });
}

export async function secureUpsertRoleAccount({ data }: { data: { token: string; account: unknown } }) {
  return apiFetch<{ ok: boolean }>("/role-accounts", {
    method: "POST",
    auth: data.token,
    body: JSON.stringify({ account: data.account }),
  });
}

export async function secureDeleteRoleAccount({ data }: { data: { token: string; id: string } }) {
  return apiFetch<{ ok: boolean }>("/role-accounts", {
    method: "DELETE",
    auth: data.token,
    body: JSON.stringify({ id: data.id }),
  });
}

// ---------- SHARED APP STATE ----------
export async function secureListAppState({ data }: { data: { token: string } }) {
  return apiFetch<{ key: string; value: unknown }[]>("/app-state", {
    method: "GET",
    auth: data.token,
  });
}

export async function secureSetAppState({ data }: { data: { token: string; key: string; value: unknown } }) {
  return apiFetch<{ ok: boolean }>("/app-state", {
    method: "POST",
    auth: data.token,
    body: JSON.stringify({ key: data.key, value: data.value }),
  });
}
