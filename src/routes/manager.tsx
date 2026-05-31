import { createFileRoute, Link } from "@tanstack/react-router";
import { loadSardQueue, loadStudents, loadHalaqat } from "@/lib/mock-data";
import { weekLabel } from "@/lib/arabic-numbers";
import { AppHeader } from "@/components/AppHeader";
import { LateSardList } from "@/components/SardLists";
import { Crown, AlertTriangle, Settings, Shield, BookOpen } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/manager")({ component: ManagerPage });

function ManagerPage() {
  const [queue] = useState(() => loadSardQueue());
  const students = loadStudents();
  const halaqat = loadHalaqat();

  const failedFinal = queue.filter((q) => q.status === "final_failed");

  return (
    <div className="min-h-screen">
      <AppHeader title="لوحة المدير" subtitle="أ. فيصل الفوزان" />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="glass-card rounded-2xl p-6 mb-6 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl gold-gradient flex items-center justify-center">
            <Crown className="w-7 h-7 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h1 className="display text-2xl gold-text">لوحة المدير</h1>
            <p className="text-sm text-muted-foreground">إدارة عليا — متابعة الحالات الخاصة وكل الحلقات</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 mb-6">
          <Link to="/admin" className="glass-card rounded-2xl p-5 hover:gold-glow hover:border-primary transition-all">
            <Shield className="w-6 h-6 text-primary mb-2" />
            <div className="font-bold">لوحة الإدارة</div>
            <div className="text-xs text-muted-foreground">غياب وإشعارات</div>
          </Link>
          <Link to="/dashboard" className="glass-card rounded-2xl p-5 hover:gold-glow hover:border-primary transition-all">
            <Settings className="w-6 h-6 text-primary mb-2" />
            <div className="font-bold">لوحة التحكم</div>
            <div className="text-xs text-muted-foreground">طلاب، حلقات، استيراد</div>
          </Link>
          <Link to="/supervisor" className="glass-card rounded-2xl p-5 hover:gold-glow hover:border-primary transition-all">
            <BookOpen className="w-6 h-6 text-primary mb-2" />
            <div className="font-bold">الإشراف التعليمي</div>
            <div className="text-xs text-muted-foreground">موافقات السرد</div>
          </Link>
        </div>

        {/* Halaqat quick view */}
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

        {/* Final failed students */}
        <section className="glass-card rounded-2xl p-6">
          <h2 className="text-lg font-bold text-destructive mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" /> طلاب رسبوا نهائياً ({failedFinal.length})
          </h2>
          {failedFinal.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">لا يوجد حالات رسوب نهائي حالياً</p>
          ) : (
            <div className="space-y-2">
              {failedFinal.map((q) => {
                const s = students.find((x) => x.id === q.studentId);
                const h = halaqat.find((x) => x.id === q.halaqaId);
                if (!s || !h) return null;
                return (
                  <div key={q.id} className="flex items-center justify-between p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                    <div>
                      <div className="font-bold">{s.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {h.name} · {weekLabel(q.week)} · النسبة النهائية: {q.finalPercent}%
                      </div>
                    </div>
                    <a href={`https://wa.me/${s.parentPhone}`} target="_blank" rel="noreferrer"
                      className="px-4 py-2 rounded-lg bg-success/20 text-success border border-success/30 text-sm font-bold">
                      تواصل مع ولي الأمر
                    </a>
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
