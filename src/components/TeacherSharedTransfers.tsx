import { useState } from "react";
import { loadNotifications } from "@/lib/mock-data";
import { changeSharedTransfer } from "@/lib/shared-transfers";
import { useInboxRefresh } from "@/hooks/use-inbox-refresh";
import { toast } from "sonner";

export function TeacherSharedTransfers({ halaqaId }: { halaqaId: number }) {
  const [, redraw] = useState(0), [notes, setNotes] = useState<Record<string, string>>({}), [busy, setBusy] = useState<string | null>(null);
  useInboxRefresh(() => redraw(n => n + 1));
  const rows = loadNotifications().filter(n => n.type === "transfer" && n.sharedTransferId && !n.targetRole && n.transferData?.halaqaId === halaqaId);
  if (!rows.length) return null;
  const send = async (id: string) => { const text = notes[id]?.trim(); if (!text || busy) return; setBusy(id); try { await changeSharedTransfer(id, { type: "action", text }); setNotes(n => ({ ...n, [id]: "" })); toast.success("أكد الخادم حفظ المتابعة"); } catch (e) { toast.error(e instanceof Error ? e.message : "لم يتأكد الحفظ؛ بقيت المسودة"); } finally { setBusy(null); } };
  return <details className="glass-card rounded-xl p-3 mb-4"><summary>متابعة التحويلات المشتركة ({rows.length})</summary>{rows.map(row => <article key={row.id} className="border-t mt-2 pt-2 text-sm"><p>{row.message}</p>{row.transferData?.actions?.map((a, i) => <p key={i}>{a.byName}: {a.text}</p>)}<textarea className="w-full border rounded p-2" aria-label="إضافة متابعة للتحويل" value={notes[row.id] ?? ""} onChange={e => setNotes(n => ({ ...n, [row.id]: e.target.value }))} /><button disabled={!!busy} className="underline" onClick={() => void send(row.id)}>إرسال المتابعة</button></article>)}</details>;
}
