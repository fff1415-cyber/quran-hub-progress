import type { PlanTrack } from "@/lib/plan-types";
import type { Student } from "@/lib/mock-data";
import {
  globalPhaseFromPlanLevel,
  instituteLevelFromGlobalPhase,
  nextGlobalPhase,
} from "@/lib/plan-level-ranges";

export function studentGlobalPhase(s: Student): number {
  if (s.phaseNumber && s.phaseNumber > 0) return s.phaseNumber;
  const n = parseInt(s.level, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function promoteStudentPhaseRecord(
  student: Student,
): { student: Student; newPhase: number; instituteLevel: string } | null {
  const current = studentGlobalPhase(student);
  const track = student.levelType as PlanTrack;
  const next = nextGlobalPhase(track, current);
  if (next === null) return null;
  const instituteLevel = instituteLevelFromGlobalPhase(track, next);
  if (!instituteLevel) return null;
  return {
    student: {
      ...student,
      phaseNumber: next,
      level: String(next),
      instituteLevel,
    },
    newPhase: next,
    instituteLevel,
  };
}

export async function promoteStudentPhase(studentId: string): Promise<string> {
  const { loadStudents, saveStudents } = await import("@/lib/mock-data");
  const all = loadStudents();
  const idx = all.findIndex((s) => s.id === studentId);
  if (idx < 0) return "—";
  const promoted = promoteStudentPhaseRecord(all[idx]);
  if (!promoted) return all[idx].level;
  all[idx] = promoted.student;
  saveStudents(all);
  try {
    const cloud = await import("@/lib/cloud-sync");
    await cloud.patchStudent(studentId, {
      level: promoted.student.level,
      phaseNumber: promoted.student.phaseNumber,
      instituteLevel: promoted.student.instituteLevel,
    });
  } catch {
    /* local saved */
  }
  return String(promoted.newPhase);
}

export async function syncStudentPhaseFromPlan(
  studentId: string,
  track: PlanTrack,
  planLevelNumber: number,
): Promise<void> {
  const globalPhase = globalPhaseFromPlanLevel(track, planLevelNumber);
  if (globalPhase === null) return;
  await syncStudentToGlobalPhase(studentId, globalPhase);
}

export async function syncStudentToGlobalPhase(studentId: string, globalPhase: number): Promise<void> {
  const { loadStudents, saveStudents } = await import("@/lib/mock-data");
  const all = loadStudents();
  const idx = all.findIndex((s) => s.id === studentId);
  if (idx < 0) return;
  const track = all[idx].levelType as PlanTrack;
  const instituteLevel = instituteLevelFromGlobalPhase(track, globalPhase);
  if (!instituteLevel) return;
  all[idx] = {
    ...all[idx],
    phaseNumber: globalPhase,
    level: String(globalPhase),
    instituteLevel,
  };
  saveStudents(all);
  try {
    const cloud = await import("@/lib/cloud-sync");
    await cloud.patchStudent(studentId, {
      level: String(globalPhase),
      phaseNumber: globalPhase,
      instituteLevel,
    });
  } catch {
    /* local saved */
  }
}
