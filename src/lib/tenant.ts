import defaultLogo from "@/assets/shtaiwi-logo.png.asset.json";

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export type TenantInfo = {
  id: number;
  name: string;
  logo_url: string | null;
  primary_color: string;
  subdomain: string;
};

export const DEFAULT_TENANT: TenantInfo = {
  id: 1,
  name: "مجمع حلقات الشتيوي",
  logo_url: defaultLogo.url,
  primary_color: "#C9A227",
  subdomain: "m1",
};

let cachedTenant: TenantInfo | null = null;

function apiUrl(path: string): string {
  if (!API_BASE) {
    throw new Error("VITE_API_URL is not configured");
  }
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}/api/r.php?path=${encodeURIComponent(p)}`;
}

/** Extract tenant subdomain from hostname (e.g. m1.example.com → m1). */
export function parseSubdomain(hostname: string): string {
  const host = hostname.toLowerCase().trim();
  if (!host) {
    return envSubdomainFallback();
  }
  if (host === "localhost" || host.endsWith(".localhost") || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return envSubdomainFallback();
  }

  const parts = host.split(".").filter(Boolean);
  if (parts.length >= 3) {
    const sub = parts[0];
    if (sub !== "www") {
      return sub;
    }
  }

  return envSubdomainFallback();
}

function envSubdomainFallback(): string {
  const fromEnv = import.meta.env.VITE_SUBDOMAIN;
  if (typeof fromEnv === "string" && fromEnv.trim() !== "") {
    return fromEnv.trim().toLowerCase();
  }
  return DEFAULT_TENANT.subdomain;
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
  return DEFAULT_TENANT.primary_color;
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

/** Apply tenant brand color to CSS variables and gradient utility classes. */
export function applyTenantTheme(primaryColor: string): void {
  if (typeof document === "undefined") {
    return;
  }
  const primary = normalizeHexColor(primaryColor);
  const light = mixHex(primary, 0.22);
  const root = document.documentElement;
  root.style.setProperty("--primary", primary);
  root.style.setProperty("--ring", primary);
  root.style.setProperty("--gold", primary);
  root.style.setProperty("--tenant-primary", primary);

  let styleEl = document.getElementById("tenant-theme") as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "tenant-theme";
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `
    .gold-gradient {
      background: linear-gradient(135deg, ${primary}, ${light}, ${primary});
    }
    .gold-text {
      background: linear-gradient(135deg, ${primary}, ${light});
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

export function tenantLogoUrl(tenant: TenantInfo): string {
  return tenant.logo_url?.trim() || defaultLogo.url;
}

export async function fetchTenantBySubdomain(subdomain: string): Promise<TenantInfo> {
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
  return {
    id: row.id,
    name: row.name,
    logo_url: row.logo_url,
    primary_color: row.primary_color || DEFAULT_TENANT.primary_color,
    subdomain: row.subdomain || sub,
  };
}

export function setCachedTenant(tenant: TenantInfo): void {
  cachedTenant = tenant;
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem("qs_complex", String(tenant.id));
    sessionStorage.setItem("qs_tenant_subdomain", tenant.subdomain);
    sessionStorage.setItem("qs_tenant_name", tenant.name);
  }
  applyTenantTheme(tenant.primary_color);
  if (typeof document !== "undefined") {
    document.title = tenant.name;
  }
}

export function getCachedTenant(): TenantInfo | null {
  return cachedTenant;
}

/** Resolved complex id for API calls (tenant → session → env). */
export function getActiveComplexId(): number | undefined {
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

export async function resolveTenantFromHostname(hostname?: string): Promise<TenantInfo> {
  const host = hostname ?? (typeof window !== "undefined" ? window.location.hostname : "");
  const subdomain = parseSubdomain(host);
  const tenant = await fetchTenantBySubdomain(subdomain);
  setCachedTenant(tenant);
  return tenant;
}
