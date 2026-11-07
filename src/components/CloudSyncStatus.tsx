import { useEffect, useState } from "react";
import { CLOUD_SYNC_STATUS_EVENT, getCloudSyncStatus, syncFromCloud } from "@/lib/cloud-sync";

/** A failed pull keeps the confirmed cache visible and offers a real retry. */
export function CloudSyncStatus() {
  const [status, setStatus] = useState(getCloudSyncStatus);
  useEffect(() => {
    const update = () => setStatus(getCloudSyncStatus());
    window.addEventListener(CLOUD_SYNC_STATUS_EVENT, update);
    return () => window.removeEventListener(CLOUD_SYNC_STATUS_EVENT, update);
  }, []);
  if (status !== "failed") return null;
  return (
    <div role="status" className="flex items-center justify-center gap-3 border-b border-warning/40 bg-warning/10 px-4 py-2 text-sm" dir="rtl">
      <span>تعذّر تحديث البيانات؛ تُعرض آخر نسخة محفوظة.</span>
      <button type="button" className="font-semibold underline" onClick={() => void syncFromCloud({ force: true })}>
        إعادة المحاولة
      </button>
    </div>
  );
}
