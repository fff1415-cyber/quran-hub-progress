import type { EvaluationSettings } from "@/lib/evaluation-types";
import { DEFAULT_EVALUATION_SETTINGS } from "@/lib/evaluation-types";
import { getToken } from "@/lib/cloud-sync";

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const KEY_LOCAL = "qshatawi_evaluation_settings_v1";

function apiUrl(path: string): string {
  if (!API_BASE) throw new Error("VITE_API_URL is not configured");
  const qIndex = path.indexOf("?");
  const pathname = qIndex >= 0 ? path.slice(0, qIndex) : path;
  const query = qIndex >= 0 ? path.slice(qIndex + 1) : "";
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  let url = `${API_BASE}/api/r.php?path=${encodeURIComponent(p)}`;
  if (query) url += `&${query}`;
  return url;
}

function readLocal(): EvaluationSettings {
  if (typeof window === "undefined") return { ...DEFAULT_EVALUATION_SETTINGS };
  const raw = localStorage.getItem(KEY_LOCAL);
  if (!raw) return { ...DEFAULT_EVALUATION_SETTINGS };
  try {
    return { ...DEFAULT_EVALUATION_SETTINGS, ...(JSON.parse(raw) as EvaluationSettings) };
  } catch {
    return { ...DEFAULT_EVALUATION_SETTINGS };
  }
}

function writeLocal(settings: EvaluationSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_LOCAL, JSON.stringify(settings));
}

function isDbUnavailableError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const m = e.message;
  return m.includes("migrate-evaluation-settings") || m.includes("HTTP 503");
}

async function evalFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  if (!token) throw new Error("غير مسجل الدخول");
  const res = await fetch(apiUrl(path), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const text = await res.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`HTTP ${res.status}`);
    }
  }
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return body as T;
}

export async function fetchEvaluationSettings(): Promise<EvaluationSettings> {
  try {
    const res = await evalFetch<{ settings: EvaluationSettings }>("/evaluation-settings");
    writeLocal(res.settings);
    return res.settings;
  } catch (e) {
    if (isDbUnavailableError(e)) {
      return readLocal();
    }
    throw e;
  }
}

export async function saveEvaluationSettings(settings: EvaluationSettings): Promise<EvaluationSettings> {
  try {
    const res = await evalFetch<{ settings: EvaluationSettings }>("/evaluation-settings", {
      method: "PUT",
      body: JSON.stringify({ settings }),
    });
    writeLocal(res.settings);
    return res.settings;
  } catch (e) {
    if (isDbUnavailableError(e)) {
      writeLocal(settings);
      return settings;
    }
    throw e;
  }
}

export function getCachedEvaluationSettings(): EvaluationSettings {
  return readLocal();
}
