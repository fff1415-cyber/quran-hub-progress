import { buildRphpUrl } from "@/lib/api-base";
import { getToken } from "@/lib/auth-session";

export interface ParentRecommendation {
  id: string;
  teacherName: string;
  recommendation: string;
  createdAt: string;
}

async function request<T>(method: "GET" | "POST", body?: unknown, studentId?: string): Promise<T> {
  const token = getToken();
  if (!token) throw new Error("سجّل الدخول أولاً");
  const path = `/parent-recommendations${studentId ? `?studentId=${encodeURIComponent(studentId)}` : ""}`;
  const response = await fetch(buildRphpUrl(path), {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "تعذّر حفظ التوصية");
  return result as T;
}

export async function sendParentRecommendation(studentId: string, recommendation: string): Promise<ParentRecommendation> {
  return (await request<{ item: ParentRecommendation }>("POST", { studentId, recommendation })).item;
}

export async function listParentRecommendations(studentId: string): Promise<ParentRecommendation[]> {
  return (await request<{ items: ParentRecommendation[] }>("GET", undefined, studentId)).items;
}
