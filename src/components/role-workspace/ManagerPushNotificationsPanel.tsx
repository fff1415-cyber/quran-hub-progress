import { useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_PUSH_NOTIFICATION_SETTINGS,
  loadPushNotificationSettings,
  PUSH_SETTING_LABELS,
  savePushNotificationSettings,
  type PushNotificationSettings,
} from "@/lib/push-notification-settings";

export function ManagerPushNotificationsPanel() {
  const [settings, setSettings] = useState<PushNotificationSettings>(() => loadPushNotificationSettings());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSettings(loadPushNotificationSettings());
  }, []);

  const save = () => {
    setSaving(true);
    try {
      savePushNotificationSettings(settings);
      toast.success("تم حفظ إعدادات الإشعارات");
    } catch {
      toast.error("تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => setSettings({ ...DEFAULT_PUSH_NOTIFICATION_SETTINGS });

  const toggle = (field: keyof PushNotificationSettings) => {
    setSettings((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  return (
    <div className="glass-card rounded-2xl p-6 space-y-5">
      <div>
        <h3 className="text-lg font-bold text-primary flex items-center gap-2">
          <Bell className="w-5 h-5" /> إشعارات الجوال
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          تحكم كامل في الإشعارات التي تصل للجوال خارج الموقع. الإشعارات داخل لوحة المدير تبقى كما هي.
        </p>
      </div>

      <label className="flex items-center justify-between gap-3 p-4 rounded-xl border-2 border-primary/25 bg-primary/5 cursor-pointer">
        <div>
          <span className="text-sm font-bold block">تفعيل إشعارات الجوال</span>
          <span className="text-xs text-muted-foreground">إيقاف هذا الخيار يوقف جميع الإشعارات للجوال</span>
        </div>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={() => toggle("enabled")}
          className="w-5 h-5 accent-primary shrink-0"
        />
      </label>

      <div className={`space-y-2 ${settings.enabled ? "" : "opacity-50 pointer-events-none"}`}>
        {PUSH_SETTING_LABELS.map(({ field, label, description }) => (
          <label
            key={field}
            className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border hover:bg-secondary/30 cursor-pointer"
          >
            <div>
              <span className="text-sm font-medium block">{label}</span>
              <span className="text-xs text-muted-foreground">{description}</span>
            </div>
            <input
              type="checkbox"
              checked={settings[field] as boolean}
              onChange={() => toggle(field)}
              className="w-5 h-5 accent-primary shrink-0"
            />
          </label>
        ))}
      </div>

      <p className="text-xs text-muted-foreground border border-border/50 rounded-lg p-3 bg-muted/20">
        يحتاج كل مستلم الموافقة على الإشعارات من جواله مرة واحدة. على iOS: أضف الموقع للشاشة الرئيسية أولاً.
        تأكد من إعداد مفاتيح VAPID في <code className="text-[10px]">api/config.php</code> على Hostinger.
      </p>

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
