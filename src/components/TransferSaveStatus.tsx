import { useEffect, useState } from "react";
import { currentTransferOutbox, flushSharedTransfers, refreshSharedTransfers, transferSaveError, TRANSFER_SAVE_EVENT } from "@/lib/shared-transfers";

export function TransferSaveStatus() {
  const [, redraw] = useState(0), [error, setError] = useState("");
  useEffect(() => { const update = () => redraw(n => n + 1); window.addEventListener(TRANSFER_SAVE_EVENT, update); window.addEventListener("storage", update); return () => { window.removeEventListener(TRANSFER_SAVE_EVENT, update); window.removeEventListener("storage", update); }; }, []);
  useEffect(() => {
    const tick = () => { if (!document.hidden && currentTransferOutbox()) void flushSharedTransfers().catch(() => undefined); };
    const timer = setInterval(tick, 15000);
    window.addEventListener("online", tick); window.addEventListener("focus", tick); document.addEventListener("visibilitychange", tick); tick();
    return () => { clearInterval(timer); window.removeEventListener("online", tick); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); };
  }, []);
  const box = currentTransferOutbox(), drafts = box?.drafts().filter(d => d.status === "pending" || d.status === "conflict") ?? [], local = transferSaveError();
  if (!drafts.length && !local) return null;
  const run = async (fn: () => Promise<unknown>) => { setError(""); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "لم يتأكد حفظ التحويل"); } };
  return <section className="border-b bg-secondary/40 p-3 text-sm" dir="rtl" aria-live="polite"><p>التحويلات: {drafts.length} إجراء على هذا الجهاز لم يؤكده الخادم. لا تمسح بيانات المتصفح قبل التأكيد.</p>
    {local && <p role="alert">{local}</p>}{error && <p role="alert">{error}</p>}
    <button className="underline ml-3" onClick={() => void run(flushSharedTransfers)}>إعادة محاولة الإرسال</button><button className="underline" onClick={() => void run(refreshSharedTransfers)}>تحديث الإجراءات المحفوظة</button>
    {drafts.map(d => <details key={d.packet.operation_id}><summary>{d.status === "conflict" ? "إجراء يحتاج مراجعة؛ لم تُستبدل كتابة مستخدم آخر" : "إجراء معلق"}</summary><p>{d.packet.reason ?? d.packet.text ?? "توجيه إداري"}</p><p>{d.message}</p>{d.status === "conflict" && <><p>راجع الإجراء الحالي ثم أعده من القائمة إذا بقي مطلوبًا. لن تُنقل المسودة إلى وجهة أخرى تلقائيًا.</p><button className="underline" onClick={() => { box?.discard(d.packet.operation_id); }}>استبعاد المسودة وسلسلة الطلبات التابعة لها</button></>}</details>)}
  </section>;
}
