import { buildRphpUrl } from "@/lib/api-base";
import type { BrandThemeKey } from "@/lib/brand-themes";
import { getToken } from "@/lib/cloud-sync";
import type { TenantInfo } from "@/lib/tenant";

export type ComplexBranding = TenantInfo & {
  theme_key: BrandThemeKey;
};

async function brandingFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  if (!token) {
    throw new Error("يجب تسجيل الدخول كمدير");
  }
  const res = await fetch(buildRphpUrl(path), {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
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
    throw new Error((body as { error?: string }).error ?? "تعذّر حفظ الهوية");
  }
  return body as T;
}

export async function fetchComplexBranding(): Promise<ComplexBranding> {
  return brandingFetch<ComplexBranding>("/complex-branding");
}

export async function saveComplexTheme(themeKey: BrandThemeKey): Promise<ComplexBranding> {
  return brandingFetch<ComplexBranding>("/complex-branding", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ theme_key: themeKey }),
  });
}

export async function uploadComplexLogo(file: File): Promise<ComplexBranding> {
  const token = getToken();
  if (!token) {
    throw new Error("يجب تسجيل الدخول كمدير");
  }
  const form = new FormData();
  form.append("logo", file);
  const res = await fetch(buildRphpUrl("/complex-branding/logo"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
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
    throw new Error((body as { error?: string }).error ?? "تعذّر رفع الشعار");
  }
  return body as ComplexBranding;
}

export async function deleteComplexLogo(): Promise<ComplexBranding> {
  return brandingFetch<ComplexBranding>("/complex-branding/logo", { method: "DELETE" });
}

export function brandingToTenant(row: ComplexBranding): TenantInfo {
  return {
    id: row.id,
    name: row.name,
    logo_url: row.logo_url,
    primary_color: row.primary_color,
    theme_key: row.theme_key,
    subdomain: row.subdomain,
  };
}
