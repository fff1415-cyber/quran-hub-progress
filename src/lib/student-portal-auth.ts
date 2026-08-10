import { clearAuthSession, getAuthItem, removeAuthItem, setAuthItem } from "@/lib/auth-session";
import { getSessionRole } from "@/lib/session-role";

export type StudentPortalAuthMode = "login" | "student" | "viewer";

/** Staff roles that may view general portal stats (no student detail). */
export const PORTAL_VIEWER_ROLES = [
  "teacher",
  "assistant",
  "supervisor",
  "program_supervisor",
  "musammi",
  "secretary",
  "manager",
] as const;

export type PortalViewerRole = (typeof PORTAL_VIEWER_ROLES)[number];

export function setPortalMode(mode: "student" | "viewer"): void {
  setAuthItem("qs_portal_mode", mode);
}

export function clearPortalSession(): void {
  clearAuthSession();
}

export function getPortalStudentId(): string | null {
  return getAuthItem("qs_student");
}

export function isPortalViewerRole(role: string): role is PortalViewerRole {
  return (PORTAL_VIEWER_ROLES as readonly string[]).includes(role);
}

export function resolveStudentPortalAuth(): StudentPortalAuthMode {
  if (!getAuthItem("qs_token")) return "login";
  const role = getSessionRole();
  if (role === "student" && getPortalStudentId()) return "student";
  if (isPortalViewerRole(role)) return "viewer";
  const mode = getAuthItem("qs_portal_mode");
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
    program_supervisor: "مشرف البرامج",
  };
  return map[role] ?? "الكادر";
}

export function setStudentSession(studentId: string): void {
  setAuthItem("qs_student", studentId);
}

export function clearStudentSession(): void {
  removeAuthItem("qs_student");
}
