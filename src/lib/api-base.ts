/**
 * PHP API base URL for the browser bundle.
 *
 * Production / Hostinger: always same-origin `/api` (m1.msht.io/api, msht.io/api, …).
 * Local dev only: set VITE_API_URL=http://localhost:8080 in .env
 */
const INVALID_ENV_VALUES = new Set(["", "undefined", "null"]);

function readEnvApiUrl(): string {
  const raw = import.meta.env.VITE_API_URL;
  if (raw == null) {
    return "";
  }
  const trimmed = String(raw).trim().replace(/\/$/, "");
  if (INVALID_ENV_VALUES.has(trimmed.toLowerCase())) {
    return "";
  }
  return trimmed;
}

/** Empty string = same-origin relative paths. */
export function getApiBase(): string {
  return readEnvApiUrl();
}

/** Same-origin API router used by the PHP backend. */
export const API_ROUTER_PATH = "/api/r.php";

/** Build /api/r.php URL with optional path query string. */
export function buildRphpUrl(path: string): string {
  const qIndex = path.indexOf("?");
  const pathname = qIndex >= 0 ? path.slice(0, qIndex) : path;
  const query = qIndex >= 0 ? path.slice(qIndex + 1) : "";
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const base = getApiBase();
  const prefix = base ? `${base}${API_ROUTER_PATH}` : API_ROUTER_PATH;
  let url = `${prefix}?path=${encodeURIComponent(p)}`;
  if (query) {
    url += `&${query}`;
  }
  return url;
}
