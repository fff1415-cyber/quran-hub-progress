import { useCallback, useMemo, useState } from "react";
import { loadSardQueue, loadStudents, loadHalaqat, saveSardQueue } from "@/lib/mock-data";
import { weekLabel } from "@/lib/arabic-numbers";
import { AlertTriangle, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export function ManagerFailedFinalPanel() {
  const students = loadStudents();
  const halaqat = loadHalaqat();
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  const failedFinal = useMemo(
    () => loadSardQueue().filter((q) => q.status === "final_failed"),
    [tick],
  );

  const removeEntry = (id: string) => {
    saveSardQueue(loadSardQueue().filter((q) => q.id !== id));
    reload();
    toast.success("تم الحذف");
  };

  return (
    <section className="glass-card rounded-2xl p-6">
      <h2 className="text-lg font-bold text-destructive mb-4 flex items-center gap-2">
        <AlertTriangle className="w-5 h-5" /> راسبون نهائياً
      </h2>
      {failedFinal.length === 0 ? (
        <p className="text-muted-foreground text-center py-8 text-sm">لا يوجد حالات رسوب نهائي</p>
      ) : (
        <div className="space-y-2">
          {failedFinal.map((q) => {
            const s = students.find((x) => x.id === q.studentId);
            const h = halaqat.find((x) => x.id === q.halaqaId);
            if (!s || !h) return null;
            return (
              <div key={q.id} className="flex items-center justify-between p-4 rounded-lg bg-destructive/10 border border-destructive/30 flex-wrap gap-3">
                <div>
                  <div className="font-bold">{s.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {h.name} · {weekLabel(q.week)} · {q.finalPercent}%
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a href={`https://wa.me/${s.parentPhone}`} target="_blank" rel="noreferrer"
                    className="px-4 py-2 rounded-lg bg-success/20 text-success border border-success/30 text-sm font-bold">
                    واتساب ولي الأمر
                  </a>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        type="button"
                        className="p-2 rounded-lg bg-destructive/15 text-destructive border border-destructive/30"
                        aria-label="حذف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>حذف سجل الرسوب؟</AlertDialogTitle>
                        <AlertDialogDescription>
                          سيُزال من قائمة الراسبين نهائياً على هذا الجهاز.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>إلغاء</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => removeEntry(q.id)}
                        >
                          حذف
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
