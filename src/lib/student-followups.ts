import { buildRphpUrl } from "@/lib/api-base";
import { getToken } from "@/lib/auth-session";

export type StudentFollowup = {
  id: string;
  studentId: string;
  studentName: string;
  halaqaId: number;
  note: string;
  dueDate: string;
  round: number;
  status: "active" | "escalated" | "completed" | "closed";
  createdAt: string;
  createdBy: string;
  escalatedAt?: string;
};

export type FollowupList = { items: StudentFollowup[]; today: string };
export const STUDENT_FOLLOWUPS_CHANGED = "student-followups-changed";

async function request(method: "GET" | "POST", body?: unknown): Promise<FollowupList | { ok: true }> {
  const token = getToken();
  if (!token) throw new Error("سجّل الدخول أولاً");
  const response = await fetch(buildRphpUrl("/student-followups"), {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "تعذّر تحديث متابعة الطالب");
  return result;
}

export async function listStudentFollowups(): Promise<FollowupList> {
  return request("GET") as Promise<FollowupList>;
}

export async function changeStudentFollowup(
  action: { action: "create"; studentId: string; halaqaId: number; note: string; dueDate: string }
    | { action: "extend"; id: string; dueDate: string }
    | { action: "complete" | "close"; id: string },
): Promise<void> {
  await request("POST", action);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(STUDENT_FOLLOWUPS_CHANGED));
}

export function followupDaysLeft(dueDate: string, today: string): number {
  const [y, m, d] = dueDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000);
}
