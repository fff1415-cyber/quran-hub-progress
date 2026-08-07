import { buildRphpUrl } from "@/lib/api-base";
import { getBrandTheme, type BrandThemeKey } from "@/lib/brand-themes";
import { ensureTenantIsolation } from "@/lib/tenant-session";
import defaultLogo from "@/assets/shtaiwi-logo.png.asset.json";

export type TenantInfo = {
  id: number;
  name: string;
  logo_url: string | null;
  primary_color: string;
  theme_key: BrandThemeKey;
  subdomain: string;
};

/** Public SaaS landing brand (msht.io apex — not a specific complex). */
export const PLATFORM_BRAND = {
  name: "قلائد",
  tagline: "إدارتك أسهل",
  subtitle: "منصة إدارة مجمعات تحفيظ القرآن الكريم",
  logoUrl: defaultLogo.url,
  primaryColor: "#1e3a5f",
};

export const DEFAULT_TENANT: TenantInfo = {
  id: 1,
  name: "مجمع حلقات الشتيوي",
  logo_url: defaultLogo.url,
  primary_color: "#C9A227",
  theme_key: "beige",
  subdomain: "m1",
};

let cachedTenant: TenantInfo | null = null;
let cachedPlatformMode = false;

function apiUrl(path: string): string {
  return buildRphpUrl(path);
}

export function apexDomain(): string {
  const fromEnv = import.meta.env.VITE_APEX_DOMAIN;
  if (typeof fromEnv === "string" && fromEnv.trim() !== "") {
    return fromEnv.trim().toLowerCase();
  }
  return "msht.io";
}

function envSubdomainFallback(): string {
  const fromEnv = import.meta.env.VITE_SUBDOMAIN;
  if (typeof fromEnv === "string" && fromEnv.trim() !== "") {
    return fromEnv.trim().toLowerCase();
  }
  return DEFAULT_TENANT.subdomain;
}

/** Apex routes that are NOT tenant slugs (msht.io/register, not msht.io/m101). */
export const RESERVED_APEX_PATH_SEGMENTS = new Set([
  "register",
  "platform-admin",
  "prelaunch-audit",
  "admin",
  "dashboard",
  "daily-operations",
  "manager",
  "teacher",
  "secretary",
  "supervisor",
  "student",
  "musammi",
  "kiosk",
  "staff-attendance",
  "program-supervisor",
  "api",
  "assets",
]);

/** Tenant app routes that must not be used bare on apex (use /m101/manager). */
export const TENANT_APP_ROOT_SEGMENTS = new Set([
  "manager",
  "teacher",
  "secretary",
  "supervisor",
  "student",
  "musammi",
  "kiosk",
  "staff-attendance",
  "program-supervisor",
  "admin",
  "dashboard",
  "daily-operations",
]);

export function isValidTenantSlug(slug: string): boolean {
  return slug !== "" && /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/i.test(slug);
}

export function isReservedApexPathSegment(segment: string): boolean {
  return RESERVED_APEX_PATH_SEGMENTS.has(segment.toLowerCase());
}

/** First path segment on apex when it is a tenant slug: /m101/manager → m101 */
export function parseTenantSlugFromPath(pathname: string): string | null {
  const segment = pathname.replace(/^\/+|\/+$/g, "").split("/")[0]?.toLowerCase() ?? "";
  if (!segment || isReservedApexPathSegment(segment)) {
    return null;
  }
  return isValidTenantSlug(segment) ? segment : null;
}

/** Router basepath on apex path tenants: /m101 → /m101, subdomain host → "" */
export function getTenantBasepath(pathname?: string, hostname?: string): string {
  const host =
    hostname ??
    (typeof window !== "undefined" ? window.location.hostname : "");
  if (!host || !isPlatformHost(host)) {
    return "";
  }
  const path =
    pathname ??
    (typeof window !== "undefined" ? window.location.pathname : "");
  const slug = parseTenantSlugFromPath(path);
  return slug ? `/${slug}` : "";
}

