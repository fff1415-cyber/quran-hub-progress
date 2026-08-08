import {
  loadHalaqaProgramsAll,
  saveHalaqaPrograms,
  type HalaqaProgram,
} from "@/lib/halaqa-programs";

export type ScientificGradeField = "attendance" | "hifz" | "rabt" | "muraja";

export const SCIENTIFIC_PROGRAM_ID = "scientific-grades-auto";
export const SCIENTIFIC_PROGRAM_NAME = "درجات العلمي";

export function isScientificHalaqaProgram(program: HalaqaProgram): boolean {
  return program.id === SCIENTIFIC_PROGRAM_ID || program.kind === "scientific";
}

/** Ensure auto program exists with columns matching enabled fields. */
export function ensureScientificHalaqaProgram(
  halaqaId: number,
  enabledFields: ScientificGradeField[],
): HalaqaProgram {
  const all = loadHalaqaProgramsAll(halaqaId);
  const existing = all.find((p) => p.id === SCIENTIFIC_PROGRAM_ID);
  const program: HalaqaProgram = {
    id: SCIENTIFIC_PROGRAM_ID,
    name: SCIENTIFIC_PROGRAM_NAME,
    scheduleMode: "weekdays",
    weekdays: ["sun", "mon", "tue", "wed", "thu"],
    timesPerWeek: 1,
    levels: [{ label: "—", score: 0 }],
    sortOrder: existing?.sortOrder ?? -1,
    active: true,
    kind: "scientific",
    scientificFields: [...enabledFields],
  };

  const next = existing
    ? all.map((p) => (p.id === SCIENTIFIC_PROGRAM_ID ? program : p))
    : [program, ...all];

  saveHalaqaPrograms(halaqaId, next);
  return program;
}

export function filterStandardPrograms(programs: HalaqaProgram[]): HalaqaProgram[] {
  return programs.filter((p) => !isScientificHalaqaProgram(p));
}

export function findScientificProgram(programs: HalaqaProgram[]): HalaqaProgram | null {
  return programs.find(isScientificHalaqaProgram) ?? null;
}
