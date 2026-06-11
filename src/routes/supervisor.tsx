import { createFileRoute, Link } from "@tanstack/react-router";
import { loadSardQueue, loadStudents, loadHalaqat, updateSardItem, pushNotification } from "@/lib/mock-data";
import { weekLabel } from "@/lib/arabic-numbers";
import { AppHeader } from "@/components/AppHeader";
import { LateSardList, ActiveSardList } from "@/components/SardLists";
import { Eye, Check, BookOpen, Zap, Clock, CheckCircle2 } from "lucide-react";
import { Toaster, toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/supervisor")({ component: SupervisorPage });

function SupervisorPage() {
  const [queue, setQueue] = useState(() => loadSardQueue());
  const students = loadStudents();
  const halaqat = loadHalaqat();
  const refresh = () => setQueue(loadSardQueue());

  const awaiting = queue.filter((q) => q.status === "awaiting_supervisor");
  const scheduled = queue.filter((q) => q.status === "scheduled");

  const approveThird = (id: string, name: string) => {
    updateSardItem(id, { status: "approved_third", attempt: 3, hifzErrors: 0, reviewErrors: [0, 0, 0, 0, 0] });
    pushNotification({ message: `وافق المشرف التعليمي على محاولة ثالثة للطالب ${name}`, type: "sard" });
    toast.success("تمت الموافقة — سيظهر الطالب لدى المسمّع");
    refresh();
  };

  const forceImmediate = (id: string, name: string) => {
    updateSardItem(id, { status: "pending", scheduledAt: new Date().toISOString() });
    pushNotification({ message: `سمح المشرف التعليمي بإعادة سرد فوري للطالب ${name}`, type: "sard" });
    toast.success("تم — يمكن للمسمّع البدء فوراً");
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
            <p className="text-sm text-muted-foreground">صلاحية كاملة على جميع الحلقات + الموافقة على إعادة السرد + إعادة المستوى فوراً</p>
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

        <div className="mb-6"><ActiveSardList /></div>
        <div className="mb-6"><LateSardList /></div>

        {/* Awaiting approval for 3rd attempt */}
        <section className="glass-card rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-primary mb-4">طلبات الموافقة على محاولة ثالثة ({awaiting.length})</h2>
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
                    <button onClick={() => approveThird(q.id, s.name)}
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

        {/* Scheduled (waiting 2 days) — allow immediate retry */}
        <section className="glass-card rounded-2xl p-6">
          <h2 className="text-lg font-bold text-primary mb-2 flex items-center gap-2">
            <Clock className="w-5 h-5" /> طلاب في انتظار إعادة السرد ({scheduled.length})
          </h2>
          <p className="text-xs text-muted-foreground mb-4">يمكنك السماح بإعادة السرد فوراً دون انتظار يومين.</p>
          {scheduled.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">لا يوجد طلاب مجدوَلين</p>
          ) : (
            <div className="space-y-2">
              {scheduled.map((q) => {
                const s = students.find((x) => x.id === q.studentId);
                const h = halaqat.find((x) => x.id === q.halaqaId);
                if (!s || !h) return null;
                const when = q.scheduledAt ? new Date(q.scheduledAt).toLocaleDateString("ar") : "—";
                return (
                  <div key={q.id} className="flex items-center justify-between p-4 rounded-lg bg-warning/5 border border-warning/20">
                    <div>
                      <div className="font-bold">{s.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {h.name} · {weekLabel(q.week)} · موعد الإعادة: {when}
                      </div>
                    </div>
                    <button onClick={() => forceImmediate(q.id, s.name)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-warning/20 text-warning border border-warning/30 font-bold text-sm hover:bg-warning/30">
                      <Zap className="w-4 h-4" />
                      السماح بالإعادة الآن
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