/** Prefix tenant app paths on apex: /manager → /5645/manager; subdomain host unchanged. */
export function tenantPath(path: string): string {
  if (typeof window === "undefined") {
    return path.startsWith("/") ? path : `/${path}`;
  }
  if (!isPlatformHost(window.location.hostname)) {
    return path.startsWith("/") ? path : `/${path}`;
  }
  const slug =
    parseTenantSlugFromPath(window.location.pathname) ??
    getCachedTenant()?.subdomain ??
    (typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem("qs_tenant_subdomain")
      : null);
  if (!slug) {
    return path.startsWith("/") ? path : `/${path}`;
  }
  const sub = slug.toLowerCase();
  if (!path || path === "/") {
    return `/${sub}`;
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `/${sub}${normalized}`;
}

export function isApexBareTenantAppPath(pathname: string, hostname?: string): boolean {
  const host =
    hostname ??
    (typeof window !== "undefined" ? window.location.hostname : "");
  if (!isPlatformHost(host)) {
    return false;
  }
  if (getTenantBasepath(pathname, host)) {
    return false;
  }
  const segment = pathname.replace(/^\/+|\/+$/g, "").split("/")[0]?.toLowerCase() ?? "";
  return segment !== "" && TENANT_APP_ROOT_SEGMENTS.has(segment);
}

/** msht.io / www.msht.io — platform homepage, no tenant. */
export function isPlatformHost(hostname?: string): boolean {
  const host = (hostname ?? (typeof window !== "undefined" ? window.location.hostname : ""))
    .toLowerCase()
    .trim();
  if (!host) {
    return true;
  }
  if (host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return import.meta.env.VITE_DEV_TENANT !== "true";
  }
  const apex = apexDomain();
  return host === apex || host === `www.${apex}`;
}

export function isApexHostname(hostname: string): boolean {
  return isPlatformHost(hostname);
}

/**
 * Tenant subdomain from hostname, or null on platform apex.
 * m1.msht.io → "m1", msht.io → null
 */
export function parseSubdomain(hostname: string): string | null {
  const host = hostname.toLowerCase().trim();
  if (!host) {
    return null;
  }

  if (host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return import.meta.env.VITE_DEV_TENANT === "true" ? envSubdomainFallback() : null;
  }

  const apex = apexDomain();
  if (host === apex || host === `www.${apex}`) {
    return null;
  }

  const suffix = `.${apex}`;
  if (host.endsWith(suffix)) {
    const label = host.slice(0, -suffix.length);
    if (!label || label === "www") {
      return null;
    }
    const sub = label.split(".")[0];
    return sub && sub !== "www" ? sub : null;
  }

  if (host.endsWith(".localhost")) {
    const sub = host.replace(/\.localhost$/, "").split(".")[0];
    return sub && sub !== "www" ? sub : null;
  }

  const parts = host.split(".").filter(Boolean);
  if (parts.length >= 3 && parts[0] !== "www") {
    return parts[0];
  }

  return null;
}

/** Public URL for a complex: https://msht.io/m101 (path-based on apex). */
export function tenantUrl(subdomain: string, subPath = ""): string {
  const sub = subdomain.trim().toLowerCase();
  const suffix = subPath ? (subPath.startsWith("/") ? subPath : `/${subPath}`) : "";
  if (typeof window !== "undefined") {
    const host = window.location.hostname.toLowerCase();
    const port = window.location.port ? `:${window.location.port}` : "";
    const protocol = window.location.protocol;
    if (host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      return `${protocol}//${host}${port}/${sub}${suffix}`;
    }
    if (host.endsWith(".localhost")) {
      const portLocal = window.location.port ? `:${window.location.port}` : "";
      return `${window.location.protocol}//${host}${portLocal}/${sub}${suffix}`;
    }
  }
  return `https://${apexDomain()}/${sub}${suffix}`;
}

/** @deprecated Prefer tenantUrl — kept for callers; now returns path URL on production apex. */
export function tenantOrigin(subdomain: string): string {
  return tenantUrl(subdomain);
}

export function isPlatformMode(): boolean {
  return cachedPlatformMode;
}

function normalizeHexColor(input: string): string {
  const raw = input.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(raw)) {
    return raw;
  }
  if (/^#[0-9A-Fa-f]{3}$/.test(raw)) {
    const r = raw[1];
    const g = raw[2];
    const b = raw[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return PLATFORM_BRAND.primaryColor;
}

function mixHex(hex: string, amount: number): string {
  const n = normalizeHexColor(hex).slice(1);
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const mix = (c: number) => Math.max(0, Math.min(255, Math.round(c + (255 - c) * amount)));
  const toHex = (c: number) => c.toString(16).padStart(2, "0");
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

export function applyTenantTheme(tenant: TenantInfo | Pick<TenantInfo, "primary_color" | "theme_key">): void {
  if (typeof document === "undefined") {
    return;
  }
  const theme = getBrandTheme(tenant.theme_key);
  const primary = normalizeHexColor(tenant.primary_color || theme.primary);
  const secondary = normalizeHexColor(theme.secondary ?? mixHex(primary, 0.22));
  const light = mixHex(primary, 0.22);
  const root = document.documentElement;
  root.style.setProperty("--primary", primary);
  root.style.setProperty("--ring", primary);
  root.style.setProperty("--gold", primary);
  root.style.setProperty("--tenant-primary", primary);

  const gradientBg = theme.gradient
    ? `linear-gradient(135deg, ${primary}, ${secondary}, ${primary})`
    : `linear-gradient(135deg, ${primary}, ${light}, ${primary})`;
  const textGradient = theme.gradient
    ? `linear-gradient(135deg, ${primary}, ${secondary})`
    : `linear-gradient(135deg, ${primary}, ${light})`;

  let styleEl = document.getElementById("tenant-theme") as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "tenant-theme";
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `
    .gold-gradient {
      background: ${gradientBg};
    }
    .gold-text {
      background: ${textGradient};
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .gold-glow {
      box-shadow: 0 0 30px color-mix(in srgb, ${primary} 25%, transparent),
                  0 0 60px color-mix(in srgb, ${primary} 12%, transparent);
    }
  `;
}

export function applyPlatformTheme(): void {
  applyTenantTheme({ primary_color: PLATFORM_BRAND.primaryColor, theme_key: "navy" });
  if (typeof document !== "undefined") {
    document.title = PLATFORM_BRAND.name;
  }
}

export function tenantLogoUrl(tenant: TenantInfo): string | null {
  const url = tenant.logo_url?.trim();
  return url ? url : null;
}

function parseTenantRow(row: TenantInfo, sub: string): TenantInfo {
  const themeKey = getBrandTheme(row.theme_key).key;
  return {
    id: row.id,
    name: row.name,
    logo_url: row.logo_url?.trim() ? row.logo_url.trim() : null,
    primary_color: row.primary_color || getBrandTheme(themeKey).primary,
    theme_key: themeKey,
    subdomain: row.subdomain || sub,
  };
}

async function fetchTenantFromApi(subdomain: string): Promise<TenantInfo> {
  const sub = subdomain.trim().toLowerCase();
  const res = await fetch(apiUrl(`/tenant-info?subdomain=${encodeURIComponent(sub)}`));
  const text = await res.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      throw new Error("استجابة غير صالحة من الخادم");
    }
  }
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  const row = body as TenantInfo;
  return parseTenantRow(row, sub);
}

export async function fetchTenantBySubdomain(subdomain: string): Promise<TenantInfo> {
  const sub = subdomain.trim().toLowerCase();
  if (!sub) {
    throw new Error("subdomain مطلوب");
  }
  return fetchTenantFromApi(sub);
}

export type TenantResolveResult = {
  id: number;
  name: string;
  subdomain: string;
  url: string;
};

/** Find complex by subdomain slug or Arabic/English name (platform homepage). */
export async function resolveComplexQuery(query: string): Promise<TenantResolveResult> {
  const q = query.trim();
  if (!q) {
    throw new Error("أدخل اسم المجمع");
  }
  const res = await fetch(apiUrl(`/tenant-resolve?q=${encodeURIComponent(q)}`));
  const text = await res.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error("استجابة غير صالحة من الخادم");
    }
  }
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? "المجمع غير موجود");
  }
  const row = body as TenantResolveResult;
  return {
    ...row,
    url: row.url || tenantUrl(row.subdomain),
  };
}

