import { getToken, clearToken } from "@/lib/cloud-sync";
import { getSessionRole } from "@/lib/session-role";

export type StudentPortalAuthMode = "login" | "student" | "viewer";

const PORTAL_MODE_KEY = "qs_portal_mode";

/** Staff roles that may view general portal stats (no student detail). */
export const PORTAL_VIEWER_ROLES = [
  "teacher",
  "assistant",
  "supervisor",
  "musammi",
  "secretary",
  "manager",
] as const;

export type PortalViewerRole = (typeof PORTAL_VIEWER_ROLES)[number];

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

export function isPortalViewerRole(role: string): role is PortalViewerRole {
  return (PORTAL_VIEWER_ROLES as readonly string[]).includes(role);
}

export function resolveStudentPortalAuth(): StudentPortalAuthMode {
  if (!getToken()) return "login";
  const role = getSessionRole();
  if (role === "student" && getPortalStudentId()) return "student";
  if (isPortalViewerRole(role)) return "viewer";
  const mode = typeof window !== "undefined" ? sessionStorage.getItem(PORTAL_MODE_KEY) : null;
  if (mode === "student" && role === "student" && getPortalStudentId()) return "student";
  return "login";
}

export function portalViewerRoleLabel(role: string): string {
  const map: Record<string, string> = {
    teacher: "المعلّم",
    assistant: "المساعد",
    supervisor: "المشرف",
    musammi: "المسمّع",
    secretary: "السكرتير",
    manager: "المدير",
  };
  return map[role] ?? "الكادر";
}
