import { z } from "zod";
import { decodeAuthTokenPayload, getAuthItem, setAuthItem } from "@/lib/auth-session";
import { getSessionName, getSessionRole } from "@/lib/session-role";
import { loadHalaqat, type Halaqa } from "@/lib/mock-data";

/** Normalize ?h= from URL (string/number/empty) to a positive id or undefined. */
export function parseHalaqaSearchParam(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export const halaqaSearchParamSchema = z.preprocess(
  parseHalaqaSearchParam,
  z.number().optional(),
);

export function getSessionHalaqaId(): number | undefined {
  return parseHalaqaSearchParam(getAuthItem("qs_halaqa"));
}

export function getTokenHalaqaId(): number | undefined {
  return decodeAuthTokenPayload()?.halaqaId;
}

export function resolveTeacherHalaqaId(urlH: unknown): number | undefined {
  return parseHalaqaSearchParam(urlH) ?? getSessionHalaqaId() ?? getTokenHalaqaId();
}

export function persistSessionHalaqaId(id: number): void {
  setAuthItem("qs_halaqa", String(id));
}

function normalizePersonName(name: string): string {
  return name
    .trim()
    .replace(/^أ\.?\s*/u, "")
    .replace(/\s+/g, " ");
}

function namesMatch(stored: string, candidate: string): boolean {
  const a = normalizePersonName(stored);
  const b = normalizePersonName(candidate);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export function findHalaqaById(halaqat: Halaqa[], id?: number): Halaqa | undefined {
  if (!id) return undefined;
  return halaqat.find((x) => Number(x.id) === id);
}

/** Match halaqa by id, else by teacher/assistant name from session or JWT. */
export function findHalaqaForTeacher(halaqat: Halaqa[], preferredId?: number): Halaqa | undefined {
  const byId = findHalaqaById(halaqat, preferredId);
  if (byId) return byId;

  const payload = decodeAuthTokenPayload();
  const role = getSessionRole() || payload?.role || "";
  const name = (getSessionName() || payload?.name || "").trim();
  if (!name) return undefined;

  if (role === "teacher") {
    return halaqat.find((h) => namesMatch(name, h.teacherName));
  }
  if (role === "assistant") {
    return halaqat.find((h) => namesMatch(name, h.assistantName));
  }
  return undefined;
}

/** Pick a halaqa id for redirect when ?h= is missing from the URL. */
export function pickTeacherHalaqaRedirectId(halaqat: Halaqa[]): number | undefined {
  const matched = findHalaqaForTeacher(halaqat, resolveTeacherHalaqaId(undefined));
  if (matched) return matched.id;

  const role = getSessionRole() || decodeAuthTokenPayload()?.role || "";
  const elevated = role === "manager" || role === "secretary" || role === "supervisor";
  if (elevated && halaqat[0]) return halaqat[0].id;

  if ((role === "teacher" || role === "assistant") && halaqat.length === 1) {
    return halaqat[0].id;
  }

  return undefined;
}

export function readLocalHalaqat(): Halaqa[] {
  return loadHalaqat().map((h) => ({ ...h, id: Number(h.id) }));
}
