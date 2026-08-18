import { useCallback, useEffect, useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { ensureSessionFromToken } from "@/lib/auth-session";
import { fetchHalaqatForComplex, isCloudSyncFresh } from "@/lib/cloud-sync";
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
  | {
      phase: "missing";
      halaqat: Halaqa[];
      resolvedH?: number;
      error?: string;
      retry: () => void;
    };

/**
 * Resolve teacher halaqa from API using the active tenant id.
 * React state holds the roster — localStorage is only a cache, not the source of truth.
 */
export function useTeacherHalaqaAccess(urlH: unknown): TeacherHalaqaAccessState {
  const { tenant, loading: tenantLoading, error: tenantError } = useTenant();
  const [halaqat, setHalaqat] = useState<Halaqa[]>([]);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const retry = useCallback(() => {
    setRetryToken((n) => n + 1);
  }, []);

  useEffect(() => {
    if (tenantLoading) {
      setFetching(true);
      return;
    }

    ensureSessionFromToken();

    const complexId = tenant?.id;
    if (!complexId) {
      const cached = readLocalHalaqat();
      setHalaqat(cached);
      setFetching(false);
      setFetchError(tenantError ?? (cached.length ? null : "تعذّر تحديد المجمع"));
      return;
    }

    let cancelled = false;
    setFetching(true);
    setFetchError(null);

    void (async () => {
      try {
        const cached = readLocalHalaqat();
        if (isCloudSyncFresh() && cached.length > 0) {
          if (cancelled) return;
          setHalaqat(cached);
          return;
        }

        const list = await fetchHalaqatForComplex(complexId);
        if (cancelled) return;
        const next = list.length > 0 ? list : readLocalHalaqat();
        setHalaqat(next);
        if (next.length === 0) {
          setFetchError("لم يتم العثور على حلقات في هذا المجمع");
        }
      } catch (e) {
        if (cancelled) return;
        const cached = readLocalHalaqat();
        setHalaqat(cached);
        setFetchError(
          cached.length > 0
            ? null
            : e instanceof Error
              ? e.message
              : "تعذّر تحميل الحلقات",
        );
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tenantLoading, tenant?.id, tenantError, retryToken]);

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

  return {
    phase: "missing",
    halaqat,
    resolvedH: preferredH,
    error: fetchError ?? undefined,
    retry,
  };
}
