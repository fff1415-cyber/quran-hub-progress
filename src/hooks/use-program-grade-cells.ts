import { useCallback, useEffect, useRef, useState } from "react";
import { decodeAuthTokenPayload, getToken } from "@/lib/auth-session";
import { GradeOutbox, type GradeSnapshot } from "@/lib/grade-outbox";
import type { HalaqaProgramGradesStore } from "@/lib/halaqa-programs";
import { secureProgramGradeOperation, secureProgramGradeSnapshot } from "@/lib/secure-data.functions";

type Snapshot = GradeSnapshot<HalaqaProgramGradesStore>;
const emptyGrades: HalaqaProgramGradesStore[string] = {};

export function useProgramGradeCells(halaqaId: number, semesterId: string | null) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draftCount, setDraftCount] = useState(0);
  const running = useRef(false);
  const token = getToken();
  const identity = decodeAuthTokenPayload(token);
  const cid = identity?.complexId;
  const scope = cid && identity?.role
    ? JSON.stringify(["program-grades", cid, identity.role, identity.accountId ?? [identity.halaqaId, identity.name]])
    : null;
  const synchronize = useCallback(async (
    send?: (box: GradeOutbox<HalaqaProgramGradesStore>) => Promise<void>,
  ) => {
    if (!token || !scope || running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    const box = new GradeOutbox<HalaqaProgramGradesStore>(localStorage, scope);
    try {
      await box.hydrate();
      if (send) await send(box);
      const remote = await secureProgramGradeSnapshot(token);
      if (getToken() !== token) return;
      if (remote.context_complex_id !== cid) throw Error("سجل درجات البرامج لا يطابق المجمع الحالي");
      box.accept(remote);
      setSnapshot(remote);
    } catch (error) {
      if (getToken() === token) setError(error instanceof Error ? error.message : "تعذّر تأكيد درجات البرامج");
    } finally {
      if (getToken() === token) setDraftCount(box.drafts().filter(d =>
        ["pending", "unbased", "conflict", "archived"].includes(d.status)).length);
      running.current = false;
      setBusy(false);
    }
  }, [cid, scope, token]);

  useEffect(() => {
    void synchronize();
    const refresh = () => void synchronize();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [synchronize]);

  const flush = (box: GradeOutbox<HalaqaProgramGradesStore>) =>
    box.flush(packet => secureProgramGradeOperation(token!, packet), () => getToken() === token);

  const ready = snapshot?.context_complex_id === cid && snapshot?.calendar_context.known &&
    snapshot.calendar_context.active_semester_id === semesterId && semesterId !== null;
  const setCell = (student: string, week: number, program: string, slot: string, value: string) => {
    if (!ready || !snapshot) return;
    void synchronize(async box => {
      if (box.snapshot()?.cursor !== snapshot.cursor) throw Error("تغيّرت نسخة درجات البرامج؛ حدّث البيانات قبل التسجيل");
      box.editCell(snapshot.value, [String(halaqaId), student, String(week), program, slot], value);
      await flush(box);
    });
  };

  const volatile = scope ? new GradeOutbox<HalaqaProgramGradesStore>(localStorage, scope).volatileDrafts() : [];
  return {
    grades: snapshot?.context_complex_id === cid ? snapshot?.value[halaqaId] ?? emptyGrades : emptyGrades,
    ready, busy, error, draftCount, setCell, volatile,
    retry: () => void synchronize(flush),
    refresh: () => void synchronize(),
  };
}
