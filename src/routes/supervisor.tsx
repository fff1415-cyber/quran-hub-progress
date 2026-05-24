import { createFileRoute, Link } from "@tanstack/react-router";
import { loadSardQueue, loadStudents, loadHalaqat, updateSardItem, pushNotification } from "@/lib/mock-data";
import { weekLabel } from "@/lib/arabic-numbers";
import { AppHeader } from "@/components/AppHeader";
import { Eye, Check, BookOpen } from "lucide-react";
import { Toaster, toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/supervisor")({ component: SupervisorPage });

function SupervisorPage() {
  const [queue, setQueue] = useState(() => loadSardQueue());
  const students = loadStudents();
  const halaqat = loadHalaqat();
  const refresh = () => setQueue(loadSardQueue());

  const awaiting = queue.filter((q) => q.status === "awaiting_supervisor");

  const approve = (id: string, name: string) => {
    updateSardItem(id, { status: "approved_third", attempt: 3, hifzErrors: 0, reviewErrors: [0, 0, 0, 0, 0] });
    pushNotification({ message: `وافق المشرف التعليمي على محاولة ثالثة للطالب ${name}`, type: "sard" });
    toast.success("تمت الموافقة — سيظهر الطالب لدى المسمّع");
    refresh();
  };

  return (
    <div className="min-h-screen">
      <Toaster position="top-center" richColors />
      <AppHeader title="الإشراف التعليمي" subtitle="أ. محمد البرادي" />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="glass-card rounded-2xl p-6 mb-6 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl gold-gradient flex items-center justify-center">
            <Eye className="w-7 h-7 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h1 className="display text-2xl gold-text">الإشراف التعليمي</h1>
            <p className="text-sm text-muted-foreground">صلاحية كاملة على جميع الحلقات + الموافقة على إعادة السرد</p>
          </div>
        </div>

        {/* Quick access to halaqat */}
        <section className="glass-card rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-primary mb-3 flex items-center gap-2">
            <BookOpen className="w-5 h-5" /> الحلقات
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {halaqat.map((h) => (
              <Link key={h.id} to="/teacher" search={{ h: h.id }}
                className="p-3 rounded-lg bg-secondary/50 hover:bg-primary/10 border border-transparent hover:border-primary text-sm">
                {h.name}
              </Link>
            ))}
          </div>
        </section>

        {/* Pending approvals */}
        <section className="glass-card rounded-2xl p-6">
          <h2 className="text-lg font-bold text-primary mb-4">طلبات إعادة السرد ({awaiting.length})</h2>
          {awaiting.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">لا توجد طلبات معلّقة</p>
          ) : (
            <div className="space-y-2">
              {awaiting.map((q) => {
                const s = students.find((x) => x.id === q.studentId);
                const h = halaqat.find((x) => x.id === q.halaqaId);
                if (!s || !h) return null;
                return (
                  <div key={q.id} className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 border border-border">
                    <div>
                      <div className="font-bold">{s.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {h.name} · {weekLabel(q.week)} · رسب في {q.attempt} محاولات
                      </div>
                      {q.finalPercent !== undefined && (
                        <div className="text-xs text-warning mt-1">آخر نتيجة: {q.finalPercent}%</div>
                      )}
                    </div>
                    <button onClick={() => approve(q.id, s.name)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg gold-gradient text-primary-foreground font-bold text-sm">
                      <Check className="w-4 h-4" />
                      السماح بمحاولة ثالثة
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
