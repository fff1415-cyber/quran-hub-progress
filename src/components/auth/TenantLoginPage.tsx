import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loginByCode, loginByNationalId } from "@/lib/secure-data.functions";
import { setToken, syncFromCloud } from "@/lib/cloud-sync";
import { setPortalMode } from "@/lib/student-portal-auth";
import { clearAuthSession, getToken, isTokenExpired, removeAuthItem, setAuthItem } from "@/lib/auth-session";
import { navigateBySessionRole } from "@/lib/auth-redirect";
import { initPushAfterLogin } from "@/lib/push-notifications";
import { getSessionRole } from "@/lib/session-role";
import { Loader2 } from "lucide-react";
import { toast, Toaster } from "sonner";
import { useTenant } from "@/contexts/TenantContext";
import { apexDomain, tenantPath } from "@/lib/tenant";
import { TenantLogo } from "@/components/TenantLogo";

export function TenantLoginPage() {
  const navigate = useNavigate();
  const { tenant, logoUrl, brandName, loading: tenantLoading, error: tenantError } = useTenant();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [autoChecking, setAutoChecking] = useState(true);

  useEffect(() => {
    if (tenantLoading || tenantError || !tenant) {
      if (!tenantLoading) setAutoChecking(false);
      return;
    }

    const token = getToken();
    if (!token || isTokenExpired(token)) {
      if (token) clearAuthSession();
      setAutoChecking(false);
      return;
    }
    if (!getSessionRole()) {
      setAutoChecking(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await syncFromCloud();
        if (cancelled) return;
        void initPushAfterLogin();
        if (!navigateBySessionRole(navigate)) {
          clearAuthSession();
        }
      } catch {
        clearAuthSession();
      } finally {
        if (!cancelled) setAutoChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tenant?.id, tenantLoading, tenantError, navigate, tenant]);

  if (tenantLoading || autoChecking) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-muted-foreground text-sm">
          {tenantLoading ? "جاري تحميل بيانات المجمع..." : "جاري استعادة جلسة الدخول..."}
        </p>
      </div>
    );
  }

  if (tenantError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-card rounded-2xl p-8 max-w-md text-center">
          <h1 className="text-xl font-bold text-destructive mb-2">تعذّر تحميل المجمع</h1>
          <p className="text-muted-foreground text-sm">{tenantError}</p>
          <p className="text-muted-foreground text-xs mt-4">
            تحقق من الرابط (مثل {apexDomain()}/m101) أو{" "}
            <a href={`https://${apexDomain()}`} className="text-primary underline">عد إلى المنصة</a>
          </p>
        </div>
      </div>
    );
  }

  if (!tenant) {
    return null;
  }

  const looksLikeNationalId = value.trim().length >= 9;

  const submit = async () => {
    const v = value.trim();
    if (!v) {
      toast.error("أدخل رقم العضوية أو رقم الهوية");
      return;
    }
    setBusy(true);
    try {
      if (v.length >= 9) {
        const student = await loginByNationalId({ data: { nationalId: v } });
        setToken(student.token);
        setAuthItem("qs_role", "student");
        setAuthItem("qs_student", student.studentId);
        setAuthItem("qs_name", student.name);
        if (student.complexId != null) setAuthItem("qs_complex", String(student.complexId));
        else setAuthItem("qs_complex", String(tenant.id));
        setAuthItem("qs_tenant_subdomain", tenant.subdomain);
        setAuthItem("qs_tenant_name", tenant.name);
        setPortalMode("student");
        await syncFromCloud();
        void initPushAfterLogin();
        navigate({ to: tenantPath("/student"), search: { s: student.studentId } });
        return;
      }

      const auth = await loginByCode({ data: { code: v } });
      if (!auth.token || !auth.role) {
        throw new Error("فشل تسجيل الدخول — تحقق من رقم العضوية");
      }
      setToken(auth.token);
      setAuthItem("qs_role", auth.role);
      setAuthItem("qs_name", auth.name);
      if (auth.complexId != null) setAuthItem("qs_complex", String(auth.complexId));
      else setAuthItem("qs_complex", String(tenant.id));
      setAuthItem("qs_tenant_subdomain", tenant.subdomain);
      setAuthItem("qs_tenant_name", tenant.name);
      if (auth.halaqaId) setAuthItem("qs_halaqa", String(auth.halaqaId));
      else removeAuthItem("qs_halaqa");
      removeAuthItem("qs_student");
      removeAuthItem("qs_portal_mode");
      await syncFromCloud();
      void initPushAfterLogin();

      switch (auth.role) {
        case "manager": navigate({ to: tenantPath("/manager") }); break;
        case "secretary": navigate({ to: tenantPath("/secretary"), search: { tab: "daily", section: "attendance" } }); break;
        case "supervisor": navigate({ to: tenantPath("/supervisor"), search: { tab: "sard", section: "sard" } }); break;
        case "program_supervisor": navigate({ to: tenantPath("/program-supervisor") }); break;
        case "musammi": navigate({ to: tenantPath("/musammi") }); break;
        case "teacher":
        case "assistant":
          navigate({ to: tenantPath("/teacher"), search: { h: auth.halaqaId! } });
          break;
        default:
          throw new Error("دور غير معروف — تواصل مع إدارة المجمع");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "تعذّر تسجيل الدخول";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <Toaster position="top-center" richColors />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl pointer-events-none" />

      <div className="glass-card rounded-3xl p-8 md:p-12 w-full max-w-xl relative z-10 gold-glow">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-28 h-28 rounded-2xl bg-card border border-primary/15 mb-4 gold-glow p-2">
            <TenantLogo
              logoUrl={logoUrl}
              brandName={brandName}
              imgClassName="w-full h-full object-contain"
              placeholderClassName="w-full h-full border-0 bg-transparent"
            />
          </div>
          <h1 className="display text-3xl md:text-4xl font-bold gold-text mb-2">{brandName}</h1>
          <p className="text-muted-foreground text-sm">لتحفيظ القرآن الكريم</p>
        </div>

        <div className="mb-6">
          <label className="block text-sm text-muted-foreground mb-2">
            رقم العضوية أو رقم الهوية
          </label>
          <input
            type={looksLikeNationalId ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && void submit()}
            placeholder={looksLikeNationalId ? "رقم الهوية" : "••••"}
            maxLength={10}
            inputMode="numeric"
            className="w-full px-4 py-3 rounded-xl bg-input border border-border focus:border-primary focus:outline-none text-center text-2xl tracking-[0.3em] font-bold text-primary"
          />
          <p className="text-xs text-muted-foreground text-center mt-2">
            الكادر: رقم العضوية · الطالب وولي الأمر: رقم الهوية
          </p>
        </div>

        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="w-full py-4 rounded-xl gold-gradient text-primary-foreground font-bold text-lg hover:scale-[1.02] transition-transform gold-glow disabled:opacity-60"
        >
          {busy ? "..." : "دخول"}
        </button>
      </div>
    </div>
  );
}
