import { useMemo, useState } from "react";
import { loadHalaqat } from "@/lib/mock-data";
import {
  formatOptionsForInput,
  loadHalaqaCustomFields,
  newFieldId,
  parseOptionsInput,
  saveHalaqaCustomFields,
  type HalaqaCustomField,
} from "@/lib/halaqa-custom-fields";
import { Columns3, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function ManagerHalaqaFieldsPanel() {
  const halaqat = loadHalaqat();
  const [halaqaId, setHalaqaId] = useState<number>(halaqat[0]?.id ?? 1);
  const [fields, setFields] = useState<HalaqaCustomField[]>(() => loadHalaqaCustomFields(halaqaId));
  const [newLabel, setNewLabel] = useState("");
  const [newOptions, setNewOptions] = useState("");

  const halaqa = useMemo(() => halaqat.find((h) => h.id === halaqaId), [halaqat, halaqaId]);

  const switchHalaqa = (id: number) => {
    setHalaqaId(id);
    setFields(loadHalaqaCustomFields(id));
    setNewLabel("");
    setNewOptions("");
  };

  const persist = (next: HalaqaCustomField[]) => {
    setFields(next);
    saveHalaqaCustomFields(halaqaId, next);
  };

  const addField = () => {
    const label = newLabel.trim();
    const options = parseOptionsInput(newOptions);
    if (!label) {
      toast.error("أدخل اسم العمود");
      return;
    }
    if (options.length === 0) {
      toast.error("أضف خياراً واحداً على الأقل (مثل: ممتاز، جيد، ضعيف)");
      return;
    }
    persist([...fields, { id: newFieldId(), label, options, sortOrder: fields.length }]);
    setNewLabel("");
    setNewOptions("");
    toast.success("تمت إضافة العمود");
  };

  const updateField = (id: string, patch: Partial<HalaqaCustomField>) => {
    persist(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const removeField = (id: string) => {
    persist(fields.filter((f) => f.id !== id));
    toast.success("تم حذف العمود");
  };

  const saveAll = () => {
    saveHalaqaCustomFields(halaqaId, fields);
    toast.success("تم الحفظ");
  };

  return (
    <section className="glass-card rounded-2xl p-6">
      <h2 className="text-lg font-bold text-primary mb-2 flex items-center gap-2">
        <Columns3 className="w-5 h-5" /> أعمدة الحلقات المخصّصة
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        أضف أعمدة إضافية (مثل السلوك، المشاركة…) لكل حلقة — مع خيارات قابلة للتخصيص. الأعمدة الأساسية (حضور، حفظ، ربط، مراجعة) تبقى ثابتة.
      </p>

      <div className="mb-4">
        <label className="text-xs text-muted-foreground block mb-1">الحلقة</label>
        <select
          value={halaqaId}
          onChange={(e) => switchHalaqa(Number(e.target.value))}
          className="w-full max-w-md px-3 py-2 rounded-lg bg-input border border-border text-sm"
        >
          {halaqat.map((h) => (
            <option key={h.id} value={h.id}>{h.name}</option>
          ))}
        </select>
      </div>

      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border rounded-xl mb-4">
          لا توجد أعمدة مخصّصة لـ {halaqa?.name ?? "هذه الحلقة"}
        </p>
      ) : (
        <div className="space-y-3 mb-6">
          {fields.map((f, idx) => (
            <div key={f.id} className="rounded-xl border border-border p-4 bg-secondary/20">
              <div className="flex items-start justify-between gap-2 mb-3">
                <span className="text-xs text-muted-foreground">عمود {idx + 1}</span>
                <button
                  type="button"
                  onClick={() => removeField(f.id)}
                  className="text-destructive hover:bg-destructive/10 p-1.5 rounded-lg"
                  title="حذف"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">اسم العمود</label>
                  <input
                    value={f.label}
                    onChange={(e) => updateField(f.id, { label: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">الخيارات (افصل بفاصلة أو سطر)</label>
                  <input
                    value={formatOptionsForInput(f.options)}
                    onChange={(e) => updateField(f.id, { options: parseOptionsInput(e.target.value) })}
                    placeholder="ممتاز، جيد، ضعيف"
                    className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm"
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">
                المعاينة: {f.options.join(" · ") || "—"}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4" /> إضافة عمود جديد
        </h3>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">اسم العمود</label>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="مثال: السلوك"
              className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">الخيارات</label>
            <input
              value={newOptions}
              onChange={(e) => setNewOptions(e.target.value)}
              placeholder="ممتاز، جيد، يحتاج متابعة"
              className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={addField}
            className="px-4 py-2 rounded-lg gold-gradient text-primary-foreground font-bold text-sm flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> إضافة
          </button>
          <button
            type="button"
            onClick={saveAll}
            className="px-4 py-2 rounded-lg border border-border font-bold text-sm flex items-center gap-2 hover:bg-secondary"
          >
            <Save className="w-4 h-4" /> حفظ التعديلات
          </button>
        </div>
      </div>
    </section>
  );
}
