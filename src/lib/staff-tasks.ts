import { buildRphpUrl } from "@/lib/api-base";
import { getAuthItem, getToken } from "@/lib/auth-session";

export type StaffTaskStatus = "new" | "in_progress" | "review" | "completed";
export type StaffTaskAction = "create" | "start" | "comment" | "submit" | "approve" | "return";
export type StaffTaskHistory = { action: StaffTaskAction; by: string; at: string; note: string };
export type StaffTask = {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  assigneeId: string;
  assigneeName: string;
  createdById: string;
  createdByName: string;
  status: StaffTaskStatus;
  createdAt: string;
  updatedAt: string;
  history: StaffTaskHistory[];
};
export type StaffTasksList = {
  items: StaffTask[];
  today: string;
  actorId: string;
  roster: { id: string; name: string; role: "supervisor" | "teacher" }[];
};
export const STAFF_TASKS_CHANGED = "staff-tasks-changed";

async function request(method: "GET" | "POST", body?: unknown): Promise<StaffTasksList> {
  const token = getToken();
  if (!token) throw new Error("سجّل الدخول أولاً");
  const response = await fetch(buildRphpUrl("/staff-tasks"), {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "تعذّر تحميل المهام");
  return result;
}

export const listStaffTasks = () => request("GET");
/** One visible reminder per task state/day, scoped to the signed-in account and complex. */
export function taskReminders(data: StaffTasksList): string[] {
  if (typeof window === "undefined") return [];
  const reminders: string[] = [];
  const tomorrow = new Date(Date.parse(`${data.today}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
  for (const task of data.items) {
    const mine = task.assigneeId === data.actorId;
    const review = task.createdById === data.actorId && task.status === "review";
    const due = mine && task.status !== "completed" && task.dueDate <= tomorrow;
    const returned =
      mine && task.status === "in_progress" && task.history.at(-1)?.action === "return";
    if (!review && !due && !returned && !(mine && task.status === "new")) continue;
    const complex = getAuthItem("qs_complex") ?? "default";
    const relevantEvent = [...task.history]
      .reverse()
      .find((entry) =>
        review
          ? entry.action === "submit"
          : returned
            ? entry.action === "return"
            : entry.action === "create",
      );
    const key = `qs-task-reminder:${complex}:${data.actorId}:${task.id}:${review ? "review" : returned ? "return" : due ? "due" : "new"}:${due ? data.today : (relevantEvent?.at ?? task.createdAt)}`;
    if (sessionStorage.getItem(key)) continue;
    sessionStorage.setItem(key, "1");
    reminders.push(
      `${review ? "مهمة تنتظر مراجعتك" : returned ? "أعيدت المهمة إليك" : due ? (task.dueDate < data.today ? "مهمة متأخرة" : task.dueDate === data.today ? "مهمة موعدها اليوم" : "مهمة موعدها غداً") : "مهمة جديدة"}: ${task.title}`,
    );
  }
  return reminders;
}
export async function changeStaffTask(payload: {
  action: StaffTaskAction;
  [key: string]: string;
}): Promise<void> {
  await request("POST", payload);
  window.dispatchEvent(new Event(STAFF_TASKS_CHANGED));
}
