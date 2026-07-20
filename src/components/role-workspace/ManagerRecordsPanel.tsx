import { Link } from "@tanstack/react-router";
import { loadStudents, loadHalaqat, loadAttendanceArchive } from "@/lib/mock-data";
import { TabBadge } from "@/components/role-workspace/RoleShell";
import { Archive, BookOpen } from "lucide-react";
import { useMemo } from "react";

export function ManagerRecordsPanel() {
  const students = loadStudents();
  const halaqat = loadHalaqat();
  const archive = loadAttendanceArchive();
  const absenceArchive = useMemo(() => archive.filter((a) => a.type === "absent"), [archive]);
  const lateArchive = useMemo(() => archive.filter((a) => a.type === "late"), [archive]);

  return (
    <div className="space-y-6">
      <section className="glass-card rounded-2xl p-6">
        <h2 className="text-lg font-bold text-destructive mb-4 flex items-center gap-2">
          <Archive className="w-5 h-5" /> سجل الغياب
          <TabBadge count={absenceArchive.length} />
        </h2>
        {absenceArchive.length === 0 ? (
          <p className="text-muted-foreground text-center py-6 text-sm">لا يوجد سجل بعد</p>
        ) : (
          <div className="space-y-1 max-h-80 overflow-auto">
            {absenceArchive.slice(0, 100).map((a) => {
              const s = students.find((x) => x.id === a.studentId);
              const h = halaqat.find((x) => x.id === a.halaqaId);
              return (
                <div key={a.id} className="p-2 rounded bg-destructive/5 text-sm flex justify-between">
                  <span>{s?.name} · {h?.name}</span>
                  <span className="text-muted-foreground">{a.date}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="glass-card rounded-2xl p-6">
        <h2 className="text-lg font-bold text-warning mb-4 flex items-center gap-2">
          <Archive className="w-5 h-5" /> سجل التأخر
          <TabBadge count={lateArchive.length} />
        </h2>
        {lateArchive.length === 0 ? (
          <p className="text-muted-foreground text-center py-6 text-sm">لا يوجد سجل بعد</p>
        ) : (
          <div className="space-y-1 max-h-80 overflow-auto">
            {lateArchive.slice(0, 100).map((a) => {
              const s = students.find((x) => x.id === a.studentId);
              const h = halaqat.find((x) => x.id === a.halaqaId);
              return (
                <div key={a.id} className="p-2 rounded bg-warning/5 text-sm flex justify-between">
                  <span>{s?.name} · {h?.name}</span>
                  <span className="text-muted-foreground">{a.date}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="glass-card rounded-2xl p-6">
        <h2 className="text-lg font-bold text-primary mb-3 flex items-center gap-2">
          <BookOpen className="w-5 h-5" /> الحلقات ({halaqat.length})
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {halaqat.map((h) => (
            <Link key={h.id} to="/teacher" search={{ h: h.id }}
              className="p-3 rounded-lg bg-secondary/50 hover:bg-primary/10 border border-transparent hover:border-primary text-sm transition-colors">
              <div className="font-medium">{h.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{h.teacherName}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
