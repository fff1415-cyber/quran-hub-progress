import { useEffect, useState } from "react";
import type { EvaluationSettings } from "@/lib/evaluation-types";
import { DEFAULT_EVALUATION_SETTINGS } from "@/lib/evaluation-types";
import { useEvaluationSettings } from "@/contexts/EvaluationSettingsContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ClipboardList, Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

type FieldKey = keyof EvaluationSettings;

const SECTIONS: { title: string; fields: { key: FieldKey; label: string; step?: number }[] }[] = [
  {
    title: "اختبار الحفظ",
    fields: [
      { key: "hifz_max_score", label: "الدرجة الكلية" },
      { key: "error_deduction", label: "خصم كل خطأ" },
      { key: "warning_deduction", label: "خصم كل تنبيه" },
      { key: "hifz_max_errors", label: "أقصى أخطاء (رسوب عند الوصول)" },
      { key: "hifz_max_warnings", label: "أقصى تنبيهات مسموحة" },
    ],
  },
  {
    title: "اختبار المراجعة",
    fields: [
      { key: "review_max_score", label: "الدرجة الكلية" },
      { key: "review_error_deduction", label: "خصم كل خطأ" },
      { key: "review_warning_deduction", label: "خصم كل تنبيه" },
      { key: "review_max_errors_per_segment", label: "أقصى أخطاء لكل مقطع (رسوب)" },
      { key: "review_max_warnings_per_segment", label: "أقصى تنبيهات لكل مقطع" },
    ],
  },
  {
    title: "عدد مقاطع المراجعة (حسب مقدار الحفظ)",
    fields: [
      { key: "review_segments_under_10", label: "أقل من 10 أجزاء" },
      { key: "review_segments_10_to_20", label: "من 10 إلى 20 جزء" },
      { key: "review_segments_over_20", label: "أكثر من 20 جزء" },
    ],
  },
  {
    title: "عام",
    fields: [
      { key: "pass_percent", label: "نسبة الاجتياز (%)" },
      { key: "max_minutes_per_face", label: "دقائق لكل وجه (الوقت = أوجه × هذا الرقم)", step: 0.5 },
    ],
  },
];

export function ManagerEvaluationSettingsPanel() {
  const { settings, loading, save } = useEvaluationSettings();
  const [draft, setDraft] = useState<EvaluationSettings>(settings);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const setField = (key: FieldKey, raw: string) => {
    const step = SECTIONS.flatMap((s) => s.fields).find((f) => f.key === key)?.step ?? 1;
    const val = step < 1 ? parseFloat(raw) : parseInt(raw, 10);
    setDraft((d) => ({ ...d, [key]: Number.isNaN(val) ? 0 : val }));
  };

  const onSave = async () => {
    try {
      await save(draft);
      toast.success("تم حفظ إعدادات لائحة التقييم");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الحفظ");
    }
  };

  const onReset = () => setDraft({ ...DEFAULT_EVALUATION_SETTINGS });

  if (loading) {
    return (
      <section className="glass-card rounded-2xl p-12 flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin ml-2" /> جاري تحميل الإعدادات...
      </section>
    );
  }

  return (
    <section className="glass-card rounded-2xl p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-primary mb-1 flex items-center gap-2">
          <ClipboardList className="w-5 h-5" /> إعدادات لائحة التقييم
        </h2>
        <p className="text-xs text-muted-foreground">
          تُطبَّق على تقييم السرد والمراجعة في صفحة المسمّع — لا أرقام ثابتة في الكود
        </p>
      </div>

      {SECTIONS.map((section) => (
        <div key={section.title} className="rounded-xl border border-border p-4 bg-secondary/20">
          <h3 className="font-bold text-sm mb-3 text-primary">{section.title}</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {section.fields.map(({ key, label, step }) => (
              <div key={key}>
                <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
                <Input
                  type="number"
                  min={0}
                  step={step ?? 1}
                  value={draft[key]}
                  onChange={(e) => setField(key, e.target.value)}
                  className="font-bold text-primary"
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-2 pt-2">
        <Button type="button" onClick={() => void onSave()} className="gold-gradient text-primary-foreground gap-2">
          <Save className="w-4 h-4" /> حفظ الإعدادات
        </Button>
        <Button type="button" variant="outline" onClick={onReset} className="gap-2">
          <RotateCcw className="w-4 h-4" /> استعادة الافتراضي
        </Button>
      </div>
    </section>
  );
}
