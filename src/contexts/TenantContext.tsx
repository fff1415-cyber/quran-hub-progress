import { useRouterState } from "@tanstack/react-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { syncFromCloud } from "@/lib/cloud-sync";
import { ensureSessionFromToken } from "@/lib/auth-session";
import {
  PLATFORM_BRAND,
  fetchTenantBySubdomain,
  isPlatformHost,
  parseSubdomain,
  parseTenantSlugFromPath,
  resolveTenantFromLocation,
  setCachedTenant,
  tenantLogoUrl,
  type TenantInfo,
} from "@/lib/tenant";

type TenantContextValue = {
  isPlatform: boolean;
  tenant: TenantInfo | null;
  brandName: string;
  logoUrl: string | null;
  loading: boolean;
  error: string | null;
  refreshTenant: () => Promise<void>;
  setTenantState: (tenant: TenantInfo) => void;
};

const TenantContext = createContext<TenantContextValue | null>(null);

function resolveTenantScopeKey(_routerPathname: string): string {
  if (typeof window === "undefined") return _routerPathname;
  const host = window.location.hostname;
  // Prefer the real browser path — router pathname can omit the /m1 prefix
  // depending on matching, which incorrectly keyed the tenant as "__platform__".
  const path = window.location.pathname || _routerPathname;
  if (isPlatformHost(host)) {
    return parseTenantSlugFromPath(path) ?? "__platform__";
  }
  return parseSubdomain(host) ?? "__unknown__";
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tenantScopeKey = useMemo(() => resolveTenantScopeKey(pathname), [pathname]);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [isPlatform, setIsPlatform] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadGeneration = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const runId = ++loadGeneration.current;
    setLoading(true);
    void (async () => {
      try {
        const resolved = await resolveTenantFromLocation(
          typeof window !== "undefined" ? window.location.hostname : undefined,
          typeof window !== "undefined" ? window.location.pathname : pathname,
        );

        // Always sync roster after tenant resolve — even if this effect instance
        // was superseded (React Strict Mode). Sync is idempotent; skipping it
        // left localStorage empty and broke /teacher.
        if (resolved) {
          try {
            await syncFromCloud();
            ensureSessionFromToken();
          } catch (syncErr) {
            console.warn("Tenant roster sync failed:", syncErr);
          }
        }

        if (cancelled || runId !== loadGeneration.current) return;

        setTenant(resolved);
        setIsPlatform(resolved === null);
        setError(null);
      } catch (e) {
        if (cancelled || runId !== loadGeneration.current) return;
        const msg = e instanceof Error ? e.message : "تعذّر تحميل بيانات المجمع";
        setError(msg);
        setIsPlatform(false);
      } finally {
        if (!cancelled && runId === loadGeneration.current) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantScopeKey, pathname]);

  const setTenantState = useCallback((next: TenantInfo) => {
    setTenant(next);
    setCachedTenant(next, false);
  }, []);

  const refreshTenant = useCallback(async () => {
    const sub =
      tenant?.subdomain ??
      (typeof window !== "undefined"
        ? parseTenantSlugFromPath(window.location.pathname) ??
          parseSubdomain(window.location.hostname)
        : null);
    if (!sub) {
      return;
    }
    const updated = await fetchTenantBySubdomain(sub);
    setTenantState(updated);
  }, [tenant?.subdomain, setTenantState]);

  const value = useMemo(() => {
    const brandName = isPlatform ? PLATFORM_BRAND.name : (tenant?.name ?? PLATFORM_BRAND.name);
    const logoUrl = isPlatform ? null : tenant ? tenantLogoUrl(tenant) : null;
    return {
      isPlatform,
      tenant,
      brandName,
      logoUrl,
      loading,
      error,
      refreshTenant,
      setTenantState,
    };
  }, [isPlatform, tenant, loading, error, refreshTenant, setTenantState]);

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenant must be used within TenantProvider");
  }
  return ctx;
}
