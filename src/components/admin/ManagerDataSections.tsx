import { useEffect, useState } from "react";
import {
  loadHalaqat, saveHalaqat, type Halaqa,
} from "@/lib/mock-data";
import {
  loadRoleAccountsCloud, upsertRoleAccount, deleteRoleAccount, pushHalaqat, deleteHalaqa,
  type CloudRoleAccount,
} from "@/lib/cloud-sync";
import { Plus, Trash2, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { GradeInputSettingsSection } from "@/components/admin/GradeInputSettingsSection";

export function HalaqatManagementSection() {
  const [halaqat, setHalaqat] = useState<Halaqa[]>(() => loadHalaqat());
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Omit<Halaqa, "id">>({
    name: "", isTalqeen: false,
    teacherName: "", teacherCode: "",
    assistantName: "", assistantCode: "",
  });

  const add = async () => {
    if (!form.name.trim()) { toast.error("أكمل البيانات"); return; }
    const next: Halaqa[] = [...halaqat, { id: Math.max(0, ...halaqat.map((h) => h.id)) + 1, ...form }];
    setSaving(true);
    try {
      await pushHalaqat(next);
      setHalaqat(next);
      setForm({ name: "", isTalqeen: false, teacherName: "", teacherCode: "", assistantName: "", assistantCode: "" });
      toast.success("تمت إضافة الحلقة وحفظها في قاعدة البيانات");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل حفظ الحلقة");
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: number) => {
    if (!confirm("حذف هذه الحلقة؟")) return;
    const next = halaqat.filter((h) => h.id !== id);
    setSaving(true);
    try {
      await deleteHalaqa(id);
      saveHalaqat(next);
      setHalaqat(next);
      toast.success("تم حذف الحلقة");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل حذف الحلقة");
    } finally {
      setSaving(false);
    }
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
          <button type="button" onClick={add} disabled={saving} className="px-4 py-2 rounded-lg gold-gradient text-primary-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} إضافة
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
              <button type="button" onClick={() => del(h.id)} disabled={saving} className="p-2 rounded-lg hover:bg-destructive/20 text-destructive disabled:opacity-50">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CodesManagementSection() {
  const [halaqat, setHalaqat] = useState<Halaqa[]>(() => loadHalaqat());
  const [savingId, setSavingId] = useState<number | null>(null);

  const update = (id: number, patch: Partial<Halaqa>) => {
    setHalaqat((cur) => cur.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  };

  const saveRow = async (h: Halaqa) => {
    setSavingId(h.id);
    try {
      await pushHalaqat(halaqat);
      toast.success(`تم حفظ رموز حلقة «${h.name}»`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل حفظ الرموز");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-5">
        <h3 className="font-bold mb-3 text-primary">رموز المعلمين والمساعدين</h3>
        <p className="text-xs text-muted-foreground mb-4">عدّل البيانات ثم اضغط «حفظ» لكل حلقة لإرسالها إلى قاعدة البيانات.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="text-right text-muted-foreground border-b border-border">
                <th className="p-2">الحلقة</th>
                <th className="p-2">اسم المعلم</th>
                <th className="p-2">رمزه</th>
                <th className="p-2">اسم المساعد</th>
                <th className="p-2">رمزه</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {halaqat.map((h) => (
                <tr key={h.id} className="border-b border-border/30">
                  <td className="p-2 font-medium">{h.name}</td>
                  <td className="p-2"><input className="px-2 py-1 rounded bg-input border border-border w-full" value={h.teacherName} onChange={(e) => update(h.id, { teacherName: e.target.value })} /></td>
                  <td className="p-2"><input className="px-2 py-1 rounded bg-input border border-border font-mono text-primary text-center w-24" value={h.teacherCode} onChange={(e) => update(h.id, { teacherCode: e.target.value })} /></td>
                  <td className="p-2"><input className="px-2 py-1 rounded bg-input border border-border w-full" value={h.assistantName} onChange={(e) => update(h.id, { assistantName: e.target.value })} /></td>
                  <td className="p-2"><input className="px-2 py-1 rounded bg-input border border-border font-mono text-primary text-center w-24" value={h.assistantCode} onChange={(e) => update(h.id, { assistantCode: e.target.value })} /></td>
                  <td className="p-2">
                    <button type="button" onClick={() => saveRow(h)} disabled={savingId === h.id} title="حفظ" className="p-1.5 rounded bg-primary/15 text-primary border border-primary/30 disabled:opacity-50">
                      {savingId === h.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <RoleAccountsSection />
    </div>
  );
}

function RoleAccountsSection() {
  const [rows, setRows] = useState<CloudRoleAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ role: string; name: string; code: string }>({ role: "musammi", name: "", code: "" });

  const reload = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setRows(await loadRoleAccountsCloud());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "فشل تحميل الحسابات";
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  const roleLabel = (r: string) => ({
    manager: "المدير", secretary: "السكرتير", supervisor: "الإشراف التعليمي", program_supervisor: "مشرف البرامج", musammi: "المسمّع",
  } as Record<string, string>)[r] || r;

  const update = (id: string, patch: Partial<CloudRoleAccount>) => {
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const saveRow = async (r: CloudRoleAccount) => {
    if (!r.name.trim() || !r.code.trim()) { toast.error("الاسم والرمز مطلوبان"); return; }
    setSaving(true);
    try {
      await upsertRoleAccount({ id: r.id, role: r.role, name: r.name.trim(), code: r.code.trim(), permissions: r.permissions || [] });
      toast.success("تم الحفظ في قاعدة البيانات");
      await reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : "فشل الحفظ"); }
    finally { setSaving(false); }
  };

  const removeRow = async (id: string) => {
    if (!confirm("حذف هذا الحساب؟")) return;
    setSaving(true);
    try {
      await deleteRoleAccount(id);
      toast.success("تم الحذف");
      await reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : "فشل الحذف"); }
    finally { setSaving(false); }
  };

  const addRow = async () => {
    if (!form.name.trim() || !form.code.trim()) { toast.error("أكمل البيانات"); return; }
    setSaving(true);
    try {
      await upsertRoleAccount({ role: form.role, name: form.name.trim(), code: form.code.trim(), permissions: [] });
      toast.success("تمت الإضافة وحفظها في قاعدة البيانات");
      setForm({ role: "musammi", name: "", code: "" });
      await reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : "فشل الإضافة"); }
    finally { setSaving(false); }
  };

  return (
    <div className="glass-card rounded-2xl p-5">
      <h3 className="font-bold mb-3 text-primary">رموز الإدارة والمشرفين</h3>
      <p className="text-xs text-muted-foreground mb-4">يمكن للمدير إضافة مشرفين/مسمّعين وتعديل أسمائهم ورموزهم.</p>

      <div className="grid md:grid-cols-4 gap-2 mb-4 p-3 rounded-lg bg-secondary/30 border border-border">
        <select className="px-3 py-2 rounded-lg bg-input border border-border" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="manager">مدير</option>
          <option value="secretary">سكرتير</option>
          <option value="supervisor">مشرف تعليمي</option>
          <option value="program_supervisor">مشرف البرامج</option>
          <option value="musammi">مسمّع</option>
        </select>
        <input className="px-3 py-2 rounded-lg bg-input border border-border" placeholder="الاسم" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="px-3 py-2 rounded-lg bg-input border border-border font-mono" placeholder="الرمز" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        <button type="button" onClick={addRow} disabled={saving} className="px-4 py-2 rounded-lg gold-gradient text-primary-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} إضافة
        </button>
      </div>

      {loadError && (
        <div className="mb-4 p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-sm text-destructive">
          {loadError}
          <button type="button" onClick={() => void reload()} className="mr-2 underline">إعادة المحاولة</button>
        </div>
      )}

      {loading ? (
        <p className="text-center text-sm text-muted-foreground py-4 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> جاري التحميل...
        </p>
      ) : rows.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-4">لا توجد حسابات بعد — أضف أول مشرف من الأعلى.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="text-right text-muted-foreground border-b border-border">
                <th className="p-2">الدور</th>
                <th className="p-2">الاسم</th>
                <th className="p-2">الرمز</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/30">
                  <td className="p-2">
                    <select className="px-2 py-1 rounded bg-input border border-border" value={r.role} onChange={(e) => update(r.id, { role: e.target.value })}>
                      <option value="manager">مدير</option>
                      <option value="secretary">سكرتير</option>
                      <option value="supervisor">مشرف تعليمي</option>
                      <option value="program_supervisor">مشرف البرامج</option>
                      <option value="musammi">مسمّع</option>
                    </select>
                    <div className="text-[10px] text-muted-foreground mt-1">{roleLabel(r.role)}</div>
                  </td>
                  <td className="p-2"><input className="px-2 py-1 rounded bg-input border border-border w-full" value={r.name} onChange={(e) => update(r.id, { name: e.target.value })} /></td>
                  <td className="p-2"><input className="px-2 py-1 rounded bg-input border border-border font-mono text-primary text-center w-28" value={r.code} onChange={(e) => update(r.id, { code: e.target.value })} /></td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      <button type="button" onClick={() => saveRow(r)} disabled={saving} title="حفظ" className="p-1.5 rounded bg-primary/15 text-primary border border-primary/30 disabled:opacity-50"><Save className="w-3.5 h-3.5" /></button>
                      <button type="button" onClick={() => removeRow(r.id)} disabled={saving} title="حذف" className="p-1.5 rounded bg-destructive/15 text-destructive border border-destructive/30 disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const GRADE_LABELS: Record<string, string> = {
  present: "حاضر", late: "متأخر", excused: "مستأذن", absent: "غائب",
  hifz_half: "حفظ ½", hifz_one: "حفظ ١", hifz_two: "حفظ ٢",
  rabt_pass: "ربط مجتاز", rabt_fail: "ربط راسب",
  muraja_pass: "مراجعة مجتاز", muraja_fail: "مراجعة راسب", wajib: "واجب (تلقين)",
};

function defaultGradeSettings(): Record<string, number> {
  return { present: 15, late: 10, excused: 5, absent: 0, hifz_half: 15, hifz_one: 20, hifz_two: 25, rabt_pass: 15, rabt_fail: 5, muraja_pass: 15, muraja_fail: 5, wajib: 15 };
}

export function GradeItemsSection() {
  const KEY = "qshatawi_grade_settings_v2";
  const [settings, setSettings] = useState(() => {
    if (typeof window === "undefined") return defaultGradeSettings();
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) as Record<string, number> : defaultGradeSettings();
  });

  const save = (s: Record<string, number>) => {
    setSettings(s);
    localStorage.setItem(KEY, JSON.stringify(s));
    toast.success("تم الحفظ");
  };

  return (
    <div className="space-y-6">
      <GradeInputSettingsSection />
      <div className="glass-card rounded-2xl p-5">
      <h3 className="font-bold mb-3 text-primary">قيم بنود الدرجات</h3>
      <p className="text-xs text-muted-foreground mb-4">نقاط كل بند في حساب النسب (حضور، حفظ، ربط، مراجعة).</p>
      <div className="grid md:grid-cols-2 gap-3">
        {Object.entries(settings).map(([k, v]) => (
          <div key={k} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
            <label className="text-sm">{GRADE_LABELS[k] || k}</label>
            <input
              type="number"
              value={v}
              onChange={(e) => save({ ...settings, [k]: Number(e.target.value) })}
              className="w-20 px-2 py-1 rounded bg-input border border-border text-center font-bold text-primary"
            />
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
