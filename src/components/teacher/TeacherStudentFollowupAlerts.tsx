import { useEffect, useState } from "react";
import { Bell, ChevronDown } from "lucide-react";
import { listStudentFollowups, type StudentFollowup } from "@/lib/student-followups";

/** Shared, server-backed due alerts; visible to the teacher even on a different device. */
export function TeacherStudentFollowupAlerts({ halaqaId }: { halaqaId: number }) {
  const [items, setItems] = useState<StudentFollowup[]>([]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const data = await listStudentFollowups();
        if (active) setItems(data.items.filter((item) => item.halaqaId === halaqaId));
      } catch {
        /* Keep existing alerts while offline. */
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 60_000);
    return () => { active = false; clearInterval(timer); };
  }, [halaqaId]);

  if (items.length === 0) return null;
  return (
    <section role="alert" className="glass-card rounded-2xl p-4 mb-6 border border-warning/30">
      <details key={halaqaId} className="group/followups">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded font-bold text-warning focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            <Bell aria-hidden="true" className="h-4 w-4 shrink-0" />
            متابعات الطلاب المستحقة ({items.length})
          </span>
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-open/followups:rotate-180" />
        </summary>
        <div className="mt-3 space-y-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-lg bg-warning/10 p-3 text-sm">
              <strong>{item.studentName}</strong> — {item.note}
              <div className="text-xs text-muted-foreground mt-1">الموعد: {item.dueDate} · المتابعة {item.round} من 3{item.status === "escalated" ? " · رُفع للمدير" : ""}</div>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
