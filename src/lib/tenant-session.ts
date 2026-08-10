import { clearAuthSession, getAuthItem, removeAuthItem, setAuthItem } from "@/lib/auth-session";

/** Drop auth/session keys when the URL points at a different complex. */
export { clearAuthSession };

/** Remove cached app data — localStorage is shared across msht.io/m1, /m5, … */
export function clearTenantLocalCache(): void {
  if (typeof localStorage === "undefined") return;
  const remove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (
      key.startsWith("qshatawi_") ||
      key.startsWith("qs_absence_") ||
      key.startsWith("qs_active_calendar")
    ) {
      remove.push(key);
    }
  }
  for (const key of remove) {
    localStorage.removeItem(key);
  }
}

/** Clear stale session/cache before binding a complex from the URL. */
export function ensureTenantIsolation(tenant: { id: number; subdomain: string }): void {
  if (typeof window === "undefined") return;
  const prevSub = getAuthItem("qs_tenant_subdomain");
  const prevComplex = getAuthItem("qs_complex");
  const mismatch =
    prevSub !== tenant.subdomain ||
    (prevComplex != null && Number(prevComplex) !== tenant.id);
  if (!mismatch) return;
  clearAuthSession();
  clearTenantLocalCache();
}

export function setTenantSession(tenant: { id: number; subdomain: string; name: string }): void {
  setAuthItem("qs_complex", String(tenant.id));
  setAuthItem("qs_tenant_subdomain", tenant.subdomain);
  setAuthItem("qs_tenant_name", tenant.name);
}

export function clearTenantSession(): void {
  removeAuthItem("qs_complex");
  removeAuthItem("qs_tenant_subdomain");
  removeAuthItem("qs_tenant_name");
}
