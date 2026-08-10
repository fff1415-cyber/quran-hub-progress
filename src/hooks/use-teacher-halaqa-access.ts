import { useEffect, useRef, useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { getToken } from "@/lib/auth-session";
import { syncFromCloud } from "@/lib/cloud-sync";
import type { Halaqa } from "@/lib/mock-data";
import {
  findHalaqaById,
  pickTeacherHalaqaRedirectId,
  readLocalHalaqat,
  resolveTeacherHalaqaId,
} from "@/lib/teacher-halaqa-access";

export type TeacherHalaqaAccessState =
  | { phase: "loading" }
  | { phase: "redirect"; halaqaId: number }
  | { phase: "ready"; halaqa: Halaqa; halaqat: Halaqa[]; resolvedH: number }
  | { phase: "missing"; halaqat: Halaqa[]; resolvedH?: number };

/**
 * Resolve the teacher's halaqa after tenant sync completes.
 * Reads localStorage synchronously (never stale React state) and runs one
 * fallback cloud sync if authenticated cache is still empty.
 */
export function useTeacherHalaqaAccess(urlH: unknown): TeacherHalaqaAccessState {
  const { loading: tenantLoading } = useTenant();
  const syncGen = useRef(0);
  const [fallbackSyncing, setFallbackSyncing] = useState(false);
  const [cacheRevision, setCacheRevision] = useState(0);

  useEffect(() => {
    if (tenantLoading) {
      setFallbackSyncing(false);
      return;
    }
    if (!getToken() || readLocalHalaqat().length > 0) return;

    const gen = ++syncGen.current;
    setFallbackSyncing(true);
    void syncFromCloud().finally(() => {
      if (gen !== syncGen.current) return;
      setFallbackSyncing(false);
      setCacheRevision((n) => n + 1);
    });
  }, [tenantLoading]);

  void cacheRevision;

  if (tenantLoading || fallbackSyncing) {
    return { phase: "loading" };
  }

  const halaqat = readLocalHalaqat();
  const resolvedH = resolveTeacherHalaqaId(urlH);

  if (!resolvedH) {
    const redirectId = pickTeacherHalaqaRedirectId(halaqat);
    if (redirectId) return { phase: "redirect", halaqaId: redirectId };
    return { phase: "missing", halaqat };
  }

  const halaqa = findHalaqaById(halaqat, resolvedH);
  if (!halaqa) {
    const redirectId = pickTeacherHalaqaRedirectId(halaqat);
    if (redirectId && redirectId !== resolvedH) {
      return { phase: "redirect", halaqaId: redirectId };
    }
    return { phase: "missing", halaqat, resolvedH };
  }

  return { phase: "ready", halaqa, halaqat, resolvedH };
}
