import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  loadHalaqat, saveHalaqat, loadStudents, saveStudents, type Halaqa, type Student,
} from "@/lib/mock-data";
import { toCsvUrl, parseCsv, normalizeRows, normalizeArabic } from "@/lib/google-sheets";
import { AppHeader } from "@/components/AppHeader";
import { Plus, Trash2, Users, BookOpen, Key, Settings as SettingsIcon, FileSpreadsheet, Download, Loader2 } from "lucide-react";
import { Toaster, toast } from "sonner";

export const Route = createFileRoute("/dashboard")({ component: DashboardPage });

type Tab = "import" | "halaqat" | "students" | "codes" | "grades";

function DashboardPage() {
  const [tab, setTab] = useState<Tab>("import");
  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "import", label: "استيراد Google Sheets", icon: FileSpreadsheet },
    { id: "students", label: "الطلاب", icon: Users },
    { id: "halaqat", label: "الحلقات", icon: BookOpen },
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
          <p className="text-sm text-muted-foreground mt-1">إدارة كل عناصر المجمع وقاعدة البيانات</p>
          <Link to="/admin" className="text-xs text-primary mt-2 inline-block">← العودة للوحة الإداري</Link>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${active ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            );
          })}
        </div>

        {tab === "import" && <ImportTab />}
        {tab === "halaqat" && <HalaqatTab />}
        {tab === "students" && <StudentsTab />}
        {tab === "codes" && <CodesTab />}
        {tab === "grades" && <GradesTab />}
      </main>
    </div>
  );
}

