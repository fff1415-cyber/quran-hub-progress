import { buildRphpUrl } from "@/lib/api-base";
import { getToken } from "@/lib/auth-session";
import { loadLatePermissions, saveLatePermissions, type LatePermission } from "@/lib/mock-data";

export type SharedLatePermission = LatePermission & {
  studentName?: string;
  acknowledgedAt?: string;
  removedAt?: string;
};

export const LATE_PERMISSIONS_CHANGED = "qshatawi:late-permissions-changed";

async function request(method: "GET" | "POST", body?: unknown): Promise<{ items: SharedLatePermission[] } | { item: SharedLatePermission; alreadyGranted: boolean }> {
  const token = getToken();
  if (!token) throw new Error("سجّل الدخول أولاً");
  const response = await fetch(buildRphpUrl("/late-permissions"), {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "تعذّر تحديث إذن الدخول");
  return result;
}

function updateCache(items: SharedLatePermission[]) {
  // The dedicated endpoint has already persisted the records. Do not send an older whole-list copy back.
  if (typeof window !== "undefined") {
    saveLatePermissions(items);
    window.dispatchEvent(new Event(LATE_PERMISSIONS_CHANGED));
  }
}

export async function listSharedLatePermissions(): Promise<SharedLatePermission[]> {
  const result = await request("GET") as { items: SharedLatePermission[] };
  return result.items;
}

export async function grantSharedLatePermission(studentId: string): Promise<{ item: SharedLatePermission; alreadyGranted: boolean }> {
  const result = await request("POST", { action: "grant", studentId }) as { item: SharedLatePermission; alreadyGranted: boolean };
  updateCache([result.item, ...loadLatePermissions().filter((row) => row.id !== result.item.id)]);
  return result;
}

export async function changeSharedLatePermission(id: string, action: "acknowledge" | "remove"): Promise<void> {
  const result = await request("POST", { action, id }) as { item: SharedLatePermission };
  updateCache(loadLatePermissions().map((row) => row.id === id ? result.item : row));
}
