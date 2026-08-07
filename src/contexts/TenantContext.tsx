import { useRouterState } from "@tanstack/react-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { syncFromCloud } from "@/lib/cloud-sync";
import {
  PLATFORM_BRAND,
  fetchTenantBySubdomain,
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

export function TenantProvider({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [isPlatform, setIsPlatform] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const resolved = await resolveTenantFromLocation(
          typeof window !== "undefined" ? window.location.hostname : undefined,
          pathname,
        );
        if (!cancelled) {
          setTenant(resolved);
          setIsPlatform(resolved === null);
          setError(null);
          if (resolved) {
            await syncFromCloud();
          }
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "تعذّر تحميل بيانات المجمع";
          setError(msg);
          setIsPlatform(false);
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
  }, [pathname]);

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
