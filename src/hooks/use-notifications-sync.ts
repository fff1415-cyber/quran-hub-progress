import { useCallback, useEffect } from "react";
import { NOTIFICATIONS_CHANGED_EVENT } from "@/lib/mock-data";
import { pullMergedNotifications } from "@/lib/cloud-sync";

/** Keep inbox panels in sync with cloud (teacher transfers → manager). */
export function useNotificationsSync(onUpdate: () => void, intervalMs = 15000) {
  const refresh = useCallback(async () => {
    try {
      await pullMergedNotifications();
      onUpdate();
    } catch {
      /* offline — keep local cache */
    }
  }, [onUpdate]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), intervalMs);
    const onFocus = () => void refresh();
    const onChanged = () => onUpdate();
    window.addEventListener("focus", onFocus);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    };
  }, [refresh, onUpdate, intervalMs]);
}
