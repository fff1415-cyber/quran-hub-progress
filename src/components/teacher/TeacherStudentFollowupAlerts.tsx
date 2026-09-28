import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
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
      <h2 className="font-bold text-warning flex items-center gap-2 mb-3"><Bell className="w-4 h-4" /> متابعات الطلاب المستحقة ({items.length})</h2>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="rounded-lg bg-warning/10 p-3 text-sm">
            <strong>{item.studentName}</strong> — {item.note}
            <div className="text-xs text-muted-foreground mt-1">الموعد: {item.dueDate} · المتابعة {item.round} من 3{item.status === "escalated" ? " · رُفع للمدير" : ""}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
