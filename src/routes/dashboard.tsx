import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  loadHalaqat, saveHalaqat, loadStudents, saveStudents, type Halaqa, type Student,
} from "@/lib/mock-data";
import { AppHeader } from "@/components/AppHeader";
import { Plus, Trash2, Users, BookOpen, Key, Settings as SettingsIcon } from "lucide-react";
import { Toaster, toast } from "sonner";

export const Route = createFileRoute("/dashboard")({ component: DashboardPage });

function DashboardPage() {
  const [tab, setTab] = useState<"halaqat" | "students" | "codes" | "grades">("halaqat");
  const tabs = [
    { id: "halaqat", label: "الحلقات", icon: BookOpen },
    { id: "students", label: "الطلاب", icon: Users },
    { id: "codes", label: "الرموز والمعلمين", icon: Key },
    { id: "grades", label: "بنود الدرجات", icon: SettingsIcon },
  ];

  return (
    <div className="min-h-screen">
      <Toaster position="top-center" richColors />
      <AppHeader title="لوحة التحكم الكاملة" subtitle="إدارة شاملة" />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="glass-card rounded-2xl p-6 mb-6">
          <h1 className="display text-3xl gold-text">لوحة التحكم الكاملة</h1>
          <p className="text-sm text-muted-foreground mt-1">إضافة وتعديل وإدارة جميع عناصر المجمع</p>
          <Link to="/admin" className="text-xs text-primary mt-2 inline-block">← العودة للوحة الإداري</Link>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${active ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            );
          })}
        </div>

        {tab === "halaqat" && <HalaqatTab />}
        {tab === "students" && <StudentsTab />}
        {tab === "codes" && <CodesTab />}
        {tab === "grades" && <GradesTab />}
      </main>
    </div>
  );
}

