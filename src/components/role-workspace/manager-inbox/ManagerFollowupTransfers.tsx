import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { loadHalaqat } from "@/lib/mock-data";
import { changeStudentFollowup, listStudentFollowups, type StudentFollowup } from "@/lib/student-followups";
import { Button } from "@/components/ui/button";

export function ManagerFollowupTransfers({ onCountChange }: { onCountChange: (count: number) => void }) {
  const [items, setItems] = useState<StudentFollowup[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const halaqat = loadHalaqat();
  const refresh = useCallback(async () => {
    try {
      const data = await listStudentFollowups();
      const escalated = data.items.filter((item) => item.status === "escalated");
      setItems(escalated);
      onCountChange(escalated.length);
    } catch {
      /* Existing manager transfers remain available when offline. */
    }
  }, [onCountChange]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  const acknowledge = async (id: string) => {
    setBusy(id);
    try {
      await changeStudentFollowup({ action: "close", id });
      await refresh();
      toast.success("تم تسجيل الاطلاع على التحويل");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحديث التحويل");
    } finally {
      setBusy(null);
    }
  };

  if (items.length === 0) return null;
  return (
    <div className="space-y-3 mb-6">
      <h3 className="font-bold">تحويلات متابعة الطلاب ({items.length})</h3>
      {items.map((item) => (
        <div key={item.id} className="rounded-xl border border-warning/30 bg-warning/5 p-4 space-y-2">
          <div className="font-bold">{item.studentName} · {halaqat.find((h) => h.id === item.halaqaId)?.name ?? "الحلقة"}</div>
          <div className="text-xs text-muted-foreground">من المشرف التعليمي · انتهت المتابعة الثالثة في {item.dueDate}</div>
          <div className="rounded-lg border p-2 text-sm">الملاحظة: {item.note}</div>
          <Button size="sm" variant="outline" disabled={busy === item.id} onClick={() => void acknowledge(item.id)}>
            <CheckCircle2 className="w-4 h-4 ml-1" /> تم الاطلاع
          </Button>
        </div>
      ))}
    </div>
  );
}
