import { buildRphpUrl } from "@/lib/api-base";

const PLATFORM_TOKEN_KEY = "qs_platform_token";

export type PlatformComplex = {
  id: number;
  name: string;
  subdomain: string;
  contact_phone: string | null;
  created_at: string;
  is_active: boolean;
  accounts_count: number;
  students_count: number;
  halaqat_count: number;
};

export type PlatformRoleAccount = {
  id: string;
  complex_id: number;
  role: string;
  name: string;
  code: string;
  permissions: unknown[];
  created_at: string;
};

function apiUrl(path: string): string {
  return buildRphpUrl(path);
}

async function platformFetch<T>(
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
      throw new Error("استجابة غير صالحة من الخادم");
    }
  }
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return body as T;
}

export function getPlatformToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(PLATFORM_TOKEN_KEY);
}

export function setPlatformToken(token: string): void {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(PLATFORM_TOKEN_KEY, token);
  }
}

export function clearPlatformToken(): void {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(PLATFORM_TOKEN_KEY);
  }
}

export async function platformLogin(password: string): Promise<{ token: string; name: string }> {
  const result = await platformFetch<{ token: string; name: string }>("/platform/login", {
    method: "POST",
    body: JSON.stringify({ password: password.trim() }),
  });
  setPlatformToken(result.token);
  return result;
}

export async function platformListComplexes(token: string): Promise<PlatformComplex[]> {
  return platformFetch<PlatformComplex[]>("/platform/complexes", { method: "GET", auth: token });
}

export async function platformPatchComplex(
  token: string,
  id: number,
  is_active: boolean,
): Promise<void> {
  await platformFetch("/platform/complexes", {
    method: "PATCH",
    auth: token,
    body: JSON.stringify({ id, is_active }),
  });
}

export async function platformListRoleAccounts(
  token: string,
  complexId: number,
): Promise<PlatformRoleAccount[]> {
  return platformFetch<PlatformRoleAccount[]>(
    `/platform/role-accounts?complexId=${complexId}`,
    { method: "GET", auth: token },
  );
}

export async function platformDeleteRoleAccount(
  token: string,
  complexId: number,
  id: string,
): Promise<void> {
  await platformFetch("/platform/role-accounts", {
    method: "DELETE",
    auth: token,
    body: JSON.stringify({ id, complexId }),
  });
}

export async function platformRevokeAccess(token: string, complexId: number): Promise<number> {
  const result = await platformFetch<{ deleted_accounts: number }>("/platform/revoke-access", {
    method: "POST",
    auth: token,
    body: JSON.stringify({ complexId }),
  });
  return result.deleted_accounts;
}

export const ROLE_LABELS: Record<string, string> = {
  manager: "مدير المجمع",
  secretary: "سكرتير",
  supervisor: "مشرف",
  program_supervisor: "مشرف البرامج",
  musammi: "مسمّع",
};
