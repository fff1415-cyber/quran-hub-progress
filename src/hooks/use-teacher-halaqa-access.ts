import { useEffect, useRef, useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { ensureSessionFromToken, getToken } from "@/lib/auth-session";
import { syncFromCloud } from "@/lib/cloud-sync";
import type { Halaqa } from "@/lib/mock-data";
import {
  findHalaqaForTeacher,
  getSessionHalaqaId,
  persistSessionHalaqaId,
  pickTeacherHalaqaRedirectId,
  readLocalHalaqat,
  resolveTeacherHalaqaId,
} from "@/lib/teacher-halaqa-access";

export type TeacherHalaqaAccessState =
  | { phase: "loading" }
  | { phase: "redirect"; halaqaId: number }
  | { phase: "ready"; halaqa: Halaqa; halaqat: Halaqa[]; resolvedH: number }
  | { phase: "missing"; halaqat: Halaqa[]; resolvedH?: number };

function needsHalaqaSync(halaqat: Halaqa[], preferredH?: number): boolean {
  if (halaqat.length === 0) return true;
  if (!preferredH) return false;
  return !findHalaqaForTeacher(halaqat, preferredH);
}

/**
 * Resolve the teacher's halaqa after tenant sync completes.
 * Reads localStorage synchronously and runs one fallback cloud sync when needed.
 */
export function useTeacherHalaqaAccess(urlH: unknown): TeacherHalaqaAccessState {
  const { loading: tenantLoading } = useTenant();
  const syncGen = useRef(0);
  const syncAttempted = useRef(false);
  const [fallbackSyncing, setFallbackSyncing] = useState(false);
  const [cacheRevision, setCacheRevision] = useState(0);

  useEffect(() => {
    if (tenantLoading) {
      syncAttempted.current = false;
      setFallbackSyncing(false);
      return;
    }

    ensureSessionFromToken();

    if (!getToken()) return;

    const preferredH = resolveTeacherHalaqaId(urlH);
    const halaqat = readLocalHalaqat();
    if (!needsHalaqaSync(halaqat, preferredH)) {
      syncAttempted.current = false;
      return;
    }
    if (syncAttempted.current) return;

    syncAttempted.current = true;
    const gen = ++syncGen.current;
    setFallbackSyncing(true);
    void syncFromCloud().finally(() => {
      if (gen !== syncGen.current) return;
      setFallbackSyncing(false);
      setCacheRevision((n) => n + 1);
    });
  }, [tenantLoading, urlH]);

  useEffect(() => {
    if (tenantLoading || fallbackSyncing) return;
    ensureSessionFromToken();
    const preferredH = resolveTeacherHalaqaId(urlH);
    const halaqa = findHalaqaForTeacher(readLocalHalaqat(), preferredH);
    if (halaqa && getSessionHalaqaId() !== halaqa.id) {
      persistSessionHalaqaId(halaqa.id);
    }
  }, [tenantLoading, fallbackSyncing, urlH, cacheRevision]);

  void cacheRevision;

  if (tenantLoading || fallbackSyncing) {
    return { phase: "loading" };
  }

  ensureSessionFromToken();

  const halaqat = readLocalHalaqat();
  const preferredH = resolveTeacherHalaqaId(urlH);
  const halaqa = findHalaqaForTeacher(halaqat, preferredH);

  if (halaqa) {
    if (!preferredH || preferredH !== halaqa.id) {
      return { phase: "redirect", halaqaId: halaqa.id };
    }
    return { phase: "ready", halaqa, halaqat, resolvedH: halaqa.id };
  }

  const redirectId = pickTeacherHalaqaRedirectId(halaqat);
  if (redirectId) {
    return { phase: "redirect", halaqaId: redirectId };
  }

  return { phase: "missing", halaqat, resolvedH: preferredH };
}
