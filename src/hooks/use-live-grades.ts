import { useEffect, useState } from "react";
import {
  GRADES_CHANGED_EVENT,
  loadGrades,
  type GradesStore,
} from "@/lib/mock-data";

/** Cloud fallback poll while the tab is active (BroadcastChannel handles same-device tabs). */
const POLL_MS_VISIBLE = 3_000;
/** Slower poll when the tab is in the background — keeps cross-device sync without hammering the server. */
const POLL_MS_HIDDEN = 45_000;
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
      if (e.key === "qshatawi_grades_v2" || e.key?.startsWith("qhp_grade_outbox_v1:")) applyLocal();
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
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let lastAcademicRead = 0;

    const tick = async () => {
      if (cancelled) return;
      if (document.hidden) return;
      try {
        const { pushMergedGrades } = await import("@/lib/cloud-sync");
        const next = await pushMergedGrades(loadGrades());
        const { flushSharedGrades } = await import("@/lib/grade-sync");
        await flushSharedGrades("scientific_grades", { configs: {}, data: {}, overrides: {} }).catch(() => undefined);
        if (Date.now() - lastAcademicRead > 30000) {
          lastAcademicRead = Date.now();
          const { refreshConfirmedAcademicRecords } = await import("@/lib/academic-record");
          await refreshConfirmedAcademicRecords().catch(() => undefined);
        }
        if (!cancelled && next) {
          setGrades((prev) => (prev === next ? prev : next));
        }
      } catch {
        /* keep local */
      }
    };

    const pollDelay = () => (document.hidden ? POLL_MS_HIDDEN : POLL_MS_VISIBLE);

    const schedulePoll = () => {
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = setTimeout(() => {
        pollTimer = null;
        if (cancelled) return;
        void tick().finally(() => {
          if (!cancelled) schedulePoll();
        });
      }, pollDelay());
    };

    void tick().finally(() => {
      if (!cancelled) schedulePoll();
    });

    const onResume = () => {
      void tick();
      schedulePoll();
    };
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("focus", onResume);
    window.addEventListener("online", onResume);

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      window.removeEventListener(GRADES_CHANGED_EVENT, applyLocal);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("focus", onResume);
      window.removeEventListener("online", onResume);
      bc?.close();
    };
  }, []);

  return [grades, setGrades];
}
