import { clearToken } from "@/lib/cloud-sync";

/** Drop auth/session keys when the URL points at a different complex. */
export function clearAuthSession(): void {
  if (typeof sessionStorage === "undefined") return;
  clearToken();
  sessionStorage.removeItem("qs_role");
  sessionStorage.removeItem("qs_name");
  sessionStorage.removeItem("qs_halaqa");
  sessionStorage.removeItem("qs_student");
  sessionStorage.removeItem("qs_portal_mode");
}

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
  const prevSub = sessionStorage.getItem("qs_tenant_subdomain");
  const prevComplex = sessionStorage.getItem("qs_complex");
  const mismatch =
    prevSub !== tenant.subdomain ||
    (prevComplex != null && Number(prevComplex) !== tenant.id);
  if (!mismatch) return;
  clearAuthSession();
  clearTenantLocalCache();
}
