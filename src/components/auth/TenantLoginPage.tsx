import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { loginByCode, loginByNationalId } from "@/lib/secure-data.functions";
import { setToken, syncFromCloud } from "@/lib/cloud-sync";
import { isPortalViewerRole, setPortalMode } from "@/lib/student-portal-auth";
import { Shield, UserCheck, GraduationCap, Mic, Eye, Loader2 } from "lucide-react";
import { toast, Toaster } from "sonner";
import { useTenant } from "@/contexts/TenantContext";
import { TenantLogo } from "@/components/TenantLogo";

type LoginMode = "staff" | "student";

export function TenantLoginPage() {
  const navigate = useNavigate();
  const { tenant, logoUrl, brandName, loading: tenantLoading, error: tenantError } = useTenant();
  const [mode, setMode] = useState<LoginMode>("staff");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  if (!tenant) {
    return null;
  }

  const submit = async () => {
    if (!value.trim()) {
      toast.error("أدخل الرمز / رقم الهوية");
      return;
    }
    setBusy(true);
    try {
      if (mode === "staff") {
        const auth = await loginByCode({ data: { code: value.trim() } });
        if (!auth.token || !auth.role) {
          throw new Error("فشل تسجيل الدخول — تحقق من إعدادات API على الخادم");
        }
        setToken(auth.token);
        sessionStorage.setItem("qs_role", auth.role);
        sessionStorage.setItem("qs_name", auth.name);
        if (auth.complexId != null) sessionStorage.setItem("qs_complex", String(auth.complexId));
        else sessionStorage.setItem("qs_complex", String(tenant.id));
        if (auth.halaqaId) sessionStorage.setItem("qs_halaqa", String(auth.halaqaId));
        else sessionStorage.removeItem("qs_halaqa");
        await syncFromCloud();

        switch (auth.role) {
          case "manager": navigate({ to: "/manager" }); break;
          case "secretary": navigate({ to: "/secretary", search: { tab: "daily", section: "attendance" } }); break;
          case "supervisor": navigate({ to: "/supervisor", search: { tab: "sard", section: "sard" } }); break;
          case "program_supervisor": navigate({ to: "/program-supervisor" }); break;
          case "musammi": navigate({ to: "/musammi" }); break;
          case "teacher":
          case "assistant":
            navigate({ to: "/teacher", search: { h: auth.halaqaId! } });
            break;
        }
      } else {
        const v = value.trim();
        const looksLikeNationalId = v.length >= 9;

        if (looksLikeNationalId) {
          const student = await loginByNationalId({ data: { nationalId: v } });
          setToken(student.token);
          sessionStorage.setItem("qs_role", "student");
          sessionStorage.setItem("qs_student", student.studentId);
          if (student.complexId != null) sessionStorage.setItem("qs_complex", String(student.complexId));
          else sessionStorage.setItem("qs_complex", String(tenant.id));
          setPortalMode("student");
          await syncFromCloud();
          navigate({ to: "/student", search: { s: student.studentId } });
        } else {
          const auth = await loginByCode({ data: { code: v } });
          if (!auth.token || !auth.role) throw new Error("فشل تسجيل الدخول");
          if (!isPortalViewerRole(auth.role)) {
            throw new Error("رقم العضوية غير صالح — استخدم تبويب الكادر للوحة العمل");
          }
          setToken(auth.token);
          sessionStorage.setItem("qs_role", auth.role);
          sessionStorage.setItem("qs_name", auth.name);
          if (auth.complexId != null) sessionStorage.setItem("qs_complex", String(auth.complexId));
          else sessionStorage.setItem("qs_complex", String(tenant.id));
          if (auth.halaqaId) sessionStorage.setItem("qs_halaqa", String(auth.halaqaId));
          else sessionStorage.removeItem("qs_halaqa");
          setPortalMode("viewer");
          await syncFromCloud();
          navigate({ to: "/student" });
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "تعذّر تسجيل الدخول";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  if (tenantLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-muted-foreground text-sm">جاري تحميل بيانات المجمع...</p>
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
            تحقق من الرابط (مثل m1.msht.io) أو{" "}
            <a href="https://msht.io" className="text-primary underline">عد إلى المنصة</a>
          </p>
        </div>
      </div>
    );
  }

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
          <div className="mt-4 flex items-center justify-center gap-2">
            <span className="h-px w-12 bg-gradient-to-r from-transparent to-primary/50" />
            <span className="text-primary text-xs">﷽</span>
            <span className="h-px w-12 bg-gradient-to-l from-transparent to-primary/50" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-secondary/40 mb-6">
          <button
            type="button"
            onClick={() => { setMode("staff"); setValue(""); }}
            className={`py-2.5 rounded-lg text-sm font-bold transition-all ${mode === "staff" ? "gold-gradient text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            دخول الكادر التعليمي
          </button>
          <button
            type="button"
            onClick={() => { setMode("student"); setValue(""); }}
            className={`py-2.5 rounded-lg text-sm font-bold transition-all ${mode === "student" ? "gold-gradient text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            الطالب وولي الأمر
          </button>
        </div>

        <div className="mb-6">
          <label className="block text-sm text-muted-foreground mb-2">
            {mode === "staff"
              ? "رقم العضوية"
              : "رقم هوية الطالب أو رقم العضوية للاطلاع العام"}
          </label>
          <input
            type={mode === "staff" || (mode === "student" && value.length > 0 && value.length <= 6) ? "password" : "text"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && void submit()}
            placeholder={mode === "staff" ? "••••" : "هوية أو عضوية"}
            maxLength={mode === "staff" ? 6 : 10}
            inputMode="numeric"
            className="w-full px-4 py-3 rounded-xl bg-input border border-border focus:border-primary focus:outline-none text-center text-2xl tracking-[0.3em] font-bold text-primary"
          />
        </div>

        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="w-full py-4 rounded-xl gold-gradient text-primary-foreground font-bold text-lg hover:scale-[1.02] transition-transform gold-glow disabled:opacity-60"
        >
          {busy ? "..." : "دخول"}
        </button>

        <div className="mt-6 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
          <div className="flex flex-col items-center gap-1 p-2 rounded-lg border border-border/50">
            <Shield className="w-4 h-4 text-primary" />
            مدير • سكرتير
          </div>
          <div className="flex flex-col items-center gap-1 p-2 rounded-lg border border-border/50">
            <Eye className="w-4 h-4 text-primary" />
            إشراف تعليمي
          </div>
          <div className="flex flex-col items-center gap-1 p-2 rounded-lg border border-border/50">
            <UserCheck className="w-4 h-4 text-primary" />
            معلم • مساعد
          </div>
          <div className="flex flex-col items-center gap-1 p-2 rounded-lg border border-border/50">
            <Mic className="w-4 h-4 text-primary" />
            مسمّع
          </div>
          <div className="flex flex-col items-center gap-1 p-2 rounded-lg border border-border/50 col-span-2">
            <GraduationCap className="w-4 h-4 text-primary" />
            ولي الأمر — هوية الطالب · أو عضوية للاطلاع العام
          </div>
        </div>
      </div>
    </div>
  );
}
