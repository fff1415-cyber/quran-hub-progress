import { useEffect, useState } from "react";
import {
  DEFAULT_STUDENT_PORTAL_VISIBILITY,
  loadStudentPortalVisibility,
  saveStudentPortalVisibility,
  STUDENT_PORTAL_SECTION_LABELS,
  type StudentPortalVisibility,
} from "@/lib/student-portal-settings";
import { GraduationCap, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function ManagerStudentPortalPanel() {
  const [settings, setSettings] = useState<StudentPortalVisibility>(() => loadStudentPortalVisibility());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSettings(loadStudentPortalVisibility());
  }, []);

  const toggle = (key: keyof StudentPortalVisibility) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const save = () => {
    setSaving(true);
    try {
      saveStudentPortalVisibility(settings);
      toast.success("تم حفظ إعدادات صفحة ولي الأمر");
    } catch {
      toast.error("تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setSettings({ ...DEFAULT_STUDENT_PORTAL_VISIBILITY });
  };

  const keys = Object.keys(DEFAULT_STUDENT_PORTAL_VISIBILITY) as (keyof StudentPortalVisibility)[];

  return (
    <div className="glass-card rounded-2xl p-6 space-y-5">
      <div>
        <h3 className="text-lg font-bold text-primary flex items-center gap-2">
          <GraduationCap className="w-5 h-5" /> لوحة أداء المجمع
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          تحكم في إظهار أو إخفاء أقسام الصفحة — لا يؤثر على البيانات، فقط على العرض.
        </p>
      </div>

      <div className="space-y-2">
        {keys.map((key) => (
          <label
            key={key}
            className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border hover:bg-secondary/30 cursor-pointer"
          >
            <span className="text-sm">{STUDENT_PORTAL_SECTION_LABELS[key]}</span>
            <input
              type="checkbox"
              checked={settings[key]}
              onChange={() => toggle(key)}
              className="w-5 h-5 accent-primary"
            />
          </label>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-5 py-2.5 rounded-xl gold-gradient text-primary-foreground font-bold text-sm disabled:opacity-60 inline-flex items-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          حفظ الإعدادات
        </button>
        <button
          type="button"
          onClick={reset}
          className="px-5 py-2.5 rounded-xl border border-border text-sm font-bold hover:bg-secondary/50"
        >
          إظهار الكل (افتراضي)
        </button>
      </div>
    </div>
  );
}
