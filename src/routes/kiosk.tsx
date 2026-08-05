import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { TenantLogo } from "@/components/TenantLogo";
import { KioskScanner } from "@/components/kiosk/KioskScanner";
import { fetchKioskSession, type KioskSession } from "@/lib/kiosk-service";
import { applyTenantTheme } from "@/lib/tenant";
import type { BrandThemeKey } from "@/lib/brand-themes";

export const Route = createFileRoute("/kiosk")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: KioskPage,
});

function KioskPage() {
  const { token } = Route.useSearch();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [branding, setBranding] = useState<KioskSession | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("رابط الكيوسك غير صالح — يفتقد رمز الجلسة");
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const session = await fetchKioskSession(token);
        if (cancelled) {
          return;
        }
        setBranding(session);
        applyTenantTheme({
          primary_color: session.primaryColor,
          theme_key: session.themeKey as BrandThemeKey,
        });
        if (typeof document !== "undefined") {
          document.title = `تحضير — ${session.brandName}`;
        }
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "تعذّر تحميل جلسة الكيوسك");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !token || !branding) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="glass-card max-w-md w-full rounded-2xl p-8 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
          <h1 className="text-xl font-bold text-primary">تعذّر فتح الكيوسك</h1>
          <p className="text-muted-foreground">{error ?? "رابط غير صالح"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 flex flex-col">
      <header className="px-6 pt-8 pb-4 text-center space-y-4">
        <div className="mx-auto w-24 h-24 rounded-2xl overflow-hidden gold-glow bg-card border border-primary/15 flex items-center justify-center">
          <TenantLogo
            logoUrl={branding.logoUrl}
            brandName={branding.brandName}
            className="w-full h-full"
            imgClassName="w-full h-full object-contain p-2"
            placeholderClassName="w-full h-full rounded-2xl"
          />
        </div>
        <div>
          <p className="text-sm text-muted-foreground mb-1">نظام التحضير الذاتي</p>
          <h1 className="text-2xl md:text-3xl font-bold gold-text">{branding.brandName}</h1>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 pb-10">
        <KioskScanner
          token={token}
          sessionReady={sessionReady}
          onActivateSession={async () => setSessionReady(true)}
        />
      </main>

      <footer className="pb-6 text-center text-xs text-muted-foreground">
        msht.io — منصة إدارة مجمعات تحفيظ القرآن
      </footer>
    </div>
  );
}
