import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_TENANT,
  resolveTenantFromHostname,
  tenantLogoUrl,
  type TenantInfo,
} from "@/lib/tenant";

type TenantContextValue = {
  tenant: TenantInfo;
  logoUrl: string;
  loading: boolean;
  error: string | null;
};

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<TenantInfo>(DEFAULT_TENANT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const resolved = await resolveTenantFromHostname();
        if (!cancelled) {
          setTenant(resolved);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "تعذّر تحميل بيانات المجمع";
          setError(msg);
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

  const value = useMemo(
    () => ({
      tenant,
      logoUrl: tenantLogoUrl(tenant),
      loading,
      error,
    }),
    [tenant, loading, error],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenant must be used within TenantProvider");
  }
  return ctx;
}
