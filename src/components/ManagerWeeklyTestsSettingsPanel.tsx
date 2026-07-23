import { useState } from "react";
import {
  DEFAULT_WEEKLY_TESTS_SETTINGS,
  loadWeeklyTestsSettings,
  saveWeeklyTestsSettings,
  type WeeklyTestsSettings,
} from "@/lib/weekly-tests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ClipboardCheck, Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

export function ManagerWeeklyTestsSettingsPanel() {
  const [draft, setDraft] = useState<WeeklyTestsSettings>(() => loadWeeklyTestsSettings());
  const [saving, setSaving] = useState(false);

  const setField = <K extends keyof WeeklyTestsSettings>(key: K, value: WeeklyTestsSettings[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const onSave = async () => {
    setSaving(true);
    try {
      saveWeeklyTestsSettings(draft);
      toast.success("تم حفظ إعدادات الاختبارات الأسبوعية");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="glass-card rounded-2xl p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-primary mb-1 flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5" /> الاختبارات الأسبوعية
        </h2>
        <p className="text-xs text-muted-foreground">
          3 مراجعة + 1 ربط كامل لكل طالب أسبوعياً — مسار مستقل عن النسبة الكلية
        </p>
      </div>

      <label className="flex items-center gap-3 rounded-xl border border-border p-4 cursor-pointer hover:bg-secondary/30">
        <Checkbox
          checked={draft.enabled}
          onCheckedChange={(c) => setField("enabled", c === true)}
        />
        <span className="font-medium">تفعيل الاختبارات الأسبوعية</span>
      </label>

      <div className="grid sm:grid-cols-2 gap-4 rounded-xl border border-border p-4 bg-secondary/20">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">نقاط المراجعة (ناجح)</label>
          <Input type="number" min={1} value={draft.muraja_pass_points} onChange={(e) => setField("muraja_pass_points", Number(e.target.value) || 0)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">نقاط المراجعة (راسب)</label>
          <Input type="number" min={0} value={draft.muraja_fail_points} onChange={(e) => setField("muraja_fail_points", Number(e.target.value) || 0)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">نقاط الربط (ناجح)</label>
          <Input type="number" min={1} value={draft.rabt_pass_points} onChange={(e) => setField("rabt_pass_points", Number(e.target.value) || 0)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">نقاط الربط (راسب)</label>
          <Input type="number" min={0} value={draft.rabt_fail_points} onChange={(e) => setField("rabt_fail_points", Number(e.target.value) || 0)} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void onSave()} disabled={saving} className="gold-gradient text-primary-foreground gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          حفظ
        </Button>
        <Button type="button" variant="outline" onClick={() => setDraft({ ...DEFAULT_WEEKLY_TESTS_SETTINGS })} className="gap-2">
          <RotateCcw className="w-4 h-4" /> استعادة الافتراضي
        </Button>
      </div>
    </section>
  );
}
