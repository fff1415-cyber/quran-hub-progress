import { useEffect, useState } from "react";
import {
  DEFAULT_STAFF_ATTENDANCE_SETTINGS,
  addMinutesToTime,
  formatTime12,
  getDailySchedule,
  loadStaffAttendanceSettings,
  saveStaffAttendanceSettings,
  type StaffAttendanceSettings,
  type DailySchedule,
} from "@/lib/staff-attendance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Clock, Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

export function ManagerStaffAttendanceSettingsPanel() {
  const [draft, setDraft] = useState<StaffAttendanceSettings>(() => loadStaffAttendanceSettings());
  const [saving, setSaving] = useState(false);
  const [schedule, setSchedule] = useState<DailySchedule | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(true);

  const refreshSchedule = async (settings = draft) => {
    setLoadingSchedule(true);
    try {
      const s = await getDailySchedule(undefined, settings);
      setSchedule(s);
    } finally {
      setLoadingSchedule(false);
    }
  };

  useEffect(() => {
    void refreshSchedule();
  }, []);

  const setField = <K extends keyof StaffAttendanceSettings>(key: K, value: StaffAttendanceSettings[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const onSave = async () => {
    setSaving(true);
    try {
      saveStaffAttendanceSettings(draft);
      await refreshSchedule(draft);
      toast.success("تم حفظ إعدادات حضور العاملين");
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
          <Clock className="w-5 h-5" /> إعدادات حضور العاملين
        </h2>
        <p className="text-xs text-muted-foreground">
          بداية الحلقة = العصر + الدقائق المحددة · التسجيل مفتوح دائماً · بعد مهلة التأخير يُسجّل «متأخر»
        </p>
      </div>

      <label className="flex items-center gap-3 rounded-xl border border-border p-4 cursor-pointer hover:bg-secondary/30">
        <Checkbox checked={draft.enabled} onCheckedChange={(c) => setField("enabled", c === true)} />
        <span className="font-medium">تفعيل حضور المعلمين والمساعدين</span>
      </label>

      <div className="grid sm:grid-cols-2 gap-4 rounded-xl border border-border p-4 bg-secondary/20">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">المدينة</label>
          <Input value={draft.city} onChange={(e) => setField("city", e.target.value)} placeholder="Buraydah" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">الدولة</label>
          <Input value={draft.country} onChange={(e) => setField("country", e.target.value)} placeholder="Saudi Arabia" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">دقائق بعد العصر (بداية الحلقة)</label>
          <Input type="number" min={0} max={180} value={draft.minutes_after_asr} onChange={(e) => setField("minutes_after_asr", Number(e.target.value) || 0)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">مهلة التأخير (دقائق)</label>
          <Input type="number" min={0} max={60} value={draft.late_grace_minutes} onChange={(e) => setField("late_grace_minutes", Number(e.target.value) || 0)} />
        </div>
      </div>

      {loadingSchedule ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> جاري حساب وقت اليوم…
        </p>
      ) : schedule ? (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm space-y-1">
          <p><span className="text-muted-foreground">اليوم:</span> <strong>{schedule.date}</strong></p>
          <p><span className="text-muted-foreground">العصر:</span> <strong>{formatTime12(schedule.asrTime)}</strong></p>
          <p><span className="text-muted-foreground">بداية الحلقة:</span> <strong className="text-primary">{formatTime12(schedule.scheduledStart)}</strong></p>
          <p className="text-xs text-muted-foreground">
            متأخر بعد {formatTime12(addMinutesToTime(schedule.scheduledStart, draft.late_grace_minutes))}
          </p>
        </div>
      ) : (
        <p className="text-sm text-destructive">تعذّر جلب وقت العصر — تحقق من المدينة والاتصال</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void onSave()} disabled={saving} className="gold-gradient text-primary-foreground gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          حفظ
        </Button>
        <Button type="button" variant="outline" onClick={() => void refreshSchedule(draft)} className="gap-2">
          <Clock className="w-4 h-4" /> معاينة وقت اليوم
        </Button>
        <Button type="button" variant="outline" onClick={() => setDraft({ ...DEFAULT_STAFF_ATTENDANCE_SETTINGS })} className="gap-2">
          <RotateCcw className="w-4 h-4" /> استعادة الافتراضي
        </Button>
      </div>
    </section>
  );
}
