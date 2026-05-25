import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  loadHalaqat, loadStudents, loadGrades, loadSardQueue, updateSardItem, pushNotification,
  type WeekRecord,
} from "@/lib/mock-data";
import { weekLabel } from "@/lib/arabic-numbers";
import { getOperationalDayKey } from "@/lib/operational-date";
import { AppHeader } from "@/components/AppHeader";
import { MessageCircle, UserX, Zap, Clipboard, Clock } from "lucide-react";
import { Toaster, toast } from "sonner";

export const Route = createFileRoute("/secretary")({ component: SecretaryPage });

function SecretaryPage() {
  const halaqat = loadHalaqat();
  const students = loadStudents();
  const grades = loadGrades();
  const [queue, setQueue] = useState(() => loadSardQueue());
  const refresh = () => setQueue(loadSardQueue());

  const todayKey = getOperationalDayKey();
  const today = useMemo(() => {
    const currentWeek = 1;
    return students.map((s) => {
      const w: WeekRecord | undefined = grades[s.id]?.[currentWeek];
      return { s, status: (w?.days[todayKey]?.attendance || "") };
    }).filter((x) => x.status && x.status !== "present");
  }, [students, grades, todayKey]);

  const scheduled = queue.filter((q) => q.status === "scheduled");

  const forceImmediate = (id: string, name: string) => {
    updateSardItem(id, { status: "pending", scheduledAt: new Date().toISOString() });
    pushNotification({ message: `سمح السكرتير بإعادة سرد فوري للطالب ${name}`, type: "sard" });
    toast.success("تم — يمكن للمسمّع البدء فوراً");
    refresh();
  };

  return (
    <div className="min-h-screen">
      <Toaster position="top-center" richColors />
      <AppHeader title="لوحة السكرتير" subtitle="أ. أحمد العمر" />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="glass-card rounded-2xl p-6 mb-6 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl gold-gradient flex items-center justify-center">
            <Clipboard className="w-7 h-7 text-primary-foreground" />
          </div>
          <div>
            <h1 className="display text-2xl gold-text">لوحة السكرتير</h1>
            <p className="text-sm text-muted-foreground">متابعة الغياب اليومي وإشعارات أولياء الأمور — يتجدد كل يوم الساعة 2 ظهراً</p>
          </div>
        </div>

        <section className="glass-card rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-primary mb-4 flex items-center gap-2">
            <UserX className="w-5 h-5" /> غياب اليوم ({today.length})
          </h2>
          {today.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">لا توجد حالات غياب أو تأخر اليوم</p>
          ) : (
            <div className="space-y-2">
              {today.map(({ s, status }) => {
                const h = halaqat.find((x) => x.id === s.halaqaId);
                const labelMap: Record<string, string> = { absent: "غائب", late: "متأخر", excused: "مستأذن" };
                const colorMap: Record<string, string> = {
                  absent: "bg-destructive/15 text-destructive border-destructive/30",
                  late: "bg-warning/15 text-warning border-warning/30",
                  excused: "bg-primary/15 text-primary border-primary/30",
                };
                const msg = encodeURIComponent(`السلام عليكم، نُعلمكم بأن الطالب ${s.name} ${labelMap[status]} اليوم عن حلقة ${h?.name || ""}.`);
                return (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 rounded text-xs font-bold border ${colorMap[status]}`}>{labelMap[status]}</span>
                      <div>
                        <div className="font-medium">{s.name}</div>
                        <div className="text-xs text-muted-foreground">{h?.name}</div>
                      </div>
                    </div>
                    <a href={`https://wa.me/${s.parentPhone}?text=${msg}`} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success/20 text-success border border-success/30 text-sm font-bold">
                      <MessageCircle className="w-4 h-4" />
                      واتساب
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="glass-card rounded-2xl p-6">
          <h2 className="text-lg font-bold text-primary mb-2 flex items-center gap-2">
            <Clock className="w-5 h-5" /> طلاب في انتظار إعادة السرد ({scheduled.length})
          </h2>
          <p className="text-xs text-muted-foreground mb-4">يحق لك السماح بإعادة السرد فوراً دون انتظار يومين.</p>
          {scheduled.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">لا يوجد</p>
          ) : (
            <div className="space-y-2">
              {scheduled.map((q) => {
                const s = students.find((x) => x.id === q.studentId);
                const h = halaqat.find((x) => x.id === q.halaqaId);
                if (!s || !h) return null;
                return (
                  <div key={q.id} className="flex items-center justify-between p-3 rounded-lg bg-warning/5 border border-warning/20">
                    <div>
                      <div className="font-bold">{s.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">{h.name} · {weekLabel(q.week)}</div>
                    </div>
                    <button onClick={() => forceImmediate(q.id, s.name)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning/20 text-warning border border-warning/30 font-bold text-sm">
                      <Zap className="w-4 h-4" /> الإعادة الآن
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
