import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { HALAQAT, ADMIN_CODE, MUSAMMI_CODE, type Role } from "@/lib/mock-data";
import { BookOpen, Shield, UserCheck, GraduationCap, Users, Mic } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "sonner";

export const Route = createFileRoute("/")({ component: LoginPage });

const ROLES: { id: Role; label: string; icon: React.ElementType; needsCode: boolean }[] = [
  { id: "admin", label: "إداري", icon: Shield, needsCode: true },
  { id: "teacher", label: "معلم", icon: UserCheck, needsCode: true },
  { id: "assistant", label: "مساعد", icon: Users, needsCode: true },
  { id: "musammi", label: "مسمّع", icon: Mic, needsCode: true },
  { id: "student", label: "طالب", icon: GraduationCap, needsCode: false },
  { id: "parent", label: "ولي أمر", icon: BookOpen, needsCode: false },
];

function LoginPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState<Role | null>(null);
  const [code, setCode] = useState("");

  const handleSubmit = () => {
    if (!role) { toast.error("اختر صفة المسجل"); return; }
    if (role === "student" || role === "parent") {
      navigate({ to: "/student" });
      return;
    }
    if (!code.trim()) { toast.error("أدخل رقم العضوية"); return; }
    if (role === "admin") {
      if (code === ADMIN_CODE) {
        sessionStorage.setItem("qs_role", "admin");
        navigate({ to: "/admin" });
      } else toast.error("رمز إداري غير صحيح");
      return;
    }
    if (role === "musammi") {
      if (code === MUSAMMI_CODE) {
        sessionStorage.setItem("qs_role", "musammi");
        navigate({ to: "/musammi" });
      } else toast.error("رمز المسمّع غير صحيح");
      return;
    }
    // teacher / assistant — match halaqa code
    const halaqa = HALAQAT.find((h) => h.code === code);
    if (!halaqa) { toast.error("رمز الحلقة غير صحيح"); return; }
    sessionStorage.setItem("qs_role", role);
    sessionStorage.setItem("qs_halaqa", String(halaqa.id));
    navigate({ to: "/teacher", search: { h: halaqa.id } });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <Toaster position="top-center" richColors />

      {/* Decorative ornament */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl pointer-events-none" />

      <div className="glass-card rounded-3xl p-8 md:p-12 w-full max-w-2xl relative z-10 gold-glow">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl gold-gradient mb-4 gold-glow">
            <BookOpen className="w-10 h-10 text-primary-foreground" />
          </div>
          <h1 className="display text-3xl md:text-4xl font-bold gold-text mb-2">
            مجمع حلقات الشتيوي
          </h1>
          <p className="text-muted-foreground text-sm">لتحفيظ القرآن الكريم</p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <span className="h-px w-12 bg-gradient-to-r from-transparent to-primary/50" />
            <span className="text-primary text-xs">﷽</span>
            <span className="h-px w-12 bg-gradient-to-l from-transparent to-primary/50" />
          </div>
        </div>

        {/* Role selection */}
        <div className="mb-8">
          <label className="block text-sm text-muted-foreground mb-3">اختر صفة المسجل</label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {ROLES.map((r) => {
              const Icon = r.icon;
              const selected = role === r.id;
              return (
                <button
                  key={r.id}
                  onClick={() => setRole(r.id)}
                  className={`group p-4 rounded-xl border transition-all duration-200 ${
                    selected
                      ? "border-primary bg-primary/10 gold-glow"
                      : "border-border bg-card/50 hover:border-primary/50"
                  }`}
                >
                  <Icon className={`w-6 h-6 mx-auto mb-2 ${selected ? "text-primary" : "text-muted-foreground group-hover:text-primary"}`} />
                  <div className={`text-sm font-medium ${selected ? "text-primary" : "text-foreground"}`}>{r.label}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Membership code */}
        {role && (role === "admin" || role === "teacher" || role === "assistant" || role === "musammi") && (
          <div className="mb-6 animate-in fade-in slide-in-from-bottom-2">
            <label className="block text-sm text-muted-foreground mb-2">رقم العضوية / رمز الدخول</label>
            <input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="••••"
              maxLength={6}
              className="w-full px-4 py-3 rounded-xl bg-input border border-border focus:border-primary focus:outline-none text-center text-2xl tracking-[0.5em] font-bold text-primary"
            />
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!role}
          className="w-full py-4 rounded-xl gold-gradient text-primary-foreground font-bold text-lg disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] transition-transform gold-glow"
        >
          دخول
        </button>

        <p className="text-center text-xs text-muted-foreground mt-6">
          الطالب وولي الأمر يدخلون مباشرة بدون رمز
        </p>
      </div>
    </div>
  );
}
