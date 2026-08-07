import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  LogOut,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UserX,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { PlatformBrandHeader } from "@/components/platform/PlatformBrandHeader";
import { useTenant } from "@/contexts/TenantContext";
import {
  clearPlatformToken,
  getPlatformToken,
  platformDeleteRoleAccount,
  platformListComplexes,
  platformListRoleAccounts,
  platformLogin,
  platformPatchComplex,
  platformRevokeAccess,
  ROLE_LABELS,
  type PlatformComplex,
  type PlatformRoleAccount,
} from "@/lib/platform-admin";
import { apexDomain, tenantUrl } from "@/lib/tenant";

export function PlatformAdminPage() {
  const { isPlatform, loading: tenantLoading } = useTenant();
  const [token, setToken] = useState<string | null>(() => getPlatformToken());
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [complexes, setComplexes] = useState<PlatformComplex[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<PlatformRoleAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);

  const loadComplexes = useCallback(async (authToken: string) => {
    setLoading(true);
    try {
      const rows = await platformListComplexes(authToken);
      setComplexes(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل المجمعات");
      if (e instanceof Error && e.message.includes("Unauthorized")) {
        clearPlatformToken();
        setToken(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      void loadComplexes(token);
    }
  }, [token, loadComplexes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return complexes;
    return complexes.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.subdomain.toLowerCase().includes(q) ||
        (c.contact_phone ?? "").includes(q),
    );
  }, [complexes, query]);

  const login = async () => {
    if (!password.trim()) {
      toast.error("أدخل كلمة مرور أدمن المنصة");
      return;
    }
    setLoginBusy(true);
    try {
      const result = await platformLogin(password);
      setToken(result.token);
      setPassword("");
      toast.success("تم الدخول إلى لوحة المنصة");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الدخول");
    } finally {
      setLoginBusy(false);
    }
  };

  const logout = () => {
    clearPlatformToken();
    setToken(null);
    setComplexes([]);
    setExpandedId(null);
    setAccounts([]);
  };

  const loadAccounts = async (complexId: number) => {
    if (!token) return;
    setAccountsLoading(true);
    try {
      const rows = await platformListRoleAccounts(token, complexId);
      setAccounts(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل الحسابات");
    } finally {
      setAccountsLoading(false);
    }
  };

  const toggleExpand = async (complexId: number) => {
    if (expandedId === complexId) {
      setExpandedId(null);
      setAccounts([]);
      return;
    }
    setExpandedId(complexId);
    await loadAccounts(complexId);
  };

  const toggleActive = async (complex: PlatformComplex) => {
    if (!token) return;
    const next = !complex.is_active;
    const msg = next
      ? `تفعيل مجمع «${complex.name}»؟`
      : `تعطيل مجمع «${complex.name}»؟\n\nسيتم حذف جميع حسابات الدخول (role_accounts) تلقائياً.`;
    if (!confirm(msg)) return;

    setActionId(complex.id);
    try {
      await platformPatchComplex(token, complex.id, next);
      toast.success(next ? "تم تفعيل المجمع" : "تم تعطيل المجمع وحذف حسابات الدخول");
      await loadComplexes(token);
      if (expandedId === complex.id) {
        await loadAccounts(complex.id);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل التحديث");
    } finally {
      setActionId(null);
    }
  };

  const revokeAccess = async (complex: PlatformComplex) => {
    if (!token) return;
    if (
      !confirm(
        `إلغاء وصول مجمع «${complex.name}»؟\n\nسيتم حذف كل حسابات الدخول وتعطيل المجمع.`,
      )
    ) {
      return;
    }
    setActionId(complex.id);
    try {
      const deleted = await platformRevokeAccess(token, complex.id);
      toast.success(`تم إلغاء الوصول — حُذفت ${deleted} حساب/حسابات`);
      await loadComplexes(token);
      if (expandedId === complex.id) {
        await loadAccounts(complex.id);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل إلغاء الوصول");
    } finally {
      setActionId(null);
    }
  };

  const deleteAccount = async (complexId: number, account: PlatformRoleAccount) => {
    if (!token) return;
    if (!confirm(`حذف حساب «${account.name}» (${ROLE_LABELS[account.role] ?? account.role})؟`)) {
      return;
    }
    try {
      await platformDeleteRoleAccount(token, complexId, account.id);
      toast.success("تم حذف الحساب");
      await loadAccounts(complexId);
      await loadComplexes(token);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل حذف الحساب");
    }
  };

  if (tenantLoading) {
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
          <p className="text-muted-foreground mb-4">لوحة أدمن المنصة متاحة من {apexDomain()} فقط.</p>
          <a href={`https://${apexDomain()}/platform-admin`} className="text-primary font-bold underline">
            الذهاب إلى لوحة المنصة
          </a>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Toaster position="top-center" richColors />
        <div className="glass-card rounded-3xl p-8 md:p-10 w-full max-w-md gold-glow">
          <Link to="/" className="text-sm text-muted-foreground hover:text-primary mb-6 inline-block">
            ← العودة للرئيسية
          </Link>
          <PlatformBrandHeader compact />
          <div className="flex items-center gap-2 justify-center mb-6 mt-4">
            <Shield className="w-6 h-6 text-primary" />
            <h1 className="display text-xl font-bold">لوحة أدمن المنصة</h1>
          </div>
          <p className="text-sm text-muted-foreground text-center mb-6">
            إدارة جميع المجمعات وحسابات الدخول — صلاحية مالك المنصة فقط
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-muted-foreground mb-1">كلمة مرور أدمن المنصة</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !loginBusy && void login()}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl bg-input border border-border focus:border-primary focus:outline-none"
                dir="ltr"
                autoComplete="current-password"
              />
            </div>
            <button
              type="button"
              onClick={() => void login()}
              disabled={loginBusy}
              className="w-full py-4 rounded-xl gold-gradient text-primary-foreground font-bold disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loginBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
              {loginBusy ? "جاري الدخول..." : "دخول"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <Toaster position="top-center" richColors />
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-6 h-6 text-primary" />
              <h1 className="display text-2xl font-bold">لوحة أدمن المنصة</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              {complexes.length} مجمع · إدارة الحسابات والتعاقدات
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => token && void loadComplexes(token)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border hover:bg-secondary/50 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              تحديث
            </button>
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              <LogOut className="w-4 h-4" />
              خروج
            </button>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="بحث بالاسم أو العضوية أو الجوال..."
              className="w-full pr-11 pl-4 py-3 rounded-xl bg-input border border-border focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        {loading && complexes.length === 0 ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center text-muted-foreground">
            لا توجد مجمعات مطابقة
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((complex) => {
              const expanded = expandedId === complex.id;
              const busy = actionId === complex.id;
              return (
                <div
                  key={complex.id}
                  className={`glass-card rounded-2xl overflow-hidden border ${
                    complex.is_active ? "border-border" : "border-destructive/40 bg-destructive/5"
                  }`}
                >
                  <div className="p-4 md:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
                          <Building2 className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-bold text-lg">{complex.name}</h2>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                                complex.is_active
                                  ? "bg-success/15 text-success"
                                  : "bg-destructive/15 text-destructive"
                              }`}
                            >
                              {complex.is_active ? "نشط" : "معطّل"}
                            </span>
                          </div>
                          <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1">
                            <span dir="ltr">{apexDomain()}/{complex.subdomain}</span>
                            {complex.contact_phone && <span dir="ltr">{complex.contact_phone}</span>}
                            <span>#{complex.id}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-3">
                            <span>{complex.accounts_count} حساب دخول</span>
                            <span>{complex.students_count} طالب</span>
                            <span>{complex.halaqat_count} حلقة</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <a
                          href={tenantUrl(complex.subdomain)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm hover:bg-secondary/50"
                        >
                          <ExternalLink className="w-4 h-4" />
                          بوابة المجمع
                        </a>
                        <button
                          type="button"
                          onClick={() => void toggleActive(complex)}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm hover:bg-secondary/50 disabled:opacity-50"
                        >
                          {busy ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <UserX className="w-4 h-4" />
                          )}
                          {complex.is_active ? "تعطيل" : "تفعيل"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void revokeAccess(complex)}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-destructive/40 text-destructive text-sm hover:bg-destructive/10 disabled:opacity-50"
                        >
                          إلغاء الوصول
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleExpand(complex.id)}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg gold-gradient text-primary-foreground text-sm font-bold"
                        >
                          الحسابات
                          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {expanded && (
                    <div className="border-t border-border bg-secondary/20 p-4 md:p-5">
                      {accountsLoading ? (
                        <div className="flex justify-center py-6">
                          <Loader2 className="w-6 h-6 text-primary animate-spin" />
                        </div>
                      ) : accounts.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          لا توجد حسابات دخول لهذا المجمع
                        </p>
                      ) : (
                        <div className="space-y-2">
                          <h3 className="text-sm font-bold text-primary mb-3">
                            حسابات الدخول ({accounts.length})
                          </h3>
                          {accounts.map((acc) => (
                            <div
                              key={acc.id}
                              className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-card border border-border"
                            >
                              <div>
                                <div className="font-medium">{acc.name}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  {ROLE_LABELS[acc.role] ?? acc.role} · رمز:{" "}
                                  <span className="font-mono text-primary">{acc.code}</span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => void deleteAccount(complex.id, acc)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-destructive hover:bg-destructive/10 text-sm"
                              >
                                <Trash2 className="w-4 h-4" />
                                حذف
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
