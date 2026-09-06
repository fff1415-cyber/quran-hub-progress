import { useEffect, useState } from "react";
import {
  GRADES_CHANGED_EVENT,
  loadGrades,
  type GradesStore,
} from "@/lib/mock-data";

/** Cloud fallback poll while the tab is active (BroadcastChannel handles same-device tabs). */
const POLL_MS_VISIBLE = 5000;
/** Slower poll when the tab is in the background — keeps cross-device sync without hammering the server. */
const POLL_MS_HIDDEN = 30000;
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
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      try {
        const { pullMergedGrades } = await import("@/lib/cloud-sync");
        const next = await pullMergedGrades();
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

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      window.removeEventListener(GRADES_CHANGED_EVENT, applyLocal);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("focus", onResume);
      bc?.close();
    };
  }, []);

  return [grades, setGrades];
}
