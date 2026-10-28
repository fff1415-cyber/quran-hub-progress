import { buildRphpUrl } from "@/lib/api-base";
import type { EvaluationSettings } from "@/lib/evaluation-types";
import { DEFAULT_EVALUATION_SETTINGS } from "@/lib/evaluation-types";
import { getToken } from "@/lib/auth-session";
import { getActiveComplexId } from "@/lib/tenant";

const KEY_LOCAL = "qshatawi_evaluation_settings_v1";

function apiUrl(path: string): string {
  return buildRphpUrl(path);
}

function readLocal(): EvaluationSettings {
  if (typeof window === "undefined") return { ...DEFAULT_EVALUATION_SETTINGS };
  const raw = localStorage.getItem(`${KEY_LOCAL}:complex:${getActiveComplexId() ?? "none"}`);
  if (!raw) return { ...DEFAULT_EVALUATION_SETTINGS };
  try {
    return { ...DEFAULT_EVALUATION_SETTINGS, ...(JSON.parse(raw) as EvaluationSettings) };
  } catch {
    return { ...DEFAULT_EVALUATION_SETTINGS };
  }
}

function writeLocal(settings: EvaluationSettings): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(`${KEY_LOCAL}:complex:${getActiveComplexId() ?? "none"}`, JSON.stringify(settings)); } catch { /* Server confirmation remains authoritative if the cache is full. */ }
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

function sessionContext() { return { token:getToken(), complex:getActiveComplexId() }; }
let latestRequest = 0;
function assertContext(before: ReturnType<typeof sessionContext>) {
  const now=sessionContext(); if(now.token!==before.token || now.complex!==before.complex) throw new Error("تغيّرت الجلسة أثناء تحميل إعدادات التقييم؛ أعد المحاولة");
}
export async function fetchEvaluationSettings(): Promise<EvaluationSettings> {
  const request = ++latestRequest;
  const context=sessionContext();
  const res=await evalFetch<{settings:EvaluationSettings}>("/evaluation-settings");
  assertContext(context);
  if (request !== latestRequest) throw new Error("وصلت استجابة إعدادات أقدم — أعد تحميل المعتمد من الخادم");
  const settings = confirmedSettings(res.settings); writeLocal(settings); return settings;
}
export async function saveEvaluationSettings(settings: EvaluationSettings): Promise<EvaluationSettings> {
  const request = ++latestRequest;
  const context=sessionContext();
  const res=await evalFetch<{settings:EvaluationSettings}>("/evaluation-settings",{method:"PUT",body:JSON.stringify({settings})});
  assertContext(context);
  if (request !== latestRequest) throw new Error("وصلت استجابة إعدادات أقدم — أعد تحميل المعتمد من الخادم");
  const confirmed = confirmedSettings(res.settings); writeLocal(confirmed); return confirmed;
}

function confirmedSettings(value: unknown): EvaluationSettings {
  if (!value || typeof value !== "object" || Object.keys(DEFAULT_EVALUATION_SETTINGS).some(key => typeof (value as Record<string, unknown>)[key] !== "number" || !Number.isFinite((value as Record<string, number>)[key]))) {
    throw new Error("لم يؤكد الخادم إعدادات تقييم صالحة؛ أعد المحاولة");
  }
  return value as EvaluationSettings;
}

export function getCachedEvaluationSettings(): EvaluationSettings {
  return readLocal();
}
