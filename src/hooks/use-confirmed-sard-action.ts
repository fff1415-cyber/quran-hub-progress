import { useRef, useState } from "react";
import { flushSardQueue } from "@/lib/mock-data";

/** Keep notifications and success messages behind the existing server write confirmation. */
export function useConfirmedSardAction(onSettled: () => void) {
  const busy = useRef(false);
  const settled = useRef(onSettled); settled.current = onSettled;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const run = async (change: () => void | boolean, confirmed: () => void) => {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError(undefined);
    try {
      if (change() === false) return;
      await flushSardQueue();
      confirmed();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "لم يؤكد الخادم الحفظ؛ أعد تحميل القائمة ثم حاول مجددًا"); }
    finally { busy.current = false; setSaving(false); settled.current(); }
  };
  return { run, saving, error };
}
