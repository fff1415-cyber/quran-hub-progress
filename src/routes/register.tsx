import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast, Toaster } from "sonner";
import {
  PLATFORM_BRAND,
  apexDomain,
  registerNewComplex,
  tenantOrigin,
} from "@/lib/tenant";
import { useTenant } from "@/contexts/TenantContext";

export const Route = createFileRoute("/register")({
  component: RegisterComplexPage,
});

function RegisterComplexPage() {
  const { isPlatform, loading } = useTenant();
  const [name, setName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  if (!isPlatform) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-card rounded-2xl p-8 max-w-md text-center">
          <p className="text-muted-foreground mb-4">تسجيل مجمع جديد متاح من المنصة الرئيسية فقط.</p>
          <a href={`https://${apexDomain()}/register`} className="text-primary font-bold underline">
            الذهاب إلى {apexDomain()}
          </a>
        </div>
      </div>
    );
  }

  const submit = async () => {
    const n = name.trim();
    const sub = subdomain.trim().toLowerCase();
    if (!n) {
      toast.error("اسم المجمع مطلوب");
      return;
    }
    if (!sub) {
      toast.error("الرابط الفرعي مطلوب (مثل: my-mosque)");
      return;
    }
    setBusy(true);
    try {
      const result = await registerNewComplex({
        name: n,
        subdomain: sub,
        contact_name: contactName.trim() || undefined,
        contact_phone: contactPhone.trim() || undefined,
      });
      toast.success(`تم تسجيل «${result.name}» بنجاح`);
      window.location.href = result.url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر التسجيل");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Toaster position="top-center" richColors />
      <div className="glass-card rounded-3xl p-8 md:p-10 w-full max-w-lg gold-glow">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-6">
          <ArrowRight className="w-4 h-4" />
          العودة للرئيسية
        </Link>

        <h1 className="display text-2xl font-bold gold-text mb-1">تسجيل مجمع جديد</h1>
        <p className="text-muted-foreground text-sm mb-6">{PLATFORM_BRAND.tagline}</p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-1">اسم المجمع *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مجمع …"
              className="w-full px-4 py-3 rounded-xl bg-input border border-border focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-1">الرابط الفرعي *</label>
            <div className="flex items-center gap-1 rounded-xl border border-border bg-input overflow-hidden" dir="ltr">
              <input
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value.replace(/[^a-z0-9-]/gi, "").toLowerCase())}
                placeholder="my-complex"
                className="flex-1 px-4 py-3 bg-transparent focus:outline-none text-left"
              />
              <span className="px-3 py-3 text-muted-foreground text-sm border-r border-border shrink-0">
                .{apexDomain()}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              سيكون رابط مجمعك: {subdomain ? tenantOrigin(subdomain) : `… .${apexDomain()}`}
            </p>
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-1">اسم المسؤول (اختياري)</label>
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-input border border-border focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-1">جوال التواصل (اختياري)</label>
            <input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              inputMode="tel"
              className="w-full px-4 py-3 rounded-xl bg-input border border-border focus:border-primary focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="w-full py-4 rounded-xl gold-gradient text-primary-foreground font-bold disabled:opacity-60"
          >
            {busy ? "جاري التسجيل..." : "إنشاء المجمع والمتابعة"}
          </button>
        </div>
      </div>
    </div>
  );
}
