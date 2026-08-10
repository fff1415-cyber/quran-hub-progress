import { getAuthItem } from "@/lib/auth-session";

export function getSessionRole(): string {
  return getAuthItem("qs_role") || "";
}

export function getSessionName(fallback = ""): string {
  return getAuthItem("qs_name") || fallback;
}
