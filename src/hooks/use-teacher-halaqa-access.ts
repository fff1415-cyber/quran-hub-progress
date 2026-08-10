import { useEffect, useRef, useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { ensureSessionFromToken } from "@/lib/auth-session";
import { fetchHalaqatRoster } from "@/lib/cloud-sync";
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

function cacheHasHalaqa(halaqat: Halaqa[], preferredH?: number): boolean {
  if (halaqat.length === 0) return false;
  if (!preferredH) return true;
  return Boolean(findHalaqaForTeacher(halaqat, preferredH));
}

/**
 * Load halaqat for the teacher page directly from API when local cache is empty or stale.
 */
export function useTeacherHalaqaAccess(urlH: unknown): TeacherHalaqaAccessState {
  const { loading: tenantLoading } = useTenant();
  const fetchGen = useRef(0);
  const [halaqat, setHalaqat] = useState<Halaqa[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (tenantLoading) {
      setFetching(true);
      return;
    }

    ensureSessionFromToken();
    const preferredH = resolveTeacherHalaqaId(urlH);
    const cached = readLocalHalaqat();

    if (cacheHasHalaqa(cached, preferredH)) {
      setHalaqat(cached);
      setFetching(false);
      return;
    }

    const gen = ++fetchGen.current;
    setFetching(true);
    void fetchHalaqatRoster()
      .then((list) => {
        if (gen !== fetchGen.current) return;
        const next = list.length > 0 ? list : readLocalHalaqat();
        setHalaqat(next);
      })
      .catch(() => {
        if (gen !== fetchGen.current) return;
        setHalaqat(readLocalHalaqat());
      })
      .finally(() => {
        if (gen === fetchGen.current) setFetching(false);
      });
  }, [tenantLoading, urlH]);

  useEffect(() => {
    if (tenantLoading || fetching || halaqat.length === 0) return;
    ensureSessionFromToken();
    const preferredH = resolveTeacherHalaqaId(urlH);
    const halaqa = findHalaqaForTeacher(halaqat, preferredH);
    if (halaqa && getSessionHalaqaId() !== halaqa.id) {
      persistSessionHalaqaId(halaqa.id);
    }
  }, [tenantLoading, fetching, halaqat, urlH]);

  if (tenantLoading || fetching) {
    return { phase: "loading" };
  }

  ensureSessionFromToken();

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
