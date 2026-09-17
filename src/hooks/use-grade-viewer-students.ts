import { useMemo } from "react";
import { loadHalaqat, loadStudents } from "@/lib/mock-data";
import {
  filterStudentsForGradeViewer,
  resolveAssistantCode,
} from "@/lib/halaqa-assistants";
import { getSessionName } from "@/lib/session-role";

export function useGradeViewerStudents(
  halaqaId: number,
  viewerRole: "teacher" | "assistant" | "manager",
) {
  return useMemo(() => {
    const halaqa = loadHalaqat().find((h) => h.id === halaqaId);
    const all = loadStudents().filter((s) => s.halaqaId === halaqaId);
    if (!halaqa) return all;
    const assistantCode =
      viewerRole === "assistant"
        ? resolveAssistantCode(halaqa, getSessionName() ?? "")
        : undefined;
    return filterStudentsForGradeViewer(all, viewerRole, halaqa, assistantCode);
  }, [halaqaId, viewerRole]);
}
