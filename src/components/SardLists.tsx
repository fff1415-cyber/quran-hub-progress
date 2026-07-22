import { useEffect, useMemo, useState } from "react";
import {
  loadSardQueue, loadStudents, loadHalaqat, isLateSard, notifyLateSard,
  type SardQueueItem,
} from "@/lib/mock-data";
import { weekLabel } from "@/lib/arabic-numbers";
import { isMusammiVisible } from "@/lib/sard-phased-flow";
import { AlertTriangle, Mic } from "lucide-react";

/** Late-sard list (>2 days pending). Auto-notifies manager once per item. */
export function LateSardList() {
  const [queue, setQueue] = useState<SardQueueItem[]>([]);
  const students = loadStudents();
  const halaqat = loadHalaqat();

  useEffect(() => {
    const q = loadSardQueue();
    setQueue(q);
    notifyLateSard(students);
  }, []);

  const late = useMemo(() => queue.filter(isLateSard), [queue]);

  return (
    <section className="glass-card rounded-2xl p-6">
      <h2 className="text-lg font-bold text-warning mb-3 flex items-center gap-2">
        <AlertTriangle className="w-5 h-5" />
        المتأخرون عن السرد ({late.length})
        <span className="text-xs text-muted-foreground font-normal">— أكثر من يومين بانتظار التسميع</span>
      </h2>
      {late.length === 0 ? (
        <p className="text-muted-foreground text-center py-6 text-sm">لا يوجد متأخرون</p>
      ) : (
        <div className="space-y-2">
          {late.map((q) => {
            const s = students.find((x) => x.id === q.studentId);
            const h = halaqat.find((x) => x.id === q.halaqaId);
            if (!s || !h) return null;
            const days = Math.floor((Date.now() - new Date(q.createdAt).getTime()) / (1000 * 60 * 60 * 24));
            return (
              <div key={q.id} className="flex items-center justify-between p-3 rounded-lg bg-warning/5 border border-warning/30">
                <div>
                  <div className="font-bold">{s.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {h.name} · {weekLabel(q.week)}
                  </div>
                </div>
                <span className="px-3 py-1.5 rounded-lg bg-warning/20 text-warning border border-warning/30 text-xs font-bold">
                  متأخر {days} يوم
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Active sard queue (pending + approved_third + scheduled-ready). Read-only. */
export function ActiveSardList() {
  const [queue] = useState(() => loadSardQueue());
  const students = loadStudents();
  const halaqat = loadHalaqat();

  const visible = useMemo(() => queue.filter((q) => isMusammiVisible(q)), [queue]);

  return (
    <section className="glass-card rounded-2xl p-6">
      <h2 className="text-lg font-bold text-primary mb-3 flex items-center gap-2">
        <Mic className="w-5 h-5" />
        قائمة السرد الحالية ({visible.length})
      </h2>
      {visible.length === 0 ? (
        <p className="text-muted-foreground text-center py-6 text-sm">لا يوجد طلاب في قائمة السرد</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {visible.map((q) => {
            const s = students.find((x) => x.id === q.studentId);
            const h = halaqat.find((x) => x.id === q.halaqaId);
            if (!s || !h) return null;
            return (
              <div key={q.id} className="p-3 rounded-lg bg-secondary/50 border border-border">
                <div className="font-bold text-sm">{s.name}</div>
                <div className="text-xs text-muted-foreground mt-1">{h.name} · {weekLabel(q.week)}</div>
                {q.attempt > 1 && (
                  <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-warning/20 text-warning">
                    محاولة {q.attempt}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
