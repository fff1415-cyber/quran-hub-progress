const LAYOUT_KEY = "qs_teacher_grade_layout_v1";

export type TeacherGradeLayoutMode = "auto" | "mobile" | "desktop";

export function loadTeacherGradeLayoutMode(): TeacherGradeLayoutMode {
  if (typeof window === "undefined") return "auto";
  const raw = localStorage.getItem(LAYOUT_KEY);
  if (raw === "mobile" || raw === "desktop" || raw === "auto") return raw;
  return "auto";
}

export function saveTeacherGradeLayoutMode(mode: TeacherGradeLayoutMode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LAYOUT_KEY, mode);
}

/** Mobile board = day tabs; desktop table = wide grid with consolidated compensation column. */
export function resolveTeacherGradeLayout(
  mode: TeacherGradeLayoutMode,
  deviceMobile: boolean,
): { useMobileBoard: boolean; compensationPerDay: boolean } {
  const useMobileBoard = mode === "mobile" || (mode === "auto" && deviceMobile);
  return {
    useMobileBoard,
    compensationPerDay: useMobileBoard,
  };
}

/** Day key for the single desktop compensation column (after Thu, before week %). */
export function desktopCompensationDayKey(visibleDayKeys: string[]): string {
  if (visibleDayKeys.includes("thu")) return "thu";
  return visibleDayKeys[visibleDayKeys.length - 1] ?? "thu";
}
