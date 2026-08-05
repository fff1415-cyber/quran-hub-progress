import { useEffect, useState } from "react";
import { Copy, ExternalLink, Loader2, QrCode, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { TenantLogo } from "@/components/TenantLogo";
import {
  buildKioskPageUrl,
  fetchKioskSettings,
  saveKioskSettings,
  type KioskSettingsResponse,
} from "@/lib/kiosk-service";

export function KioskSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<KioskSettingsResponse | null>(null);
  const [enabled, setEnabled] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const next = await fetchKioskSettings();
      setData(next);
      setEnabled(next.settings.enabled);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل إعدادات الكيوسك");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const persist = async (input: { enabled?: boolean; regenerate?: boolean }) => {
    setBusy(true);
    try {
      const next = await saveKioskSettings(input);
      setData(next);
      setEnabled(next.settings.enabled);
      toast.success(input.regenerate ? "تم تجديد الرابط" : "تم حفظ الإعدادات");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر الحفظ");
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    const url = data?.kioskUrl || (data?.settings.token ? buildKioskPageUrl(data.settings.token) : "");
    if (!url) {
      toast.error("فعّل الكيوسك أولاً لإنشاء الرابط");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("تم نسخ رابط الكيوسك");
    } catch {
      toast.error("تعذّر النسخ — انسخ الرابط يدوياً");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const kioskUrl = data?.kioskUrl || (data?.settings.token ? buildKioskPageUrl(data.settings.token) : "");

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-2xl p-6 space-y-5">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-xl overflow-hidden border border-primary/15 shrink-0">
            <TenantLogo
              logoUrl={data?.logoUrl ?? null}
              brandName={data?.brandName ?? "المجمع"}
              className="w-full h-full"
              imgClassName="w-full h-full object-contain p-1.5"
              placeholderClassName="w-full h-full"
            />
          </div>
          <div>
            <h3 className="font-bold text-primary flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              كيوسك التحضير الذاتي
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              رابط مستقل للتحضير عبر مسح بطاقات QR — يحمل شعار وهوية {data?.brandName ?? "المجمع"}.
            </p>
          </div>
        </div>

        <label className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
          <div>
            <p className="font-medium">تفعيل الكيوسك</p>
            <p className="text-xs text-muted-foreground">عند التعطيل لن يعمل الرابط حتى إعادة التفعيل</p>
          </div>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="w-5 h-5 accent-primary"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void persist({ enabled, regenerate: !data?.settings.token })}
            className="px-4 py-2 rounded-lg gold-gradient text-primary-foreground font-bold inline-flex items-center gap-2 disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            حفظ
          </button>
          <button
            type="button"
            disabled={busy || !data?.settings.token}
            onClick={() => void persist({ enabled, regenerate: true })}
            className="px-4 py-2 rounded-lg border border-border inline-flex items-center gap-2 disabled:opacity-60"
          >
            <RefreshCw className="w-4 h-4" />
            تجديد الرابط
          </button>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-6 space-y-3">
        <h4 className="font-bold text-primary">رابط الكيوسك</h4>
        <p className="text-xs text-muted-foreground">
          افتح هذا الرابط على جهاز ثابت (تابلت أو شاشة لمس) داخل المجمع.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            readOnly
            value={kioskUrl}
            className="flex-1 px-3 py-2 rounded-lg bg-input border border-border text-sm font-mono dir-ltr text-left"
          />
          <button
            type="button"
            onClick={() => void copyLink()}
            className="px-3 py-2 rounded-lg border border-border inline-flex items-center justify-center gap-2"
          >
            <Copy className="w-4 h-4" />
            نسخ
          </button>
          {kioskUrl ? (
            <a
              href={kioskUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 rounded-lg border border-border inline-flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              فتح
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
