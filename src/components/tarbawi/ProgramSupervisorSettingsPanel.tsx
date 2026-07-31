import { useState } from "react";
import type { Halaqa } from "@/lib/mock-data";
import type { AcademicCalendar } from "@/lib/academic-context";
import {
  defaultTarbawiSettings,
  getTarbawiSettings,
  PLAN_SPAN_OPTIONS,
  saveTarbawiSettings,
  type TarbawiParagraphType,
  type TarbawiPlanSpan,
  type TarbawiSettings,
} from "@/lib/tarbawi-program";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function ProgramSupervisorSettingsPanel({
  calendar,
  halaqat,
}: {
  calendar: AcademicCalendar;
  halaqat: Halaqa[];
}) {
  const semesterId = calendar.semester?.id ?? "default";
  const [settings, setSettings] = useState<TarbawiSettings>(() => getTarbawiSettings(semesterId));

  const save = () => {
    saveTarbawiSettings({ ...settings, semesterId });
    toast.success("تم حفظ إعدادات البرنامج التربوي");
  };

  const setSpan = (halaqaId: number, span: TarbawiPlanSpan) => {
    setSettings((s) => ({
      ...s,
      halaqaSpans: { ...s.halaqaSpans, [halaqaId]: span },
    }));
  };

  const updateType = (idx: number, patch: Partial<TarbawiParagraphType>) => {
    setSettings((s) => {
      const types = [...s.paragraphTypes];
      types[idx] = { ...types[idx], ...patch };
      return { ...s, paragraphTypes: types };
    });
  };

  const addType = () => {
    setSettings((s) => ({
      ...s,
      paragraphTypes: [...s.paragraphTypes, { id: `custom-${Date.now()}`, label: "فقرة جديدة" }],
    }));
  };

  const removeType = (id: string) => {
    setSettings((s) => ({
      ...s,
      paragraphTypes: s.paragraphTypes.filter((t) => t.id !== id),
    }));
  };

  const resetTypes = () => {
    setSettings((s) => ({ ...s, paragraphTypes: defaultTarbawiSettings(semesterId).paragraphTypes }));
  };

  return (
    <div className="space-y-6">
      <section className="glass-card rounded-2xl p-6 space-y-4">
        <h3 className="font-bold text-primary">الفقرات الإلزامية أسبوعياً</h3>
        <div className="flex items-center gap-3 max-w-xs">
          <label className="text-sm text-muted-foreground">عدد الفقرات / أسبوع</label>
          <Input
            type="number"
            min={1}
            max={10}
            value={settings.weeklyRequiredCount}
            onChange={(e) => setSettings((s) => ({
              ...s,
              weeklyRequiredCount: Number(e.target.value) || 1,
            }))}
            className="w-20"
          />
        </div>
      </section>

      <section className="glass-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-bold text-primary">أنواع الفقرات</h3>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={resetTypes}>استعادة الافتراضي</Button>
            <Button type="button" size="sm" onClick={addType} className="gap-1"><Plus className="w-4 h-4" /> نوع</Button>
          </div>
        </div>
        <div className="space-y-2">
          {settings.paragraphTypes.map((t, i) => (
            <div key={t.id} className="flex gap-2 items-center">
              <Input
                value={t.label}
                onChange={(e) => updateType(i, { label: e.target.value })}
                className="flex-1"
              />
              <button type="button" onClick={() => removeType(t.id)} className="p-2 text-destructive hover:bg-destructive/10 rounded-lg">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="glass-card rounded-2xl p-6 space-y-4">
        <h3 className="font-bold text-primary">مدة خطة كل حلقة</h3>
        <p className="text-xs text-muted-foreground">كم أسبوعاً يخطّط المعلّم وينفّذ فيها البرنامج التربوي</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-muted-foreground border-b border-border">
                <th className="p-2">الحلقة</th>
                <th className="p-2">مدة الخطة</th>
              </tr>
            </thead>
            <tbody>
              {halaqat.map((h) => (
                <tr key={h.id} className="border-b border-border/40">
                  <td className="p-2">{h.name}</td>
                  <td className="p-2">
                    <select
                      className="rounded-md border border-border bg-input px-2 py-1.5 text-sm min-w-[160px]"
                      value={String(settings.halaqaSpans[h.id] ?? "full")}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSpan(h.id, v === "full" ? "full" : Number(v) as TarbawiPlanSpan);
                      }}
                    >
                      {PLAN_SPAN_OPTIONS.map((o) => (
                        <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Button onClick={save} className="gold-gradient text-primary-foreground font-bold">حفظ الإعدادات</Button>
    </div>
  );
}
