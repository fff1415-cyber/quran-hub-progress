import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  PLATFORM_BRAND,
  resolveTenantFromHostname,
  tenantLogoUrl,
  type TenantInfo,
} from "@/lib/tenant";

type TenantContextValue = {
  isPlatform: boolean;
  tenant: TenantInfo | null;
  brandName: string;
  logoUrl: string;
  loading: boolean;
  error: string | null;
};

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [isPlatform, setIsPlatform] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const resolved = await resolveTenantFromHostname();
        if (!cancelled) {
          setTenant(resolved);
          setIsPlatform(resolved === null);
          setError(null);
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
  }, []);

  const value = useMemo(() => {
    const brandName = isPlatform ? PLATFORM_BRAND.name : (tenant?.name ?? PLATFORM_BRAND.name);
    const logoUrl = isPlatform ? PLATFORM_BRAND.logoUrl : tenant ? tenantLogoUrl(tenant) : PLATFORM_BRAND.logoUrl;
    return {
      isPlatform,
      tenant,
      brandName,
      logoUrl,
      loading,
      error,
    };
  }, [isPlatform, tenant, loading, error]);

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenant must be used within TenantProvider");
  }
  return ctx;
}
