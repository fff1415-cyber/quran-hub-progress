import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Palette, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { TenantLogo } from "@/components/TenantLogo";
import {
  brandingToTenant,
  deleteComplexLogo,
  fetchComplexBranding,
  saveComplexTheme,
  uploadComplexLogo,
} from "@/lib/branding-service";
import { BRAND_THEMES, type BrandThemeKey } from "@/lib/brand-themes";
import { applyTenantTheme } from "@/lib/tenant";
import { cn } from "@/lib/utils";
import { useTenant } from "@/contexts/TenantContext";

export function ManagerBrandingPanel() {
  const { brandName, setTenantState } = useTenant();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [themeKey, setThemeKey] = useState<BrandThemeKey>("navy");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState(brandName);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await fetchComplexBranding();
        setThemeKey(data.theme_key);
        setLogoUrl(data.logo_url);
        setPreviewName(data.name);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "تعذّر تحميل الهوية");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const applyBranding = (data: Awaited<ReturnType<typeof fetchComplexBranding>>) => {
    setThemeKey(data.theme_key);
    setLogoUrl(data.logo_url);
    setPreviewName(data.name);
    setTenantState(brandingToTenant(data));
  };

  const onPickFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    setBusy(true);
    try {
      const data = await uploadComplexLogo(file);
      applyBranding(data);
      toast.success("تم رفع الشعار");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر رفع الشعار");
    } finally {
      setBusy(false);
      if (fileRef.current) {
        fileRef.current.value = "";
      }
    }
  };

  const onRemoveLogo = async () => {
    setBusy(true);
    try {
      const data = await deleteComplexLogo();
      applyBranding(data);
      toast.success("تم حذف الشعار");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر حذف الشعار");
    } finally {
      setBusy(false);
    }
  };

  const onSaveTheme = async () => {
    setBusy(true);
    try {
      const data = await saveComplexTheme(themeKey);
      applyBranding(data);
      toast.success("تم حفظ ألوان الهوية");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر حفظ الألوان");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <section className="glass-card rounded-2xl p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        جاري تحميل الهوية...
      </section>
    );
  }

  const selectedTheme = BRAND_THEMES.find((t) => t.key === themeKey) ?? BRAND_THEMES[0];

  return (
    <section className="glass-card rounded-2xl p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-primary mb-1 flex items-center gap-2">
          <Palette className="w-5 h-5" />
          هوية المجمع
        </h2>
        <p className="text-xs text-muted-foreground">
          ارفع شعار مجمعك واختر ألوان الهوية — تظهر في صفحة الدخول ولوحة التحكم
        </p>
      </div>

      <div className="rounded-2xl border border-border p-6 bg-secondary/20 text-center">
        <p className="text-xs text-muted-foreground mb-4">معاينة صفحة الدخول</p>
        <div className="inline-flex flex-col items-center gap-3">
          <TenantLogo
            logoUrl={logoUrl}
            brandName={previewName}
            placeholderClassName="w-24 h-24"
            imgClassName="w-24 h-24 object-contain"
          />
          <div className="display text-xl font-bold gold-text">{previewName}</div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold mb-3">شعار المجمع</h3>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => void onPickFile(e.target.files?.[0])}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="px-4 py-2 rounded-lg gold-gradient text-primary-foreground font-bold flex items-center gap-2 disabled:opacity-60"
          >
            <ImagePlus className="w-4 h-4" />
            {logoUrl ? "تغيير الشعار" : "رفع الشعار"}
          </button>
          {logoUrl && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onRemoveLogo()}
              className="px-4 py-2 rounded-lg border border-destructive/40 text-destructive font-bold flex items-center gap-2 disabled:opacity-60"
            >
              <Trash2 className="w-4 h-4" />
              حذف الشعار
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-2">PNG أو JPG أو WebP — 2MB كحد أقصى. يُفضّل خلفية شفافة.</p>
      </div>

      <div>
        <h3 className="text-sm font-bold mb-3">ألوان الهوية</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {BRAND_THEMES.map((theme) => (
            <button
              key={theme.key}
              type="button"
              disabled={busy}
              onClick={() => {
                setThemeKey(theme.key);
                applyTenantTheme({ primary_color: theme.primary, theme_key: theme.key });
              }}
              className={cn(
                "rounded-xl border p-3 text-right transition-all",
                themeKey === theme.key
                  ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                  : "border-border hover:border-primary/40",
              )}
            >
              <div
                className="h-10 rounded-lg mb-2"
                style={{
                  background: theme.gradient
                    ? `linear-gradient(135deg, ${theme.primary}, ${theme.secondary ?? theme.primary})`
                    : theme.primary,
                }}
              />
              <div className="text-sm font-bold">{theme.label}</div>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          المختار: {selectedTheme.label}
        </p>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => void onSaveTheme()}
        className="px-5 py-2.5 rounded-lg gold-gradient text-primary-foreground font-bold flex items-center gap-2 disabled:opacity-60"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        حفظ الألوان
      </button>
    </section>
  );
}