function ImportTab() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ReturnType<typeof normalizeRows>>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchPreview = async () => {
    if (!url.trim()) { toast.error("الصق رابط Google Sheet أولاً"); return; }
    setLoading(true); setError(null); setPreview([]);
    try {
      const csvUrl = toCsvUrl(url);
      const res = await fetch(csvUrl);
      if (!res.ok) throw new Error(`فشل الجلب (${res.status}) — تأكد أن الملف منشور للعموم`);
      const text = await res.text();
      const rows = parseCsv(text);
      const normalized = normalizeRows(rows);
      if (normalized.length === 0) throw new Error("لا توجد صفوف صالحة");
      setPreview(normalized);
      toast.success(`تم قراءة ${normalized.length} طالب`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "خطأ غير متوقع";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Computed preview-time matching of halaqat (used to warn before import)
  const halaqatCurrent = useMemo(() => loadHalaqat(), [preview]);
  const halaqatByNorm = useMemo(
    () => new Map(halaqatCurrent.map((h) => [normalizeArabic(h.name), h])),
    [halaqatCurrent],
  );
  const unmatched = useMemo(() => {
    const set = new Map<string, number>();
    for (const r of preview) {
      if (!r.halaqaName) continue;
      if (!halaqatByNorm.get(normalizeArabic(r.halaqaName))) {
        set.set(r.halaqaName, (set.get(r.halaqaName) || 0) + 1);
      }
    }
    return Array.from(set.entries()); // [name, count][]
  }, [preview, halaqatByNorm]);

  const applyImport = async () => {
    const halaqatByName = new Map(halaqatCurrent.map((h) => [normalizeArabic(h.name), h]));
    const nextHalaqat = [...halaqatCurrent];
    for (const row of preview) {
      const key = normalizeArabic(row.halaqaName);
      if (!row.halaqaName || halaqatByName.has(key)) continue;
      const halaqa: Halaqa = {
        id: Math.max(0, ...nextHalaqat.map((h) => h.id)) + 1,
        name: row.halaqaName,
        isTalqeen: row.isTalqeen,
        teacherName: row.teacherName || "—",
        teacherCode: row.teacherCode || "",
        assistantName: row.assistantName || "—",
        assistantCode: row.assistantCode || "",
      };
      nextHalaqat.push(halaqa);
      halaqatByName.set(key, halaqa);
    }

    const existingStudents = loadStudents();
    const studentsByNid = new Map(existingStudents.map((s) => [s.nationalId, s]));
    const updated: Student[] = [...existingStudents];

    let added = 0, updatedCount = 0, skipped = 0;
    for (const row of preview) {
      const halaqa = halaqatByName.get(normalizeArabic(row.halaqaName));
      if (!halaqa) { skipped++; continue; }

      const existing = studentsByNid.get(row.nationalId);
      if (existing) {
        const idx = updated.findIndex((s) => s.id === existing.id);
        updated[idx] = {
          ...existing,
          name: row.name,
          halaqaId: halaqa.id,
          parentPhone: row.phone,
          level: row.level,
          levelType: row.levelType,
        };
        updatedCount++;
      } else {
        const newStudent: Student = {
          id: `s-import-${row.nationalId}`,
          name: row.name,
          halaqaId: halaqa.id,
          nationalId: row.nationalId,
          parentPhone: row.phone,
          level: row.level,
          levelType: row.levelType,
        };
        updated.push(newStudent);
        studentsByNid.set(row.nationalId, newStudent);
        added++;
      }
    }
    saveHalaqat(nextHalaqat);
    saveStudents(updated);
    try {
      const cloud = await import("@/lib/cloud-sync");
      await cloud.pushHalaqat(nextHalaqat);
      await cloud.pushStudents(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر الحفظ في السحابة");
      return;
    }
    const createdHalaqat = nextHalaqat.length - halaqatCurrent.length;
    const msg = `تم: +${added} طالب · تحديث ${updatedCount} · إنشاء ${createdHalaqat} حلقة` + (skipped ? ` · تم تجاهل ${skipped}` : "");
    if (skipped) toast.warning(msg); else toast.success(msg);
    setPreview([]);
    setUrl("");
  };

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-5">
        <h3 className="font-bold mb-3 text-primary flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5" /> استيراد الطلاب من Google Sheets
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          1. افتح ملف Google Sheets الخاص بك ← مشاركة ← أي شخص لديه الرابط (قارئ).<br />
          2. الأعمدة المطلوبة: <span className="text-primary font-bold">اسم الطالب | اسم الحلقة | الهوية | الجوال | المستوى | ذهبي/فضي</span>.<br />
          3. اختياري لإنشاء الحلقة تلقائياً: <span className="text-primary font-bold">اسم المعلم | رمز المعلم | اسم المساعد | رمز المساعد | تلقين</span>.
        </p>
        {halaqatCurrent.length > 0 && (
          <details className="mb-3 text-xs">
            <summary className="cursor-pointer text-primary">أسماء الحلقات الموجودة ({halaqatCurrent.length}) — انسخ منها</summary>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {halaqatCurrent.map((h) => (
                <span key={h.id} className="px-2 py-1 rounded bg-secondary/50 border border-border font-mono">{h.name}</span>
              ))}
            </div>
          </details>
        )}
        <div className="flex gap-2">
          <input
            className="flex-1 px-3 py-2 rounded-lg bg-input border border-border"
            placeholder="https://docs.google.com/spreadsheets/d/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            dir="ltr"
          />
          <button onClick={fetchPreview} disabled={loading}
            className="px-4 py-2 rounded-lg gold-gradient text-primary-foreground font-bold flex items-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            معاينة
          </button>
        </div>
        {error && <p className="text-sm text-destructive mt-3">{error}</p>}
      </div>

      {preview.length > 0 && unmatched.length > 0 && (
        <div className="rounded-2xl p-5 border border-warning/40 bg-warning/10">
          <h3 className="font-bold text-warning mb-2">⚠️ حلقات في الملف غير مسجلة في النظام</h3>
          <p className="text-xs text-muted-foreground mb-3">
            هؤلاء الطلاب سيتم تجاهلهم. أضف الحلقات يدوياً من تبويب «الحلقات» ثم أعد الاستيراد، أو صحّح أسماء الحلقات في الشيت لتطابق الأسماء أعلاه.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unmatched.map(([name, count]) => (
              <span key={name} className="px-2 py-1 rounded bg-background border border-warning/40 text-xs">
                <span className="font-bold">{name}</span> <span className="text-muted-foreground">({count} طالب)</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {preview.length > 0 && (
        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-primary">معاينة ({preview.length} طالب)</h3>
            <button onClick={applyImport}
              className="px-4 py-2 rounded-lg gold-gradient text-primary-foreground font-bold">
              تأكيد الاستيراد
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs text-muted-foreground">
                <tr>
                  <th className="p-2 text-right">الاسم</th>
                  <th className="p-2 text-right">الحلقة</th>
                  <th className="p-2 text-right">الهوية</th>
                  <th className="p-2 text-right">الجوال</th>
                  <th className="p-2 text-right">المستوى</th>
                  <th className="p-2 text-right">النوع</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 100).map((r, i) => (
                  <tr key={i} className="border-b border-border/30">
                    <td className="p-2">{r.name}</td>
                    <td className="p-2 text-muted-foreground">{r.halaqaName}</td>
                    <td className="p-2 font-mono text-xs">{r.nationalId}</td>
                    <td className="p-2 font-mono text-xs">{r.phone}</td>
                    <td className="p-2">{r.level}</td>
                    <td className="p-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${r.levelType === "gold" ? "gold-gradient text-primary-foreground" : "bg-muted"}`}>
                        {r.levelType === "gold" ? "ذهبي" : "فضي"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 100 && <p className="text-xs text-muted-foreground text-center mt-2">… و{preview.length - 100} صف آخر</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function HalaqatTab() {
  const [halaqat, setHalaqat] = useState<Halaqa[]>(() => loadHalaqat());
  const [form, setForm] = useState<Omit<Halaqa, "id">>({
    name: "", isTalqeen: false,
    teacherName: "", teacherCode: "",
    assistantName: "", assistantCode: "",
  });

  const add = () => {
    if (!form.name) { toast.error("أكمل البيانات"); return; }
    const next: Halaqa[] = [...halaqat, { id: Math.max(0, ...halaqat.map((h) => h.id)) + 1, ...form }];
    setHalaqat(next); saveHalaqat(next);
    setForm({ name: "", isTalqeen: false, teacherName: "", teacherCode: "", assistantName: "", assistantCode: "" });
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
        <div className="grid md:grid-cols-3 gap-2">
          <input className="px-3 py-2 rounded-lg bg-input border border-border" placeholder="اسم الحلقة" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="px-3 py-2 rounded-lg bg-input border border-border" placeholder="اسم المعلم" value={form.teacherName} onChange={(e) => setForm({ ...form, teacherName: e.target.value })} />
          <input className="px-3 py-2 rounded-lg bg-input border border-border" placeholder="رمز المعلم" value={form.teacherCode} onChange={(e) => setForm({ ...form, teacherCode: e.target.value })} />
          <input className="px-3 py-2 rounded-lg bg-input border border-border" placeholder="اسم المساعد" value={form.assistantName} onChange={(e) => setForm({ ...form, assistantName: e.target.value })} />
          <input className="px-3 py-2 rounded-lg bg-input border border-border" placeholder="رمز المساعد" value={form.assistantCode} onChange={(e) => setForm({ ...form, assistantCode: e.target.value })} />
          <button onClick={add} className="px-4 py-2 rounded-lg gold-gradient text-primary-foreground font-bold flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" /> إضافة
          </button>
        </div>
        <label className="flex items-center gap-2 mt-3 text-sm">
          <input type="checkbox" checked={form.isTalqeen} onChange={(e) => setForm({ ...form, isTalqeen: e.target.checked })} />
          حلقة تلقين
        </label>
      </div>

      <div className="glass-card rounded-2xl p-5">
        <h3 className="font-bold mb-3 text-primary">الحلقات الحالية ({halaqat.length})</h3>
        <div className="space-y-2">
          {halaqat.map((h) => (
            <div key={h.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
              <div>
                <div className="font-medium">{h.name}</div>
                <div className="text-xs text-muted-foreground">
                  معلم: {h.teacherName} (<span className="text-primary font-mono">{h.teacherCode || "—"}</span>) ·
                  مساعد: {h.assistantName} (<span className="text-primary font-mono">{h.assistantCode || "—"}</span>)
                  {h.isTalqeen && " · تلقين"}
                </div>
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
  const [students, setStudents] = useState<Student[]>(() => loadStudents());
  const [q, setQ] = useState("");
  const halaqat = loadHalaqat();
  const [form, setForm] = useState<Omit<Student, "id">>({
    name: "", halaqaId: halaqat[0]?.id || 1, nationalId: "", parentPhone: "",
    level: "1", levelType: "gold",
  });

  const filtered = useMemo(() => {
    if (!q.trim()) return students;
    return students.filter((s) => s.name.includes(q) || s.nationalId.includes(q));
  }, [students, q]);

  const add = () => {
    if (!form.name || !form.nationalId) { toast.error("الاسم ورقم الهوية مطلوبان"); return; }
    const next: Student[] = [...students, { id: `s-${Date.now()}`, ...form }];
    setStudents(next); saveStudents(next);
    void import("@/lib/cloud-sync").then((m) => m.pushStudents(next));
    toast.success("تمت الإضافة وحُفظت في السحابة");
    setForm({ ...form, name: "", nationalId: "", parentPhone: "" });
  };
  const del = (id: string) => {
    const next = students.filter((s) => s.id !== id);
    setStudents(next); saveStudents(next);
    void import("@/lib/cloud-sync").then((m) => m.deleteStudent(id));
  };

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-5">
        <h3 className="font-bold mb-3 text-primary">إضافة طالب جديد</h3>
        <div className="grid md:grid-cols-3 gap-2">
          <input className="px-3 py-2 rounded-lg bg-input border border-border" placeholder="اسم الطالب" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="px-3 py-2 rounded-lg bg-input border border-border" placeholder="رقم الهوية" value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} />
          <select className="px-3 py-2 rounded-lg bg-input border border-border" value={form.halaqaId} onChange={(e) => setForm({ ...form, halaqaId: Number(e.target.value) })}>
            {halaqat.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <input className="px-3 py-2 rounded-lg bg-input border border-border" placeholder="جوال ولي الأمر" value={form.parentPhone} onChange={(e) => setForm({ ...form, parentPhone: e.target.value })} />
          <input className="px-3 py-2 rounded-lg bg-input border border-border" placeholder="المستوى" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} />
          <select className="px-3 py-2 rounded-lg bg-input border border-border" value={form.levelType} onChange={(e) => setForm({ ...form, levelType: e.target.value as "gold" | "silver" })}>
            <option value="gold">ذهبي</option>
            <option value="silver">فضي</option>
          </select>
        </div>
        <button onClick={add} className="mt-3 px-4 py-2 rounded-lg gold-gradient text-primary-foreground font-bold flex items-center gap-2">
          <Plus className="w-4 h-4" /> إضافة الطالب
        </button>
      </div>

      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h3 className="font-bold text-primary">الطلاب ({filtered.length} / {students.length})</h3>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو الهوية..." className="px-3 py-1.5 rounded-lg bg-input border border-border text-sm" />
        </div>
        <div className="max-h-[500px] overflow-y-auto space-y-1">
          {filtered.map((s) => {
            const h = halaqat.find((x) => x.id === s.halaqaId);
            return (
              <div key={s.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-secondary/50">
                <div className="text-sm flex-1">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-muted-foreground mr-2">
                    • {h?.name} • هوية: <span className="font-mono">{s.nationalId}</span> • {s.parentPhone}
                  </span>
                  <span className={`mr-2 px-1.5 py-0.5 rounded text-[10px] font-bold ${s.levelType === "gold" ? "gold-gradient text-primary-foreground" : "bg-muted"}`}>
                    {s.levelType === "gold" ? "ذهبي" : "فضي"} {s.level}
                  </span>
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
  const [halaqat, setHalaqat] = useState<Halaqa[]>(() => loadHalaqat());
  const update = (id: number, patch: Partial<Halaqa>) => {
    const next = halaqat.map((h) => h.id === id ? { ...h, ...patch } : h);
    setHalaqat(next); saveHalaqat(next);
  };

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-5">
        <h3 className="font-bold mb-3 text-primary">رموز المعلمين والمساعدين</h3>
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead><tr className="text-right text-muted-foreground border-b border-border">
            <th className="p-2">الحلقة</th>
            <th className="p-2">اسم المعلم</th>
            <th className="p-2">رمزه</th>
            <th className="p-2">اسم المساعد</th>
            <th className="p-2">رمزه</th>
          </tr></thead>
          <tbody>
            {halaqat.map((h) => (
              <tr key={h.id} className="border-b border-border/30">
                <td className="p-2 font-medium">{h.name}</td>
                <td className="p-2"><input className="px-2 py-1 rounded bg-input border border-border w-full" value={h.teacherName} onChange={(e) => update(h.id, { teacherName: e.target.value })} /></td>
                <td className="p-2"><input className="px-2 py-1 rounded bg-input border border-border font-mono text-primary text-center w-24" value={h.teacherCode} onChange={(e) => update(h.id, { teacherCode: e.target.value })} /></td>
                <td className="p-2"><input className="px-2 py-1 rounded bg-input border border-border w-full" value={h.assistantName} onChange={(e) => update(h.id, { assistantName: e.target.value })} /></td>
                <td className="p-2"><input className="px-2 py-1 rounded bg-input border border-border font-mono text-primary text-center w-24" value={h.assistantCode} onChange={(e) => update(h.id, { assistantCode: e.target.value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
      <div className="glass-card rounded-2xl p-5">
        <h3 className="font-bold mb-3 text-primary">رموز الإدارة العليا (ثابتة في النظام)</h3>
        <div className="grid sm:grid-cols-2 gap-2 text-sm">
          <Row label="المدير — أ. فيصل الفوزان" code="1414" />
          <Row label="السكرتير — أ. أحمد العمر" code="4141" />
          <Row label="الإشراف التعليمي — أ. محمد البرادي" code="5522" />
          <Row label="المسمّع — أ. يزيد الخضير" code="0011" />
          <Row label="المسمّع — أ. عبدالله الدبيخي" code="0022" />
        </div>
      </div>
    </div>
  );
}

function Row({ label, code }: { label: string; code: string }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/50">
      <span>{label}</span>
      <span className="font-mono text-primary font-bold">{code}</span>
    </div>
  );
}

function GradesTab() {
  const KEY = "qshatawi_grade_settings_v2";
  const [settings, setSettings] = useState(() => {
    if (typeof window === "undefined") return defaultSettings();
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : defaultSettings();
  });

  const save = (s: Record<string, number>) => {
    setSettings(s); localStorage.setItem(KEY, JSON.stringify(s)); toast.success("تم الحفظ");
  };

  return (
    <div className="glass-card rounded-2xl p-5">
      <h3 className="font-bold mb-3 text-primary">بنود الدرجات</h3>
      <p className="text-xs text-muted-foreground mb-4">قيم البنود الأساسية في الحسابات.</p>
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
  hifz_half: "حفظ ½", hifz_one: "حفظ ١", hifz_two: "حفظ ٢",
  rabt_pass: "ربط مجتاز", rabt_fail: "ربط راسب",
  muraja_pass: "مراجعة مجتاز", muraja_fail: "مراجعة راسب", wajib: "واجب (تلقين)",
};
function defaultSettings(): Record<string, number> {
  return { present: 15, late: 10, excused: 5, absent: 0, hifz_half: 15, hifz_one: 20, hifz_two: 25, rabt_pass: 15, rabt_fail: 5, muraja_pass: 15, muraja_fail: 5, wajib: 15 };
}
