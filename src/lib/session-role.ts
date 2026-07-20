export function getSessionRole(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("qs_role") || "";
}

export function getSessionName(fallback = ""): string {
  if (typeof window === "undefined") return fallback;
  return sessionStorage.getItem("qs_name") || fallback;
}
