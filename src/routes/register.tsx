import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Copy, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { toast, Toaster } from "sonner";
import {
  apexDomain,
  fetchNextSubdomain,
  registerNewComplex,
  tenantOrigin,
  type TenantResolveResult,
} from "@/lib/tenant";
import { useTenant } from "@/contexts/TenantContext";
import { PlatformBrandHeader } from "@/components/platform/PlatformBrandHeader";

export const Route = createFileRoute("/register")({
  component: RegisterComplexPage,
});

function RegisterComplexPage() {
  const { isPlatform, loading } = useTenant();
  const [name, setName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [subdomainLoading, setSubdomainLoading] = useState(true);
  const [managerName, setManagerName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [managerCode, setManagerCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<TenantResolveResult | null>(null);

  const copyComplexLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("تم نسخ الرابط");
    } catch {
      toast.error("تعذّر النسخ — انسخ الرابط يدوياً");
    }
  };

  const loadNextSubdomain = async () => {
    setSubdomainLoading(true);
    try {
      const next = await fetchNextSubdomain();
      setSubdomain(next.subdomain);
    } catch {
      setSubdomain("m1");
    } finally {
      setSubdomainLoading(false);
    }
  };

  useEffect(() => {
    if (isPlatform) {
      void loadNextSubdomain();
    }
  }, [isPlatform]);

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
    const mgr = managerName.trim();
    const phone = contactPhone.trim();
    const code = managerCode.trim();

    if (!n) {
      toast.error("اسم المجمع مطلوب");
      return;
    }
    if (!sub) {
      toast.error("عضوية المجمع مطلوبة");
      return;
    }
    if (!mgr) {
      toast.error("اسم مدير المجمع / المشرف العام مطلوب");
      return;
    }
    if (!phone) {
      toast.error("جوال التواصل مطلوب");
      return;
    }
    if (!code) {
      toast.error("رقم عضوية المدير مطلوب للدخول");
      return;
    }
    if (code.length < 3) {
      toast.error("رقم العضوية: 3 أحرف على الأقل");
      return;
    }

    setBusy(true);
    try {
      const result = await registerNewComplex({
        name: n,
        subdomain: sub,
        manager_name: mgr,
        contact_phone: phone,
        manager_code: code,
      });
      setCreated(result);
      toast.success(`تم تسجيل «${result.name}» بنجاح`);
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

        <PlatformBrandHeader compact />

        {created ? (
          <div className="text-center space-y-5">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success/15 text-success mx-auto">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <div>
              <h2 className="display text-xl font-bold mb-1">تم إنشاء المجمع</h2>
              <p className="text-muted-foreground text-sm">{created.name}</p>
            </div>

            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-right">
              <p className="text-sm font-bold text-primary mb-2">انسخ رابط مجمعك الخاص</p>
              <div className="flex items-center gap-2" dir="ltr">
                <input
                  readOnly
                  value={created.url}
                  className="flex-1 min-w-0 px-3 py-2.5 rounded-lg bg-input border border-border text-sm font-mono"
                  onFocus={(e) => e.target.select()}
                />
                <button
                  type="button"
                  onClick={() => void copyComplexLink(created.url)}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-primary/40 bg-card text-primary font-bold text-sm hover:bg-primary/10"
                  title="نسخ الرابط"
                >
                  <Copy className="w-4 h-4" />
                  نسخ
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                احفظ هذا الرابط — بوابة دخول مجمعك · عضوية المدير: {managerCode}
              </p>
            </div>

            <a
              href={created.url}
              className="w-full inline-flex items-center justify-center gap-2 py-4 rounded-xl gold-gradient text-primary-foreground font-bold"
            >
              <ExternalLink className="w-4 h-4" />
              الذهاب إلى بوابة المجمع
            </a>
          </div>
        ) : (
          <>
        <h2 className="display text-xl font-bold text-center mb-6">تسجيل مجمع جديد</h2>

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
            <label className="block text-sm text-muted-foreground mb-1">عضوية المجمع *</label>
            <div className="flex items-center gap-1 rounded-xl border border-border bg-input overflow-hidden" dir="ltr">
              <input
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value.replace(/[^a-z0-9-]/gi, "").toLowerCase())}
                placeholder={subdomainLoading ? "…" : "m4"}
                disabled={subdomainLoading}
                className="flex-1 px-4 py-3 bg-transparent focus:outline-none text-left disabled:opacity-60"
              />
              <span className="px-3 py-3 text-muted-foreground text-sm border-r border-border shrink-0">
                .{apexDomain()}
              </span>
              <button
                type="button"
                onClick={() => void loadNextSubdomain()}
                disabled={subdomainLoading || busy}
                className="px-3 py-3 text-primary hover:bg-primary/5 disabled:opacity-50"
                title="تحديث العضوية التلقائية"
              >
                <RefreshCw className={`w-4 h-4 ${subdomainLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {subdomainLoading
                ? "جاري تخصيص عضوية المجمع..."
                : `يُخصّص تلقائياً — مثال: ${subdomain} — الرابط: ${tenantOrigin(subdomain)}`}
            </p>
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1">اسم مدير المجمع / المشرف العام *</label>
            <input
              value={managerName}
              onChange={(e) => setManagerName(e.target.value)}
              placeholder="الاسم الكامل"
              className="w-full px-4 py-3 rounded-xl bg-input border border-border focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1">جوال التواصل *</label>
            <input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value.replace(/[^\d+]/g, ""))}
              inputMode="tel"
              placeholder="05xxxxxxxx"
              className="w-full px-4 py-3 rounded-xl bg-input border border-border focus:border-primary focus:outline-none"
              dir="ltr"
            />
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1">رقم عضوية المدير (للدخول) *</label>
            <input
              value={managerCode}
              onChange={(e) => setManagerCode(e.target.value.trim())}
              placeholder="مثال: 1234"
              className="w-full px-4 py-3 rounded-xl bg-input border border-border focus:border-primary focus:outline-none"
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground mt-1">
              سيستخدم المدير هذا الرقم لتسجيل الدخول في بوابة المجمع
            </p>
          </div>

          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || subdomainLoading}
            className="w-full py-4 rounded-xl gold-gradient text-primary-foreground font-bold disabled:opacity-60"
          >
            {busy ? "جاري التسجيل..." : "إنشاء المجمع والمتابعة"}
          </button>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
