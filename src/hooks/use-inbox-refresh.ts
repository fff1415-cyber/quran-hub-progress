import { useEffect } from "react";
import { NOTIFICATIONS_CHANGED_EVENT } from "@/lib/mock-data";
import { CLOCK_TICK_EVENT, SHARED_REFRESH_EVENT } from "@/lib/shared-refresh";

/** Re-render inbox panels when local notifications change (no cloud pull). */
export function useInboxRefresh(onUpdate: () => void) {
  useEffect(() => {
    const handler = () => onUpdate();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, handler);
    window.addEventListener(SHARED_REFRESH_EVENT, handler);
    window.addEventListener(CLOCK_TICK_EVENT, handler);
    return () => {window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, handler);window.removeEventListener(SHARED_REFRESH_EVENT, handler);window.removeEventListener(CLOCK_TICK_EVENT, handler);};
  }, [onUpdate]);
}
