import { getToken, clearToken } from "@/lib/cloud-sync";
import { getSessionRole } from "@/lib/session-role";

export type StudentPortalAuthMode = "login" | "student" | "viewer";

const PORTAL_MODE_KEY = "qs_portal_mode";

export function setPortalMode(mode: "student" | "viewer"): void {
  if (typeof window !== "undefined") sessionStorage.setItem(PORTAL_MODE_KEY, mode);
}

export function clearPortalSession(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(PORTAL_MODE_KEY);
  sessionStorage.removeItem("qs_role");
  sessionStorage.removeItem("qs_name");
  sessionStorage.removeItem("qs_student");
  sessionStorage.removeItem("qs_halaqa");
  sessionStorage.removeItem("qs_complex");
  clearToken();
}

export function getPortalStudentId(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("qs_student");
}

export function resolveStudentPortalAuth(): StudentPortalAuthMode {
  if (!getToken()) return "login";
  const role = getSessionRole();
  if (role === "student" && getPortalStudentId()) return "student";
  if (role === "teacher" || role === "assistant") return "viewer";
  const mode = typeof window !== "undefined" ? sessionStorage.getItem(PORTAL_MODE_KEY) : null;
  if (mode === "viewer" && (role === "teacher" || role === "assistant")) return "viewer";
  if (mode === "student" && role === "student" && getPortalStudentId()) return "student";
  return "login";
}

export function isPortalViewerRole(role: string): boolean {
  return role === "teacher" || role === "assistant";
}
