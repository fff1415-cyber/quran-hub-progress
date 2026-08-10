import { z } from "zod";
import { getAuthItem } from "@/lib/auth-session";
import { getSessionRole } from "@/lib/session-role";
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

export function resolveTeacherHalaqaId(urlH: unknown): number | undefined {
  return parseHalaqaSearchParam(urlH) ?? getSessionHalaqaId();
}

export function findHalaqaById(halaqat: Halaqa[], id?: number): Halaqa | undefined {
  if (!id) return undefined;
  return halaqat.find((x) => x.id === id);
}

/** Pick a halaqa id for redirect when ?h= is missing from the URL. */
export function pickTeacherHalaqaRedirectId(halaqat: Halaqa[]): number | undefined {
  const sessionId = getSessionHalaqaId();
  if (sessionId && halaqat.some((h) => h.id === sessionId)) return sessionId;

  const role = getSessionRole();
  const elevated = role === "manager" || role === "secretary" || role === "supervisor";
  if (elevated && halaqat[0]) return halaqat[0].id;

  if ((role === "teacher" || role === "assistant") && halaqat.length === 1) {
    return halaqat[0].id;
  }

  return undefined;
}

export function readLocalHalaqat(): Halaqa[] {
  return loadHalaqat();
}