export type ComplexRegisterInput = {
  name: string;
  subdomain?: string;
  manager_name: string;
  contact_phone: string;
  manager_code: string;
};

export type NextSubdomainResult = {
  subdomain: string;
  url: string;
};

export async function fetchNextSubdomain(): Promise<NextSubdomainResult> {
  const res = await fetch(apiUrl("/next-subdomain"));
  const text = await res.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error("استجابة غير صالحة من الخادم");
    }
  }
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? "تعذّر جلب عضوية المجمع");
  }
  const row = body as NextSubdomainResult;
  return {
    subdomain: row.subdomain,
    url: row.url || tenantUrl(row.subdomain),
  };
}

export async function registerNewComplex(input: ComplexRegisterInput): Promise<TenantResolveResult> {
  const res = await fetch(apiUrl("/complex-register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const text = await res.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error("استجابة غير صالحة من الخادم");
    }
  }
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? "تعذّر تسجيل المجمع");
  }
  const row = body as TenantResolveResult & { ok?: boolean };
  return {
    id: row.id,
    name: row.name,
    subdomain: row.subdomain,
    url: tenantUrl(row.subdomain),
  };
}

export function setCachedTenant(tenant: TenantInfo | null, platform = false): void {
  cachedTenant = tenant;
  cachedPlatformMode = platform;
  if (platform) {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem("qs_complex");
      sessionStorage.removeItem("qs_tenant_subdomain");
      sessionStorage.removeItem("qs_tenant_name");
    }
    applyPlatformTheme();
    return;
  }
  if (!tenant) {
    return;
  }
  ensureTenantIsolation(tenant);
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem("qs_complex", String(tenant.id));
    sessionStorage.setItem("qs_tenant_subdomain", tenant.subdomain);
    sessionStorage.setItem("qs_tenant_name", tenant.name);
  }
  applyTenantTheme(tenant);
  if (typeof document !== "undefined") {
    document.title = tenant.name;
  }
}

