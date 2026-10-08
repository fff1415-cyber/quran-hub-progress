import { useEffect, useState } from "react";
import { toast } from "sonner";
import { listStaffTasks, STAFF_TASKS_CHANGED, taskReminders } from "@/lib/staff-tasks";

/** Count assignments and reviews for the signed-in worker, including saved sessions. */
export function useStaffTaskCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const data = await listStaffTasks();
        if (!active) return;
        setCount(
          data.items.filter(
            (task) =>
              (task.assigneeId === data.actorId && task.status !== "completed") ||
              (task.createdById === data.actorId && task.status === "review"),
          ).length,
        );
        taskReminders(data).forEach((message) => toast.info(message));
      } catch {
        /* Retain the last badge while offline. */
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 60_000);
    window.addEventListener(STAFF_TASKS_CHANGED, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener(STAFF_TASKS_CHANGED, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return count;
}
