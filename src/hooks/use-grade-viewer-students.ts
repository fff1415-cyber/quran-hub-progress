import { useEffect, useMemo, useState } from "react";
import { loadHalaqat, loadStudents, STUDENTS_CHANGED_EVENT } from "@/lib/mock-data";
import {
  filterStudentsForGradeViewer,
  resolveAssistantCode,
} from "@/lib/halaqa-assistants";
import { getSessionName } from "@/lib/session-role";

export function useGradeViewerStudents(
  halaqaId: number,
  viewerRole: "teacher" | "assistant" | "manager",
) {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const refresh = () => setVersion((n) => n + 1);
    window.addEventListener(STUDENTS_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener(STUDENTS_CHANGED_EVENT, refresh); window.removeEventListener("storage", refresh); };
  }, []);
  return useMemo(() => {
    const halaqa = loadHalaqat().find((h) => h.id === halaqaId);
    const all = loadStudents().filter((s) => s.halaqaId === halaqaId);
    if (!halaqa) return all;
    const assistantCode =
      viewerRole === "assistant"
        ? resolveAssistantCode(halaqa, getSessionName() ?? "")
        : undefined;
    return filterStudentsForGradeViewer(all, viewerRole, halaqa, assistantCode);
  }, [halaqaId, viewerRole, version]);
}
