/** Persistent auth session — survives browser restarts on the same device. */

const AUTH_KEYS = [
  "qs_token",
  "qs_role",
  "qs_name",
  "qs_halaqa",
  "qs_student",
  "qs_complex",
  "qs_portal_mode",
  "qs_tenant_subdomain",
  "qs_tenant_name",
] as const;

let migrated = false;

function migrateFromSessionStorage(): void {
  if (typeof window === "undefined" || migrated) return;
  migrated = true;
  for (const key of AUTH_KEYS) {
    const fromSession = sessionStorage.getItem(key);
    if (fromSession && !localStorage.getItem(key)) {
      localStorage.setItem(key, fromSession);
    }
    if (fromSession) sessionStorage.removeItem(key);
  }
}

export function getAuthItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  migrateFromSessionStorage();
  return localStorage.getItem(key);
}

export function setAuthItem(key: string, value: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, value);
  sessionStorage.removeItem(key);
}

export function removeAuthItem(key: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(key);
  sessionStorage.removeItem(key);
}

export function getToken(): string | null {
  return getAuthItem("qs_token");
}

export function setToken(token: string): void {
  setAuthItem("qs_token", token);
}

export function clearToken(): void {
  removeAuthItem("qs_token");
}

export function hasAuthToken(): boolean {
  return !!getToken();
}

export function clearAuthSession(): void {
  if (typeof window === "undefined") return;
  for (const key of AUTH_KEYS) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
}

/** Client-side token expiry check (server still validates on API calls). */
export function decodeAuthTokenPayload(token: string | null = getToken()): {
  role?: string;
  name?: string;
  halaqaId?: number;
  complexId?: number;
  studentId?: string;
} | null {
  if (!token || !token.includes(".")) return null;
  try {
    const body = token.split(".")[0]!;
    const pad = body.length % 4;
    const padded = pad > 0 ? body + "=".repeat(4 - pad) : body;
    const json = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as Record<string, unknown>;
    const num = (v: unknown): number | undefined => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    };
    return {
      role: typeof payload.role === "string" ? payload.role : undefined,
      name: typeof payload.name === "string" ? payload.name : undefined,
      halaqaId: num(payload.halaqaId),
      complexId: num(payload.complexId ?? payload.complex_id),
      studentId: typeof payload.studentId === "string" ? payload.studentId : undefined,
    };
  } catch {
    return null;
  }
}

/** Backfill session keys from JWT when localStorage is missing them. */
export function ensureSessionFromToken(): void {
  const payload = decodeAuthTokenPayload();
  if (!payload) return;
  if (payload.role && !getAuthItem("qs_role")) setAuthItem("qs_role", payload.role);
  if (payload.name && !getAuthItem("qs_name")) setAuthItem("qs_name", payload.name);
  if (payload.halaqaId && !getAuthItem("qs_halaqa")) setAuthItem("qs_halaqa", String(payload.halaqaId));
  if (payload.complexId && !getAuthItem("qs_complex")) setAuthItem("qs_complex", String(payload.complexId));
  if (payload.studentId && !getAuthItem("qs_student")) setAuthItem("qs_student", payload.studentId);
}

export function isTokenExpired(token: string | null = getToken()): boolean {
  if (!token || !token.includes(".")) return true;
  try {
    const body = token.split(".")[0]!;
    const pad = body.length % 4;
    const padded = pad > 0 ? body + "=".repeat(4 - pad) : body;
    const json = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { exp?: number };
    if (!payload.exp) return false;
    return Date.now() > payload.exp;
  } catch {
    return true;
  }
}
