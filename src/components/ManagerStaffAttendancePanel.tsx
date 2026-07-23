import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_STAFF_ATTENDANCE_SETTINGS,
  addMinutesToTime,
  formatTime12,
  getDailySchedule,
  loadStaffAttendanceSettings,
  saveStaffAttendanceSettings,
  todayCheckIns,
  STAFF_STATUS_LABEL,
  type StaffAttendanceSettings,
  type DailySchedule,
} from "@/lib/staff-attendance";
import { loadHalaqat } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Clock, Loader2, RotateCcw, Save, UserCheck } from "lucide-react";
import { toast } from "sonner";

export function ManagerStaffAttendancePanel() {
  const [draft, setDraft] = useState<StaffAttendanceSettings>(() => loadStaffAttendanceSettings());
  const [saving, setSaving] = useState(false);
  const [schedule, setSchedule] = useState<DailySchedule | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const [checkIns, setCheckIns] = useState(() => todayCheckIns());

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

  const onPreview = () => void refreshSchedule(draft);

  const halaqat = useMemo(() => loadHalaqat(), [checkIns]);

  const expectedStaff = useMemo(() => {
    const rows: { role: string; name: string; halaqaId: number; halaqaName: string }[] = [];
    halaqat.forEach((h) => {
      if (h.teacherName?.trim()) {
        rows.push({ role: "teacher", name: h.teacherName.trim(), halaqaId: h.id, halaqaName: h.name });
      }
      if (h.assistantName?.trim()) {
        rows.push({ role: "assistant", name: h.assistantName.trim(), halaqaId: h.id, halaqaName: h.name });
      }
    });
    return rows;
  }, [halaqat]);

  const checkedKeys = useMemo(
    () => new Set(checkIns.map((c) => `${c.role}:${c.halaqaId}:${c.name}`)),
    [checkIns],
  );

  const absentCount = expectedStaff.filter(
    (s) => !checkedKeys.has(`${s.role}:${s.halaqaId}:${s.name}`),
  ).length;

  return (
    <div className="space-y-6">
      <section className="glass-card rounded-2xl p-6 space-y-6">
        <div>
          <h2 className="text-lg font-bold text-primary mb-1 flex items-center gap-2">
            <Clock className="w-5 h-5" /> وقت حضور العاملين
          </h2>
          <p className="text-xs text-muted-foreground">
            بداية الحلقة = العصر + الدقائق المحددة · التسجيل مفتوح دائماً · بعد مهلة التأخير يُسجّل «متأخر»
          </p>
        </div>

        <label className="flex items-center gap-3 rounded-xl border border-border p-4 cursor-pointer hover:bg-secondary/30">
          <Checkbox
            checked={draft.enabled}
            onCheckedChange={(c) => setField("enabled", c === true)}
          />
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
            <Input
              type="number"
              min={0}
              max={180}
              value={draft.minutes_after_asr}
              onChange={(e) => setField("minutes_after_asr", Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">مهلة التأخير (دقائق)</label>
            <Input
              type="number"
              min={0}
              max={60}
              value={draft.late_grace_minutes}
              onChange={(e) => setField("late_grace_minutes", Number(e.target.value) || 0)}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              خلال هذه الدقائق بعد البداية = حاضر · بعدها = متأخر · لا يُقفل التسجيل
            </p>
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
          <Button type="button" variant="outline" onClick={onPreview} className="gap-2">
            <Clock className="w-4 h-4" /> معاينة وقت اليوم
          </Button>
          <Button type="button" variant="outline" onClick={() => setDraft({ ...DEFAULT_STAFF_ATTENDANCE_SETTINGS })} className="gap-2">
            <RotateCcw className="w-4 h-4" /> استعادة الافتراضي
          </Button>
        </div>
      </section>

      <section className="glass-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-bold text-primary flex items-center gap-2">
            <UserCheck className="w-5 h-5" /> حضور اليوم
          </h3>
          <div className="flex gap-2 text-xs">
            <Badge variant="default">{checkIns.length} مسجّل</Badge>
            {absentCount > 0 && <Badge variant="destructive">{absentCount} لم يسجّل</Badge>}
            <Button type="button" variant="ghost" size="sm" onClick={() => setCheckIns(todayCheckIns())}>
              تحديث
            </Button>
          </div>
        </div>

        {checkIns.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">لا تسجيلات اليوم بعد</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="p-2 text-right">الاسم</th>
                  <th className="p-2 text-right">الدور</th>
                  <th className="p-2 text-right">الحلقة</th>
                  <th className="p-2 text-center">الحالة</th>
                  <th className="p-2 text-center">وقت التسجيل</th>
                  <th className="p-2 text-center">بداية الحلقة</th>
                </tr>
              </thead>
              <tbody>
                {checkIns.map((c) => (
                  <tr key={c.id} className="border-b border-border/50">
                    <td className="p-2 font-medium">{c.name}</td>
                    <td className="p-2">{c.role === "assistant" ? "مساعد" : "معلم"}</td>
                    <td className="p-2">{c.halaqaName}</td>
                    <td className="p-2 text-center">
                      <Badge variant={c.status === "late" ? "destructive" : "default"}>
                        {STAFF_STATUS_LABEL[c.status]}
                      </Badge>
                    </td>
                    <td className="p-2 text-center font-mono text-xs" dir="ltr">
                      {new Date(c.checkedInAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="p-2 text-center">{formatTime12(c.scheduledStart)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {absentCount > 0 && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
            <p className="text-xs font-bold text-warning mb-2">لم يسجّلوا بعد ({absentCount})</p>
            <ul className="text-xs space-y-1 text-muted-foreground">
              {expectedStaff
                .filter((s) => !checkedKeys.has(`${s.role}:${s.halaqaId}:${s.name}`))
                .map((s) => (
                  <li key={`${s.role}-${s.halaqaId}-${s.name}`}>
                    {s.name} — {s.role === "assistant" ? "مساعد" : "معلم"} · {s.halaqaName}
                  </li>
                ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
