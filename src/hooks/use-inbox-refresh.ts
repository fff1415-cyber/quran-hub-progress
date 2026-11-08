import { useEffect } from "react";
import { NOTIFICATIONS_CHANGED_EVENT } from "@/lib/mock-data";

/** Re-render inbox panels when local notifications change (no cloud pull). */
export function useInboxRefresh(onUpdate: () => void) {
  useEffect(() => {
    const handler = () => onUpdate();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, handler);
  }, [onUpdate]);
}
