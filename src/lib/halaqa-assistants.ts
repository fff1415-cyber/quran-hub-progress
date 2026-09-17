import type { Halaqa, Student } from "@/lib/mock-data";

export type HalaqaAssistant = { name: string; code: string };

function normalizePersonName(name: string): string {
  return name
    .trim()
    .replace(/^أ\.?\s*/u, "")
    .replace(/\s+/g, " ");
}

export function namesMatch(stored: string, candidate: string): boolean {
  const a = normalizePersonName(stored);
  const b = normalizePersonName(candidate);
  if (!a || !b || a === "—") return false;
  return a === b || a.includes(b) || b.includes(a);
}

function isValidAssistantEntry(a: HalaqaAssistant): boolean {
  return !!(a.name.trim() && a.name.trim() !== "—") || !!a.code.trim();
}

function parseExtraAssistants(raw: unknown): HalaqaAssistant[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      return {
        name: String(row.name ?? ""),
        code: String(row.code ?? ""),
      };
    })
    .filter((a): a is HalaqaAssistant => !!a);
}

/** Saved/cloud extras — skip empty draft rows. */
export function normalizeExtraAssistants(raw: unknown): HalaqaAssistant[] {
  return parseExtraAssistants(raw).filter(isValidAssistantEntry);
}

/** UI editing — keep empty rows while the manager is typing. */
export function getExtraAssistants(halaqa: Halaqa): HalaqaAssistant[] {
  return parseExtraAssistants(halaqa.extraAssistants);
}

export function getAllAssistants(halaqa: Halaqa): HalaqaAssistant[] {
  const primary: HalaqaAssistant[] = [];
  const name = halaqa.assistantName?.trim() ?? "";
  const code = halaqa.assistantCode?.trim() ?? "";
  if ((name && name !== "—") || code) {
    primary.push({ name: name || "—", code });
  }
  return [...primary, ...normalizeExtraAssistants(halaqa.extraAssistants)];
}

export function hasMultipleAssistants(halaqa: Halaqa): boolean {
  return getAllAssistants(halaqa).length > 1;
}

export function findAssistantByCode(halaqa: Halaqa, code: string): HalaqaAssistant | undefined {
  const trimmed = code.trim();
  if (!trimmed) return undefined;
  return getAllAssistants(halaqa).find((a) => a.code.trim() === trimmed);
}

export function findAssistantByName(halaqa: Halaqa, name: string): HalaqaAssistant | undefined {
  return getAllAssistants(halaqa).find((a) => namesMatch(a.name, name));
}

export function findHalaqaByAssistantCode(
  halaqat: Halaqa[],
  code: string,
): { halaqa: Halaqa; assistant: HalaqaAssistant } | undefined {
  const trimmed = code.trim();
  if (!trimmed) return undefined;
  for (const halaqa of halaqat) {
    const assistant = findAssistantByCode(halaqa, trimmed);
    if (assistant) return { halaqa, assistant };
  }
  return undefined;
}

export function resolveAssistantCode(halaqa: Halaqa, sessionName: string): string | undefined {
  const match = findAssistantByName(halaqa, sessionName);
  return match?.code.trim() || undefined;
}

export function assistantDisplayLabel(halaqa: Halaqa, assistant: HalaqaAssistant): string {
  const trimmed = assistant.name.trim();
  if (trimmed && trimmed !== "—") return trimmed;
  return assistant.code.trim() || "مساعد";
}

export function isStudentAssignedToAssistant(
  student: Student,
  halaqa: Halaqa,
  assistantCode: string,
): boolean {
  if (student.assignedTo !== "assistant") return false;
  if (!hasMultipleAssistants(halaqa)) return true;
  const code = student.assignedAssistantCode?.trim();
  if (!code) return halaqa.assistantCode.trim() === assistantCode.trim();
  return code === assistantCode.trim();
}

export function studentVisibleToTeacher(student: Student): boolean {
  return student.assignedTo !== "assistant";
}

export function studentVisibleToAssistant(
  student: Student,
  halaqa: Halaqa,
  assistantCode: string,
): boolean {
  if (student.assignedTo === "teacher") return false;
  if (student.assignedTo !== "assistant") return true;
  return isStudentAssignedToAssistant(student, halaqa, assistantCode);
}

export function filterStudentsForGradeViewer(
  students: Student[],
  viewerRole: "teacher" | "assistant" | "manager",
  halaqa: Halaqa,
  assistantCode?: string,
): Student[] {
  if (viewerRole === "manager") return students;
  if (viewerRole === "teacher") {
    return students.filter((s) => studentVisibleToTeacher(s));
  }
  if (!assistantCode?.trim()) {
    return students.filter((s) => s.assignedTo !== "teacher");
  }
  return students.filter((s) => studentVisibleToAssistant(s, halaqa, assistantCode.trim()));
}

export function collectHalaqaStaffRows(
  halaqat: Halaqa[],
): { role: string; name: string; halaqaId: number; halaqaName: string }[] {
  const rows: { role: string; name: string; halaqaId: number; halaqaName: string }[] = [];
  for (const h of halaqat) {
    if (h.teacherName?.trim() && h.teacherName.trim() !== "—") {
      rows.push({
        role: "teacher",
        name: h.teacherName.trim(),
        halaqaId: h.id,
        halaqaName: h.name,
      });
    }
    for (const assistant of getAllAssistants(h)) {
      const name = assistant.name.trim();
      if (!name || name === "—") continue;
      rows.push({
        role: "assistant",
        name,
        halaqaId: h.id,
        halaqaName: h.name,
      });
    }
  }
  return rows;
}

export function assignmentLabel(student: Student, halaqa: Halaqa): string | null {
  if (!student.assignedTo) return null;
  if (student.assignedTo === "teacher") return "معلّم";
  if (!hasMultipleAssistants(halaqa)) return "مساعد";
  const code = student.assignedAssistantCode?.trim() || halaqa.assistantCode.trim();
  const assistant = findAssistantByCode(halaqa, code);
  return assistant ? assistantDisplayLabel(halaqa, assistant) : "مساعد";
}