export function getCachedTenant(): TenantInfo | null {
  return cachedTenant;
}

export function getActiveComplexId(): number | undefined {
  if (cachedPlatformMode) {
    return undefined;
  }
  if (cachedTenant?.id) {
    return cachedTenant.id;
  }
  if (typeof sessionStorage !== "undefined") {
    const fromSession = sessionStorage.getItem("qs_complex");
    if (fromSession) {
      const n = Number(fromSession);
      if (Number.isFinite(n) && n > 0) {
        return n;
      }
    }
  }
  const raw = import.meta.env.VITE_COMPLEX_ID;
  if (raw !== undefined && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) {
      return n;
    }
  }
  return undefined;
}

export async function resolveTenantFromLocation(
  hostname?: string,
  pathname?: string,
): Promise<TenantInfo | null> {
  const host = hostname ?? (typeof window !== "undefined" ? window.location.hostname : "");
  const path = pathname ?? (typeof window !== "undefined" ? window.location.pathname : "");

  if (isPlatformHost(host)) {
    const pathSlug = parseTenantSlugFromPath(path);
    if (pathSlug) {
      const tenant = await fetchTenantBySubdomain(pathSlug);
      setCachedTenant(tenant, false);
      return tenant;
    }
    setCachedTenant(null, true);
    return null;
  }

  const subdomain = parseSubdomain(host);
  if (!subdomain) {
    throw new Error("تعذّر تحديد المجمع من الرابط");
  }

  const tenant = await fetchTenantBySubdomain(subdomain);
  setCachedTenant(tenant, false);
  return tenant;
}

/** @deprecated Use resolveTenantFromLocation */
export async function resolveTenantFromHostname(hostname?: string): Promise<TenantInfo | null> {
  return resolveTenantFromLocation(hostname);
}
