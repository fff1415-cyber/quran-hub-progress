import { useEffect, useState } from "react";
import {
  DEFAULT_COMPLEX_FEATURES,
  loadComplexFeatures,
  saveComplexFeatures,
  type ComplexFeatures,
} from "@/lib/complex-features";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

export function ManagerTeacherFeaturesPanel() {
  const [settings, setSettings] = useState<ComplexFeatures>(() => loadComplexFeatures());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSettings(loadComplexFeatures());
  }, []);

  const save = () => {
    setSaving(true);
    try {
      saveComplexFeatures(settings);
      toast.success("تم حفظ إعدادات المعلم");
    } catch {
      toast.error("تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => setSettings({ ...DEFAULT_COMPLEX_FEATURES });

  return (
    <div className="glass-card rounded-2xl p-6 space-y-5">
      <div>
        <h3 className="text-lg font-bold text-primary flex items-center gap-2">
          <Send className="w-5 h-5" /> صفحة المعلم
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          تحكم في عناصر واجهة المعلم — لا يؤثر على البيانات، فقط على العرض.
        </p>
      </div>

      <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border hover:bg-secondary/30 cursor-pointer">
        <div>
          <span className="text-sm font-medium block">إرسال المتعثرين للإدارة</span>
          <span className="text-xs text-muted-foreground">زر التحويل في جدول التحضير والدرجات</span>
        </div>
        <input
          type="checkbox"
          checked={settings.showTeacherTransferButton}
          onChange={() =>
            setSettings((prev) => ({
              ...prev,
              showTeacherTransferButton: !prev.showTeacherTransferButton,
            }))
          }
          className="w-5 h-5 accent-primary shrink-0"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-lg gold-gradient text-primary-foreground font-bold flex items-center gap-2 text-sm"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          حفظ
        </button>
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-secondary/50"
        >
          استعادة الافتراضي
        </button>
      </div>
    </div>
  );
}
