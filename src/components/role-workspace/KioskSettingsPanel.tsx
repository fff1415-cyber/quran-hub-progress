import { useEffect, useState } from "react";
import { Copy, ExternalLink, Loader2, QrCode, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { TenantLogo } from "@/components/TenantLogo";
import {
  buildKioskPageUrl,
  fetchKioskSettings,
  formatKioskClock,
  saveKioskSettings,
  type KioskSettingsResponse,
} from "@/lib/kiosk-service";

export function KioskSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<KioskSettingsResponse | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [openMinutes, setOpenMinutes] = useState(0);
  const [presentMinutes, setPresentMinutes] = useState(20);
  const [closeMinutes, setCloseMinutes] = useState(55);

  const load = async () => {
    setLoading(true);
    try {
      const next = await fetchKioskSettings();
      setData(next);
      setEnabled(next.settings.enabled);
      setOpenMinutes(next.settings.openMinutesAfterAsr);
      setPresentMinutes(next.settings.presentMinutesAfterAsr);
      setCloseMinutes(next.settings.closeMinutesAfterAsr);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل إعدادات الكيوسك");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const persist = async (input: {
    enabled?: boolean;
    regenerate?: boolean;
    openMinutesAfterAsr?: number;
    presentMinutesAfterAsr?: number;
    closeMinutesAfterAsr?: number;
  }) => {
    setBusy(true);
    try {
      const next = await saveKioskSettings({
        enabled: input.enabled ?? enabled,
        regenerate: input.regenerate,
        openMinutesAfterAsr: input.openMinutesAfterAsr ?? openMinutes,
        presentMinutesAfterAsr: input.presentMinutesAfterAsr ?? presentMinutes,
        closeMinutesAfterAsr: input.closeMinutesAfterAsr ?? closeMinutes,
      });
      setData(next);
      setEnabled(next.settings.enabled);
      setOpenMinutes(next.settings.openMinutesAfterAsr);
      setPresentMinutes(next.settings.presentMinutesAfterAsr);
      setCloseMinutes(next.settings.closeMinutesAfterAsr);
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
  const windowInfo = data?.scanWindow;

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
              تحكم بفتح التسجيل، نافذة الحضور، نافذة التأخر، ووقت الإغلاق — توقيت بريدة.
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

        <div className="grid sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-border p-4 space-y-2">
            <label className="text-sm font-medium block">فتح التسجيل بعد العصر (د)</label>
            <p className="text-xs text-muted-foreground">0 = عند العصر مباشرة</p>
            <input
              type="number"
              min={0}
              max={180}
              value={openMinutes}
              onChange={(e) => setOpenMinutes(Number(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-lg bg-input border border-border"
            />
          </div>
          <div className="rounded-xl border border-border p-4 space-y-2">
            <label className="text-sm font-medium block">نهاية الحضور / بداية التأخر (د)</label>
            <p className="text-xs text-muted-foreground">بعدها يُسجّل متأخر</p>
            <input
              type="number"
              min={0}
              max={180}
              value={presentMinutes}
              onChange={(e) => setPresentMinutes(Number(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-lg bg-input border border-border"
            />
          </div>
          <div className="rounded-xl border border-border p-4 space-y-2">
            <label className="text-sm font-medium block">إغلاق المسح بعد العصر (د)</label>
            <p className="text-xs text-muted-foreground">بعدها يُقفل الكيوسك</p>
            <input
              type="number"
              min={1}
              max={180}
              value={closeMinutes}
              onChange={(e) => setCloseMinutes(Number(e.target.value) || 55)}
              className="w-full px-3 py-2 rounded-lg bg-input border border-border"
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground rounded-lg bg-secondary/40 px-3 py-2">
          الترتيب: فتح ≤ حضور ≤ إغلاق. مثال: 0 / 20 / 55 → يفتح عند العصر، حاضر 20 د، متأخر حتى 55 د.
        </p>

        {windowInfo ? (
          <div className="text-xs text-muted-foreground rounded-lg bg-secondary/40 px-3 py-2 space-y-0.5">
            <p>
              اليوم — العصر {formatKioskClock(windowInfo.asrTime)} · فتح {formatKioskClock(windowInfo.openAt)} ·
              حضور حتى {formatKioskClock(windowInfo.presentUntilAt)} · إغلاق {formatKioskClock(windowInfo.closeAt)}
            </p>
            <p>
              {windowInfo.phase === "present"
                ? "مفتوح — نافذة حضور"
                : windowInfo.phase === "late"
                  ? "مفتوح — نافذة تأخر"
                  : windowInfo.phase === "before"
                    ? "لم يُفتح بعد"
                    : windowInfo.phase === "closed"
                      ? "مغلق"
                      : "—"}
            </p>
          </div>
        ) : null}

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
