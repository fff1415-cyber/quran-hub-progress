import { useEffect, useState } from "react";
import {
  GRADES_CHANGED_EVENT,
  loadGrades,
  type GradesStore,
} from "@/lib/mock-data";

const POLL_MS = 800;
const GRADES_BROADCAST = "qs-grades-v2";

/**
 * Grades that stay in sync while teacher and assistant both have the sheet open.
 * Local edits merge with the cloud copy; newer touchedAt wins per cell (including clears).
 */
export function useLiveGrades(): [GradesStore, (g: GradesStore) => void] {
  const [grades, setGrades] = useState<GradesStore>(() => loadGrades());

  useEffect(() => {
    const applyLocal = () => setGrades(loadGrades());

    window.addEventListener(GRADES_CHANGED_EVENT, applyLocal);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "qshatawi_grades_v2") applyLocal();
    };
    window.addEventListener("storage", onStorage);

    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      try {
        bc = new BroadcastChannel(GRADES_BROADCAST);
        bc.onmessage = () => applyLocal();
      } catch {
        bc = null;
      }
    }

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      if (document.hidden) return;
      try {
        const { pullMergedGrades } = await import("@/lib/cloud-sync");
        const next = await pullMergedGrades();
        if (!cancelled && next) {
          setGrades((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
        }
      } catch {
        /* keep local */
      }
    };

    void tick();
    const interval = window.setInterval(() => void tick(), POLL_MS);
    const onResume = () => { void tick(); };
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("focus", onResume);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener(GRADES_CHANGED_EVENT, applyLocal);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("focus", onResume);
      bc?.close();
    };
  }, []);

  return [grades, setGrades];
}
