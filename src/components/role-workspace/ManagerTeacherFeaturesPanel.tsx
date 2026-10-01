import { useEffect, useState } from "react";
import { loadHalaqat } from "@/lib/mock-data";
import {
  DEFAULT_COMPLEX_FEATURES,
  COMPLEX_FEATURES_APP_STATE_KEY,
  TEACHER_TABS,
  visibleTeacherTabs,
  loadComplexFeatures,
  saveComplexFeatures,
  type ComplexFeatures,
} from "@/lib/complex-features";
import { Loader2, Send } from "lucide-react";
import { pushAppState } from "@/lib/cloud-sync";
import { toast } from "sonner";

export function ManagerTeacherFeaturesPanel() {
  const halaqat = loadHalaqat();
  const [settings, setSettings] = useState<ComplexFeatures>(() => loadComplexFeatures());
  const [selectedHalaqaId, setSelectedHalaqaId] = useState<number>(() => loadHalaqat()[0]?.id ?? 0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSettings(loadComplexFeatures());
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await pushAppState(COMPLEX_FEATURES_APP_STATE_KEY, settings);
      saveComplexFeatures(settings, { sync: false });
      toast.success("تم حفظ إعدادات المعلم");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => setSettings({ ...DEFAULT_COMPLEX_FEATURES });
  const selectedTabs = visibleTeacherTabs(settings, selectedHalaqaId);
  const tabLabels = { grades: "التحضير", programs: "البرامج", tarbawi: "التربوي", tests: "الاختبارات" };

  const toggleTab = (tab: (typeof TEACHER_TABS)[number]) => {
    const next = selectedTabs.includes(tab) ? selectedTabs.filter((item) => item !== tab) : TEACHER_TABS.filter((item) => item === tab || selectedTabs.includes(item));
    if (next.length === 0) { toast.error("يجب إبقاء تبويب واحد على الأقل"); return; }
    setSettings((current) => ({ ...current, teacherTabsByHalaqa: { ...current.teacherTabsByHalaqa, [selectedHalaqaId]: next } }));
  };

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

      <div className="rounded-xl border border-border p-4 space-y-3">
        <h4 className="font-bold text-sm">التبويبات الظاهرة لمعلم الحلقة</h4>
        <select value={selectedHalaqaId} onChange={(e) => setSelectedHalaqaId(Number(e.target.value))} className="w-full max-w-sm p-2 rounded-lg bg-input border border-border" aria-label="اختر الحلقة">
          {halaqat.map((halaqa) => <option key={halaqa.id} value={halaqa.id}>{halaqa.name}</option>)}
        </select>
        <div className="grid sm:grid-cols-2 gap-2">
          {TEACHER_TABS.map((tab) => (
            <label key={tab} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30 cursor-pointer">
              <input type="checkbox" checked={selectedTabs.includes(tab)} onChange={() => toggleTab(tab)} className="accent-primary" />
              {tabLabels[tab]}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">الإعداد يخص معلم ومساعد الحلقة المحددة. احفظ بعد التعديل.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void save()}
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
