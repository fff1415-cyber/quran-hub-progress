import { useEffect, useRef } from "react";
import { NOTIFICATIONS_CHANGED_EVENT, SARD_QUEUE_CHANGED_EVENT } from "@/lib/mock-data";
import { refreshSardQueueFromShared } from "@/lib/sard-queue-refresh";

/** Existing local inboxes plus read-only refresh of the existing shared sard queue. */
export function useInboxRefresh(onUpdate: () => void) {
  const update = useRef(onUpdate);
  update.current = onUpdate;
  useEffect(() => {
    const handler = () => update.current();
    const tick = () => {
      handler(); // Recompute scheduled eligibility even when the shared value has not changed.
      if (!document.hidden) void refreshSardQueueFromShared().catch(() => undefined);
    };
    const storage = (event: StorageEvent) => { if (event.key === "qshatawi_sard_queue_v2") handler(); };
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, handler);
    window.addEventListener(SARD_QUEUE_CHANGED_EVENT, handler);
    window.addEventListener("focus", tick); window.addEventListener("storage", storage);
    const timer = setInterval(tick, 15000);
    tick();
    return () => { clearInterval(timer); window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, handler); window.removeEventListener(SARD_QUEUE_CHANGED_EVENT, handler); window.removeEventListener("focus", tick); window.removeEventListener("storage", storage); };
  }, []);
}
