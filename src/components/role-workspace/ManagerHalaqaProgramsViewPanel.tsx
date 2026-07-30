import { useEffect, useMemo, useState } from "react";
import { loadHalaqat } from "@/lib/mock-data";
import { fetchActiveCalendar } from "@/lib/academic-context";
import { TeacherHalaqaProgramsPanel } from "@/components/TeacherHalaqaProgramsPanel";
import { BookOpen, Loader2 } from "lucide-react";

/** Manager read-only view of all halaqa programs. */
export function ManagerHalaqaProgramsViewPanel() {
  const halaqat = loadHalaqat();
  const [halaqaId, setHalaqaId] = useState(halaqat[0]?.id ?? 1);
  const [calendar, setCalendar] = useState<Awaited<ReturnType<typeof fetchActiveCalendar>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekNum, setWeekNum] = useState(1);

  const halaqa = useMemo(() => halaqat.find((h) => h.id === halaqaId), [halaqat, halaqaId]);

  useEffect(() => {
    let cancelled = false;
    void fetchActiveCalendar(true).then((cal) => {
      if (cancelled) return;
      setCalendar(cal);
      setWeekNum(cal.currentWeekNumber);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !calendar || !halaqa) {
    return (
      <section className="glass-card rounded-2xl p-10 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="glass-card rounded-2xl p-4">
        <h2 className="text-lg font-bold text-primary flex items-center gap-2 mb-3">
          <BookOpen className="w-5 h-5" />
          برامج الحلقات (عرض فقط)
        </h2>
        <select
          value={halaqaId}
          onChange={(e) => setHalaqaId(Number(e.target.value))}
          className="w-full max-w-md px-3 py-2 rounded-lg bg-input border border-border text-sm"
        >
          {halaqat.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
      </div>
      <TeacherHalaqaProgramsPanel
        halaqaId={halaqa.id}
        halaqaName={halaqa.name}
        calendar={calendar}
        weekNum={weekNum}
        onWeekChange={setWeekNum}
        viewerRole="manager"
        canManagePrograms={false}
        readOnly
      />
    </section>
  );
}
