import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Building2, Loader2, Search } from "lucide-react";
import { toast, Toaster } from "sonner";
import {
  resolveComplexQuery,
  tenantOrigin,
} from "@/lib/tenant";
import { PlatformBrandHeader } from "@/components/platform/PlatformBrandHeader";

export function PlatformHomePage() {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const goToComplex = async () => {
    const q = query.trim();
    if (!q) {
      toast.error("أدخل اسم المجمع");
      return;
    }
    setBusy(true);
    try {
      const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/i;
      if (slugPattern.test(q)) {
        window.location.href = tenantOrigin(q.toLowerCase());
        return;
      }
      const result = await resolveComplexQuery(q);
      window.location.href = result.url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "لم يُعثر على المجمع");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <Toaster position="top-center" richColors />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-primary/5 blur-3xl pointer-events-none" />

      <div className="glass-card rounded-3xl p-8 md:p-12 w-full max-w-lg relative z-10 gold-glow">
        <PlatformBrandHeader />

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-2">اسم المجمع</label>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !busy && void goToComplex()}
                placeholder="مثال: مجمع حلقات الشتيوي أو m1"
                className="w-full pr-11 pl-4 py-3 rounded-xl bg-input border border-border focus:border-primary focus:outline-none text-base"
                autoComplete="organization"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              أدخل اسم مجمعك للانتقال إلى بوابة الدخول الخاصة به
            </p>
          </div>

          <button
            type="button"
            onClick={() => void goToComplex()}
            disabled={busy}
            className="w-full py-3.5 rounded-xl gold-gradient text-primary-foreground font-bold hover:scale-[1.01] transition-transform disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Building2 className="w-5 h-5" />}
            {busy ? "جاري البحث..." : "الذهاب إلى مجمعي"}
          </button>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-3 text-muted-foreground">أو</span>
            </div>
          </div>

          <Link
            to="/register"
            className="block w-full py-3.5 rounded-xl border-2 border-primary/30 text-primary font-bold text-center hover:bg-primary/5 transition-colors"
          >
            تسجيل مجمع جديد
          </Link>
        </div>
      </div>
    </div>
  );
}
