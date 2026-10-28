import { useEffect, useState } from "react";
import { getSardRefreshStatus, refreshSardQueueFromShared, SARD_REFRESH_STATUS_EVENT } from "@/lib/sard-queue-refresh";

export function SardQueueRefreshStatus() {
  const [, render] = useState(0);
  useEffect(() => {
    const update = () => render(value => value + 1);
    window.addEventListener(SARD_REFRESH_STATUS_EVENT, update);
    return () => window.removeEventListener(SARD_REFRESH_STATUS_EVENT, update);
  }, []);
  const state = getSardRefreshStatus();
  if (state.loading) return <p role="status" className="text-sm text-muted-foreground">جارٍ تحديث قائمة السرد…</p>;
  if (!state.error) return null;
  return <div role="status" className="rounded-lg border border-warning/30 p-3 text-sm">
    <p>تعذّر تحديث قائمة السرد؛ نعرض آخر نسخة محفوظة. {state.error}</p>
    <button type="button" onClick={() => void refreshSardQueueFromShared().catch(() => undefined)} disabled={state.loading} className="mt-2 underline">{state.loading ? "جارٍ إعادة المحاولة…" : "إعادة المحاولة"}</button>
  </div>;
}
