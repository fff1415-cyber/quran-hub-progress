import { getToken } from "@/lib/auth-session";
import { getActiveComplexId } from "@/lib/tenant";
import { secureListAppState } from "@/lib/secure-data.functions";
import { hasPendingSardWrites, loadSardQueue, saveSardQueue, type SardQueueItem } from "@/lib/mock-data";

export const SARD_REFRESH_STATUS_EVENT = "qs-sard-refresh-status";
type RefreshStatus = { loading: boolean; error?: string };
let status: RefreshStatus = { loading: false };
let statusContext: { token: string | null; complex: ReturnType<typeof getActiveComplexId> } | null = null;
let inFlight: { token: string; complex: ReturnType<typeof getActiveComplexId>; promise: Promise<void> } | null = null;
const context = () => ({ token: getToken(), complex: getActiveComplexId() });
const matches = (before: ReturnType<typeof context>) => { const now = context(); return before.token === now.token && before.complex === now.complex; };
function publish(before: ReturnType<typeof context>, next: RefreshStatus) {
  if (!matches(before)) return;
  statusContext = before; status = next;
  window.dispatchEvent(new Event(SARD_REFRESH_STATUS_EVENT));
}
export function getSardRefreshStatus(): RefreshStatus {
  return statusContext && matches(statusContext) ? status : { loading: false };
}

/** Read the existing shared queue only; never publishes an inbox or a grade. */
export function refreshSardQueueFromShared(): Promise<void> {
  const before = context();
  if (!before.token || typeof window === "undefined" || hasPendingSardWrites()) return Promise.resolve();
  if (inFlight?.token === before.token && inFlight.complex === before.complex) return inFlight.promise;
  const baseline = JSON.stringify(loadSardQueue());
  const run = async () => {
    publish(before, { loading: true });
    try {
      const rows = await secureListAppState({ data: { token: before.token!, key: "sard_queue" } });
      if (!matches(before)) return;
      const row = rows.find(value => value.key === "sard_queue");
      if (row) {
        if (!Array.isArray(row.value) || row.value.some(item => !item || typeof item !== "object" || typeof item.id !== "string")) throw new Error("تعذّر تأكيد قائمة السرد من الخادم");
        // A read started before a local write must not undo that write, even if it has since committed.
        if (!hasPendingSardWrites() && JSON.stringify(loadSardQueue()) === baseline) {
          const syncing = sessionStorage.getItem("qs_syncing");
          sessionStorage.setItem("qs_syncing", "1");
          try { saveSardQueue(row.value as SardQueueItem[]); }
          finally { if (syncing !== null) sessionStorage.setItem("qs_syncing", syncing); else sessionStorage.removeItem("qs_syncing"); }
        }
      }
      publish(before, { loading: false });
    } catch (error) {
      publish(before, { loading: false, error: error instanceof Error ? error.message : "تعذّر تحديث قائمة السرد" });
      throw error;
    }
  };
  const promise = run().finally(() => { if (inFlight?.promise === promise) inFlight = null; });
  inFlight = { token: before.token, complex: before.complex, promise };
  return promise;
}
