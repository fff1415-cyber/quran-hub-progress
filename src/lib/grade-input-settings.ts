export type GradeInputMode = "dropdown" | "checkbox";

export type AttendanceOption = "present" | "late" | "excused" | "absent";
export type PassFailOption = "pass" | "fail";

export interface GradeFieldInputConfig<T extends string = string> {
  mode: GradeInputMode;
  options: T[];
}

export interface GradeInputSettings {
  attendance: GradeFieldInputConfig<AttendanceOption>;
  hifz: GradeFieldInputConfig;
  rabt: GradeFieldInputConfig<PassFailOption>;
  muraja: GradeFieldInputConfig<PassFailOption>;
  wajib: { mode: "checkbox" };
}

export const ATTENDANCE_OPTION_LABELS: Record<AttendanceOption, string> = {
  present: "حاضر",
  late: "متأخر",
  excused: "مستأذن",
  absent: "غائب",
};

export const PASS_FAIL_LABELS: Record<PassFailOption, string> = {
  pass: "مجتاز",
  fail: "راسب",
};

export const ALL_ATTENDANCE_OPTIONS: AttendanceOption[] = ["present", "late", "excused", "absent"];
export const ALL_PASS_FAIL_OPTIONS: PassFailOption[] = ["pass", "fail"];

export const ATTENDANCE_PRESETS: {
  id: string;
  label: string;
  options: AttendanceOption[];
}[] = [
  { id: "all", label: "كل الخيارات (حاضر · متأخر · مستأذن · غائب)", options: [...ALL_ATTENDANCE_OPTIONS] },
  { id: "present_absent", label: "حاضر وغائب فقط", options: ["present", "absent"] },
  { id: "present_late", label: "حاضر ومتأخر", options: ["present", "late"] },
  { id: "present_late_excused", label: "حاضر · متأخر · مستأذن", options: ["present", "late", "excused"] },
];

export const DEFAULT_GRADE_INPUT_SETTINGS: GradeInputSettings = {
  attendance: { mode: "dropdown", options: [...ALL_ATTENDANCE_OPTIONS] },
  hifz: { mode: "checkbox", options: [] },
  rabt: { mode: "checkbox", options: [...ALL_PASS_FAIL_OPTIONS] },
  muraja: { mode: "checkbox", options: [...ALL_PASS_FAIL_OPTIONS] },
  wajib: { mode: "checkbox" },
};

const KEY_LOCAL = "qshatawi_grade_input_settings_v1";

function normalizeOptions<T extends string>(options: T[], allowed: readonly T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const opt of options) {
    if (!allowed.includes(opt) || seen.has(opt)) continue;
    seen.add(opt);
    out.push(opt);
  }
  return out.length > 0 ? out : [...allowed];
}

export function normalizeGradeInputSettings(raw: Partial<GradeInputSettings> | null | undefined): GradeInputSettings {
  const base = DEFAULT_GRADE_INPUT_SETTINGS;
  if (!raw) return { ...base };

  return {
    attendance: {
      mode: raw.attendance?.mode === "checkbox" ? "checkbox" : "dropdown",
      options: normalizeOptions(raw.attendance?.options ?? base.attendance.options, ALL_ATTENDANCE_OPTIONS),
    },
    hifz: {
      mode: raw.hifz?.mode === "dropdown" ? "dropdown" : "checkbox",
      options: [],
    },
    rabt: {
      mode: raw.rabt?.mode === "checkbox" ? "checkbox" : "dropdown",
      options: normalizeOptions(raw.rabt?.options ?? base.rabt.options, ALL_PASS_FAIL_OPTIONS),
    },
    muraja: {
      mode: raw.muraja?.mode === "checkbox" ? "checkbox" : "dropdown",
      options: normalizeOptions(raw.muraja?.options ?? base.muraja.options, ALL_PASS_FAIL_OPTIONS),
    },
    wajib: { mode: "checkbox" },
  };
}

export function loadGradeInputSettings(): GradeInputSettings {
  if (typeof window === "undefined") return { ...DEFAULT_GRADE_INPUT_SETTINGS };
  const raw = localStorage.getItem(KEY_LOCAL);
  if (!raw) return { ...DEFAULT_GRADE_INPUT_SETTINGS };
  try {
    return normalizeGradeInputSettings(JSON.parse(raw) as Partial<GradeInputSettings>);
  } catch {
    return { ...DEFAULT_GRADE_INPUT_SETTINGS };
  }
}

export function saveGradeInputSettings(settings: GradeInputSettings): GradeInputSettings {
  const normalized = normalizeGradeInputSettings(settings);
  if (typeof window !== "undefined") {
    localStorage.setItem(KEY_LOCAL, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent("grade-input-settings-changed", { detail: normalized }));
  }
  return normalized;
}

export function attendancePresetId(options: AttendanceOption[]): string {
  const match = ATTENDANCE_PRESETS.find(
    (p) => p.options.length === options.length && p.options.every((o, i) => o === options[i]),
  );
  return match?.id ?? "custom";
}