function HalaqatTab() {
  const [halaqat, setHalaqat] = useState(() => loadHalaqat());
  const [form, setForm] = useState({ name: "", code: "", isTalqeen: false, teacher: "", assistant: "" });

  const add = () => {
    if (!form.name || !form.code) { toast.error("أكمل البيانات"); return; }
    const next = [...halaqat, { id: Math.max(0, ...halaqat.map((h) => h.id)) + 1, ...form }];
    setHalaqat(next); saveHalaqat(next);
    setForm({ name: "", code: "", isTalqeen: false, teacher: "", assistant: "" });
    toast.success("تمت إضافة الحلقة");
  };
  const del = (id: number) => {
    const next = halaqat.filter((h) => h.id !== id);
    setHalaqat(next); saveHalaqat(next);
  };

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-5">
        <h3 className="font-bold mb-3 text-primary">إضافة حلقة جديدة</h3>
        <div className="grid md:grid-cols-5 gap-2">
          <input className="px-3 py-2 rounded-lg bg-input border border-border" placeholder="اسم الحلقة" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="px-3 py-2 rounded-lg bg-input border border-border" placeholder="الرمز" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <input className="px-3 py-2 rounded-lg bg-input border border-border" placeholder="المعلم" value={form.teacher} onChange={(e) => setForm({ ...form, teacher: e.target.value })} />
          <input className="px-3 py-2 rounded-lg bg-input border border-border" placeholder="المساعد" value={form.assistant} onChange={(e) => setForm({ ...form, assistant: e.target.value })} />
          <button onClick={add} className="px-4 py-2 rounded-lg gold-gradient text-primary-foreground font-bold flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" /> إضافة
          </button>
        </div>
        <label className="flex items-center gap-2 mt-3 text-sm">
          <input type="checkbox" checked={form.isTalqeen} onChange={(e) => setForm({ ...form, isTalqeen: e.target.checked })} />
          حلقة تلقين (خياران فقط: حاضر + واجب)
        </label>
      </div>

      <div className="glass-card rounded-2xl p-5">
        <h3 className="font-bold mb-3 text-primary">الحلقات الحالية ({halaqat.length})</h3>
        <div className="space-y-2">
          {halaqat.map((h) => (
            <div key={h.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
              <div>
                <div className="font-medium">{h.name}</div>
                <div className="text-xs text-muted-foreground">رمز: <span className="text-primary font-mono">{h.code}</span> • معلم: {h.teacher} • مساعد: {h.assistant}{h.isTalqeen && " • تلقين"}</div>
              </div>
              <button onClick={() => del(h.id)} className="p-2 rounded-lg hover:bg-destructive/20 text-destructive">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StudentsTab() {
  const [students, setStudents] = useState(() => loadStudents());
  const halaqat = loadHalaqat();
  const [form, setForm] = useState({ name: "", halaqaId: halaqat[0]?.id || 1, parentPhone: "", memorized: "" });

  const add = () => {
    if (!form.name) { toast.error("أدخل اسم الطالب"); return; }
    const next: Student[] = [...students, { id: `s-${Date.now()}`, ...form }];
    setStudents(next); saveStudents(next); toast.success("تمت الإضافة");
    setForm({ ...form, name: "", parentPhone: "", memorized: "" });
  };
  const del = (id: string) => {
    const next = students.filter((s) => s.id !== id);
    setStudents(next); saveStudents(next);
  };

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-5">
        <h3 className="font-bold mb-3 text-primary">إضافة طالب جديد</h3>
        <div className="grid md:grid-cols-5 gap-2">
          <input className="px-3 py-2 rounded-lg bg-input border border-border" placeholder="اسم الطالب" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className="px-3 py-2 rounded-lg bg-input border border-border" value={form.halaqaId} onChange={(e) => setForm({ ...form, halaqaId: Number(e.target.value) })}>
            {halaqat.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <input className="px-3 py-2 rounded-lg bg-input border border-border" placeholder="جوال ولي الأمر" value={form.parentPhone} onChange={(e) => setForm({ ...form, parentPhone: e.target.value })} />
          <input className="px-3 py-2 rounded-lg bg-input border border-border" placeholder="المقاطع المحفوظة" value={form.memorized} onChange={(e) => setForm({ ...form, memorized: e.target.value })} />
          <button onClick={add} className="px-4 py-2 rounded-lg gold-gradient text-primary-foreground font-bold flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" /> إضافة
          </button>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-5">
        <h3 className="font-bold mb-3 text-primary">الطلاب ({students.length})</h3>
        <div className="max-h-[500px] overflow-y-auto space-y-1">
          {students.map((s) => {
            const h = halaqat.find((x) => x.id === s.halaqaId);
            return (
              <div key={s.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-secondary/50">
                <div className="text-sm">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-muted-foreground mr-2">• {h?.name} • {s.parentPhone}</span>
                </div>
                <button onClick={() => del(s.id)} className="p-1.5 rounded hover:bg-destructive/20 text-destructive">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CodesTab() {
  const [halaqat, setHalaqat] = useState(() => loadHalaqat());
  const update = (id: number, patch: Partial<Halaqa>) => {
    const next = halaqat.map((h) => h.id === id ? { ...h, ...patch } : h);
    setHalaqat(next); saveHalaqat(next);
  };

  return (
    <div className="glass-card rounded-2xl p-5">
      <h3 className="font-bold mb-3 text-primary">رموز الدخول والمعلمين</h3>
      <table className="w-full text-sm">
        <thead><tr className="text-right text-muted-foreground border-b border-border">
          <th className="p-2">الحلقة</th><th className="p-2">المعلم</th><th className="p-2">المساعد</th><th className="p-2">الرمز</th>
        </tr></thead>
        <tbody>
          {halaqat.map((h) => (
            <tr key={h.id} className="border-b border-border/30">
              <td className="p-2 font-medium">{h.name}</td>
              <td className="p-2"><input className="px-2 py-1 rounded bg-input border border-border w-full" value={h.teacher} onChange={(e) => update(h.id, { teacher: e.target.value })} /></td>
              <td className="p-2"><input className="px-2 py-1 rounded bg-input border border-border w-full" value={h.assistant} onChange={(e) => update(h.id, { assistant: e.target.value })} /></td>
              <td className="p-2"><input className="px-2 py-1 rounded bg-input border border-border font-mono text-primary text-center" value={h.code} onChange={(e) => update(h.id, { code: e.target.value })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground mt-3">رمز الإداري: <span className="text-primary font-mono">1221</span> • رمز المسمّع: <span className="text-primary font-mono">1122</span></p>
    </div>
  );
}

function GradesTab() {
  const KEY = "qshatawi_grade_settings_v1";
  const [settings, setSettings] = useState(() => {
    if (typeof window === "undefined") return defaultSettings();
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : defaultSettings();
  });

  const save = (s: any) => { setSettings(s); localStorage.setItem(KEY, JSON.stringify(s)); toast.success("تم الحفظ"); };

  return (
    <div className="glass-card rounded-2xl p-5">
      <h3 className="font-bold mb-3 text-primary">بنود الدرجات</h3>
      <p className="text-xs text-muted-foreground mb-4">عدّل قيمة كل بند. التعديلات تطبّق على الحسابات المستقبلية.</p>
      <div className="grid md:grid-cols-2 gap-3">
        {Object.entries(settings).map(([k, v]) => (
          <div key={k} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
            <label className="text-sm">{LABELS[k] || k}</label>
            <input type="number" value={v as number} onChange={(e) => save({ ...settings, [k]: Number(e.target.value) })}
              className="w-20 px-2 py-1 rounded bg-input border border-border text-center font-bold text-primary" />
          </div>
        ))}
      </div>
    </div>
  );
}

const LABELS: Record<string, string> = {
  present: "حاضر", late: "متأخر", excused: "مستأذن", absent: "غائب",
  hifz: "حفظ ✓", rabt_pass: "ربط مجتاز", rabt_fail: "ربط راسب",
  muraja_pass: "مراجعة مجتاز", muraja_fail: "مراجعة راسب", wajib: "واجب (تلقين)",
};
function defaultSettings() {
  return { present: 15, late: 10, excused: 5, absent: 0, hifz: 15, rabt_pass: 15, rabt_fail: 5, muraja_pass: 15, muraja_fail: 5, wajib: 15 };
}
