import { buildRphpUrl } from "@/lib/api-base";
import { getToken } from "@/lib/auth-session";

export type StudentEntryReport = {
  date: string;
  today: string;
  total: number;
  people: number;
  rows: { studentId: string; studentName: string; halaqaName: string; visits: number }[];
  semesterTotal: number | null;
  semester: { name: string; startDate: string } | null;
};

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const token = getToken();
  if (!token) throw new Error("سجّل الدخول أولاً");
  const response = await fetch(buildRphpUrl(path), {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    ...(method === "POST" ? { keepalive: true } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "تعذّر تسجيل الدخول أو تحميل التقرير");
  return result as T;
}

/** The server derives the student from the authenticated token, never a browser-supplied ID. */
export function recordStudentEntry(visitKey: string): Promise<void> {
  return request("POST", "/student-entries", { visitKey });
}

export function fetchStudentEntryReport(date?: string): Promise<StudentEntryReport> {
  return request("GET", `/student-entries${date ? `?date=${encodeURIComponent(date)}` : ""}`);
}
