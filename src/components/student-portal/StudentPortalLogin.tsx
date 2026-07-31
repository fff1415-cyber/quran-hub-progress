import { useState } from "react";
import { loginByCode, loginByNationalId } from "@/lib/secure-data.functions";
import { setToken, syncFromCloud } from "@/lib/cloud-sync";
import { isPortalViewerRole, setPortalMode } from "@/lib/student-portal-auth";
import { useTenant } from "@/contexts/TenantContext";
import { IdCard, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

type LoginMode = "student" | "staff";

export function StudentPortalLogin({
  onAuthenticated,
}: {
  onAuthenticated: (mode: "student" | "viewer", studentId?: string) => void;
}) {
  const { tenant } = useTenant();
  const [mode, setMode] = useState<LoginMode>("student");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!value.trim()) {
      toast.error(mode === "student" ? "أدخل رقم الهوية" : "أدخل رقم العضوية");
      return;
    }
    setBusy(true);
    try {
      if (mode === "student") {
        const res = await loginByNationalId({ data: { nationalId: value.trim() } });
        setToken(res.token);
        sessionStorage.setItem("qs_role", "student");
        sessionStorage.setItem("qs_student", res.studentId);
        if (res.complexId != null) sessionStorage.setItem("qs_complex", String(res.complexId));
        else if (tenant) sessionStorage.setItem("qs_complex", String(tenant.id));
        setPortalMode("student");
        await syncFromCloud();
        onAuthenticated("student", res.studentId);
      } else {
        const auth = await loginByCode({ data: { code: value.trim() } });
        if (!auth.token || !auth.role) throw new Error("فشل تسجيل الدخول");
        if (!isPortalViewerRole(auth.role)) {
          throw new Error("رقم العضوية غير صالح للاطلاع — استخدم عضوية الكادر أو هوية الطالب");
        }
        setToken(auth.token);
        sessionStorage.setItem("qs_role", auth.role);
        sessionStorage.setItem("qs_name", auth.name);
        if (auth.complexId != null) sessionStorage.setItem("qs_complex", String(auth.complexId));
        else if (tenant) sessionStorage.setItem("qs_complex", String(tenant.id));
        if (auth.halaqaId) sessionStorage.setItem("qs_halaqa", String(auth.halaqaId));
        else sessionStorage.removeItem("qs_halaqa");
        setPortalMode("viewer");
        await syncFromCloud();
        onAuthenticated("viewer");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تسجيل الدخول");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass-card rounded-2xl p-8 max-w-lg mx-auto text-center">
      <h2 className="text-xl font-bold text-primary mb-2">الدخول للاطلاع</h2>
      <p className="text-sm text-muted-foreground mb-6">
        رقم هوية الطالب لعرض بياناته، أو رقم العضوية للمعلّم/المشرف/الكادر — للنتائج العامة
      </p>

      <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-secondary/40 mb-5">
        <button
          type="button"
          onClick={() => { setMode("student"); setValue(""); }}
          className={`py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
            mode === "student" ? "gold-gradient text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          <IdCard className="w-4 h-4" /> ولي الأمر / طالب
        </button>
        <button
          type="button"
          onClick={() => { setMode("staff"); setValue(""); }}
          className={`py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
            mode === "staff" ? "gold-gradient text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          <KeyRound className="w-4 h-4" /> رقم العضوية
        </button>
      </div>

      <input
        type={mode === "staff" ? "password" : "text"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !busy && void submit()}
        placeholder={mode === "student" ? "رقم الهوية" : "••••"}
        inputMode="numeric"
        maxLength={mode === "student" ? 10 : 6}
        className="w-full px-4 py-3 rounded-xl bg-input border border-border focus:border-primary focus:outline-none text-center text-lg tracking-widest font-bold text-primary mb-4"
      />

      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy}
        className="w-full py-3 rounded-xl gold-gradient text-primary-foreground font-bold disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : "دخول"}
      </button>

      {mode === "staff" && (
        <p className="text-[11px] text-muted-foreground mt-4 leading-relaxed">
          المعلّم · المساعد · المشرف · المسمّع · السكرتير — عرض النتائج العامة فقط
        </p>
      )}
    </section>
  );
}
