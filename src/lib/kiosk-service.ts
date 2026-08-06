import { buildRphpUrl } from "@/lib/api-base";
import { getToken } from "@/lib/cloud-sync";
import type { BrandThemeKey } from "@/lib/brand-themes";

export type KioskBranding = {
  brandName: string;
  logoUrl: string | null;
  primaryColor: string;
  themeKey: BrandThemeKey;
};

export type KioskScanPhase = "before" | "present" | "late" | "closed" | "unknown";

export type KioskScanWindow = {
  phase: KioskScanPhase;
  message: string;
  asrTime: string | null;
  openAt: string | null;
  presentUntilAt: string | null;
  closeAt: string | null;
  openMinutesAfterAsr: number;
  presentMinutesAfterAsr: number;
  closeMinutesAfterAsr: number;
  secondsUntilOpen: number;
  secondsUntilPresentEnd: number;
  secondsUntilClose: number;
  timezone: string;
  city: string;
};

export type KioskSession = KioskBranding & {
  ok: boolean;
  scanWindow: KioskScanWindow;
};

export type KioskCheckInStatus =
  | "success"
  | "success_late"
  | "already_checked_in"
  | "invalid_qr"
  | "not_working_day"
  | "window_not_open"
  | "window_closed"
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
  openMinutesAfterAsr: number;
  presentMinutesAfterAsr: number;
  closeMinutesAfterAsr: number;
  city: string;
  country: string;
  prayerMethod: number;
};

export type KioskSettingsResponse = KioskBranding & {
  settings: KioskSettings;
  kioskUrl: string;
  scanWindow?: KioskScanWindow;
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

function normalizeScanWindow(raw: unknown): KioskScanWindow {
  const w = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const phase = w.phase;
  const validPhase: KioskScanPhase =
    phase === "before" || phase === "present" || phase === "late" || phase === "closed" || phase === "unknown"
      ? phase
      : phase === "open"
        ? "present"
        : "unknown";
  return {
    phase: validPhase,
    message: String(w.message ?? ""),
    asrTime: typeof w.asrTime === "string" ? w.asrTime : null,
    openAt: typeof w.openAt === "string" ? w.openAt : null,
    presentUntilAt: typeof w.presentUntilAt === "string" ? w.presentUntilAt : null,
    closeAt: typeof w.closeAt === "string" ? w.closeAt : null,
    openMinutesAfterAsr: Number(w.openMinutesAfterAsr ?? w.open_minutes_after_asr ?? 0) || 0,
    presentMinutesAfterAsr: Number(w.presentMinutesAfterAsr ?? w.present_minutes_after_asr ?? 20) || 20,
    closeMinutesAfterAsr: Number(w.closeMinutesAfterAsr ?? w.close_minutes_after_asr ?? 55) || 55,
    secondsUntilOpen: Number(w.secondsUntilOpen ?? 0) || 0,
    secondsUntilPresentEnd: Number(w.secondsUntilPresentEnd ?? 0) || 0,
    secondsUntilClose: Number(w.secondsUntilClose ?? 0) || 0,
    timezone: String(w.timezone ?? "Asia/Riyadh"),
    city: String(w.city ?? "Buraydah"),
  };
}

function normalizeSettings(raw: unknown): KioskSettings {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const open = Number(s.openMinutesAfterAsr ?? s.open_minutes_after_asr ?? 0);
  const present = Number(s.presentMinutesAfterAsr ?? s.present_minutes_after_asr ?? 20);
  const close = Number(s.closeMinutesAfterAsr ?? s.close_minutes_after_asr ?? 55);
  return {
    enabled: Boolean(s.enabled),
    token: String(s.token ?? ""),
    openMinutesAfterAsr: Number.isFinite(open) ? Math.min(180, Math.max(0, open)) : 0,
    presentMinutesAfterAsr: Number.isFinite(present) ? Math.min(180, Math.max(0, present)) : 20,
    closeMinutesAfterAsr: Number.isFinite(close) ? Math.min(180, Math.max(1, close)) : 55,
    city: String(s.city ?? "Buraydah"),
    country: String(s.country ?? "Saudi Arabia"),
    prayerMethod: Number(s.prayerMethod ?? s.prayer_method ?? 4) || 4,
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
  return {
    ok: Boolean(body.ok),
    ...normalizeBranding(body),
    scanWindow: normalizeScanWindow(body.scanWindow),
  };
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

function mapSettingsResponse(body: Record<string, unknown>): KioskSettingsResponse {
  return {
    ...normalizeBranding(body),
    settings: normalizeSettings(body.settings),
    kioskUrl: String(body.kioskUrl ?? ""),
    scanWindow: body.scanWindow ? normalizeScanWindow(body.scanWindow) : undefined,
  };
}

export async function fetchKioskSettings(): Promise<KioskSettingsResponse> {
  const body = await kioskSettingsFetch<Record<string, unknown>>("/kiosk/settings");
  return mapSettingsResponse(body);
}

export async function saveKioskSettings(input: {
  enabled?: boolean;
  regenerate?: boolean;
  openMinutesAfterAsr?: number;
  presentMinutesAfterAsr?: number;
  closeMinutesAfterAsr?: number;
  city?: string;
  country?: string;
  prayerMethod?: number;
}): Promise<KioskSettingsResponse> {
  const body = await kioskSettingsFetch<Record<string, unknown>>("/kiosk/settings", {
    method: "PUT",
    body: JSON.stringify({
      enabled: input.enabled,
      regenerate: input.regenerate,
      open_minutes_after_asr: input.openMinutesAfterAsr,
      present_minutes_after_asr: input.presentMinutesAfterAsr,
      close_minutes_after_asr: input.closeMinutesAfterAsr,
      city: input.city,
      country: input.country,
      prayer_method: input.prayerMethod,
    }),
  });
  return mapSettingsResponse(body);
}

export function buildKioskPageUrl(token: string): string {
  if (typeof window === "undefined") {
    return `/kiosk?token=${encodeURIComponent(token)}`;
  }
  return `${window.location.origin}/kiosk?token=${encodeURIComponent(token)}`;
}

/** Format HH:mm (24h) to 12h Arabic-friendly label. */
export function formatKioskClock(hhmm: string | null | undefined): string {
  if (!hhmm) {
    return "—";
  }
  const [hRaw, mRaw] = hhmm.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return hhmm;
  }
  const period = h >= 12 ? "م" : "ص";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function isKioskScanAllowed(window: KioskScanWindow): boolean {
  return window.phase === "present" || window.phase === "late";
}
