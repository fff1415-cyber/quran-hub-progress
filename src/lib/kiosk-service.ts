import { buildRphpUrl } from "@/lib/api-base";
import { getToken } from "@/lib/cloud-sync";
import type { BrandThemeKey } from "@/lib/brand-themes";

export type KioskBranding = {
  brandName: string;
  logoUrl: string | null;
  primaryColor: string;
  themeKey: BrandThemeKey;
};

export type KioskSession = KioskBranding & {
  ok: boolean;
};

export type KioskCheckInStatus =
  | "success"
  | "already_checked_in"
  | "invalid_qr"
  | "not_working_day"
  | "error";

export type KioskCheckInResult = {
  status: KioskCheckInStatus;
  message: string;
  studentName?: string;
  week?: number;
  dayKey?: string;
};

export type KioskSettings = {
  enabled: boolean;
  token: string;
};

export type KioskSettingsResponse = KioskBranding & {
  settings: KioskSettings;
  kioskUrl: string;
};

function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) {
    return null;
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  if (typeof window !== "undefined") {
    return `${window.location.origin}${url.startsWith("/") ? url : `/${url}`}`;
  }
  return url;
}

function normalizeBranding(raw: Record<string, unknown>): KioskBranding {
  return {
    brandName: String(raw.brandName ?? raw.name ?? "المجمع"),
    logoUrl: resolveAssetUrl(
      typeof raw.logoUrl === "string"
        ? raw.logoUrl
        : typeof raw.logo_url === "string"
          ? raw.logo_url
          : null,
    ),
    primaryColor: String(raw.primaryColor ?? raw.primary_color ?? "#1e3a5f"),
    themeKey: (raw.themeKey ?? raw.theme_key ?? "navy") as BrandThemeKey,
  };
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
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
  return body as T;
}

export async function fetchKioskSession(token: string): Promise<KioskSession> {
  const res = await fetch(buildRphpUrl(`/kiosk/session?token=${encodeURIComponent(token)}`));
  const body = await parseJsonResponse<Record<string, unknown>>(res);
  return { ok: Boolean(body.ok), ...normalizeBranding(body) };
}

export async function kioskCheckIn(token: string, studentId: string): Promise<KioskCheckInResult> {
  const res = await fetch(buildRphpUrl("/kiosk/check-in"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Kiosk-Token": token,
    },
    body: JSON.stringify({ token, studentId }),
  });
  return parseJsonResponse<KioskCheckInResult>(res);
}

async function kioskSettingsFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const auth = getToken();
  if (!auth) {
    throw new Error("يجب تسجيل الدخول كمدير");
  }
  const res = await fetch(buildRphpUrl(path), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth}`,
      ...(options.headers ?? {}),
    },
  });
  return parseJsonResponse<T>(res);
}

export async function fetchKioskSettings(): Promise<KioskSettingsResponse> {
  const body = await kioskSettingsFetch<Record<string, unknown>>("/kiosk/settings");
  const settings = body.settings as KioskSettings | undefined;
  return {
    ...normalizeBranding(body),
    settings: {
      enabled: Boolean(settings?.enabled),
      token: String(settings?.token ?? ""),
    },
    kioskUrl: String(body.kioskUrl ?? ""),
  };
}

export async function saveKioskSettings(input: {
  enabled?: boolean;
  regenerate?: boolean;
}): Promise<KioskSettingsResponse> {
  const body = await kioskSettingsFetch<Record<string, unknown>>("/kiosk/settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });
  const settings = body.settings as KioskSettings | undefined;
  return {
    ...normalizeBranding(body),
    settings: {
      enabled: Boolean(settings?.enabled),
      token: String(settings?.token ?? ""),
    },
    kioskUrl: String(body.kioskUrl ?? ""),
  };
}

export function buildKioskPageUrl(token: string): string {
  if (typeof window === "undefined") {
    return `/kiosk?token=${encodeURIComponent(token)}`;
  }
  return `${window.location.origin}/kiosk?token=${encodeURIComponent(token)}`;
}
