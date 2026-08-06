/**
 * Aggregate halaqa-level results for supervisor oversight.
 */
import type { AcademicCalendar } from "@/lib/academic-context";
import type { GradesStore, Halaqa, Student } from "@/lib/mock-data";
import {
  aggregateFaceProgress,
  facePct,
  resolveFaceQuotas,
  termFaceTargets,
} from "@/lib/plan-daily-faces";
import {
  getTotalSemesterWorkingDays,
  semesterComponentPercentages,
  semesterOverallPercentage,
  studentWeekComponentPercentages,
  studentWeekOverallPercentage,
  type ComponentPercentages,
} from "@/lib/semester-grading";

export interface TaskFaceMetrics {
  weekPct: number;
  semesterPct: number;
  actualFaces: number;
  termTargetFaces: number;
  facesProgressPct: number;
}

export interface HalaqaStudentResult {
  studentId: string;
  studentName: string;
  overallWeekPct: number;
  overallSemesterPct: number;
  hifz: TaskFaceMetrics;
  rabt: TaskFaceMetrics;
  muraja: TaskFaceMetrics;
  /** Talqeen only */
  attendance?: TaskFaceMetrics;
  wajib?: TaskFaceMetrics;
}

export interface HalaqaResultsSummary {
  halaqaId: number;
  halaqaName: string;
  isTalqeen: boolean;
  studentCount: number;
  overallWeekPct: number;
  overallSemesterPct: number;
  hifz: TaskFaceMetrics;
  rabt: TaskFaceMetrics;
  muraja: TaskFaceMetrics;
  attendance?: TaskFaceMetrics;
  wajib?: TaskFaceMetrics;
  students: HalaqaStudentResult[];
}

const EMPTY_TASK: TaskFaceMetrics = {
  weekPct: 0,
  semesterPct: 0,
  actualFaces: 0,
  termTargetFaces: 0,
  facesProgressPct: 0,
};

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function buildTaskMetrics(
  weekPct: number,
  semesterPct: number,
  actualFaces: number,
  termTargetFaces: number,
): TaskFaceMetrics {
  return {
    weekPct,
    semesterPct,
    actualFaces,
    termTargetFaces,
    facesProgressPct: facePct(actualFaces, termTargetFaces),
  };
}

function studentFaceTotals(
  student: Student,
  grades: GradesStore,
  calendar: AcademicCalendar,
): { hifzActual: number; rabtActual: number; murajaActual: number; hifzTarget: number; rabtTarget: number; murajaTarget: number } {
  const quotas = resolveFaceQuotas(student.levelType);
  const progress = aggregateFaceProgress(student.id, grades, calendar, quotas);
  const termDays = getTotalSemesterWorkingDays(calendar);
  const targets = termFaceTargets(quotas, termDays);

  return {
    hifzActual: progress.hifzActual,
    rabtActual: progress.rabtActual,
    murajaActual: progress.murajaActual,
    ...targets,
  };
}

function componentToTask(
  componentsWeek: ComponentPercentages,
  componentsSemester: ComponentPercentages,
  faces: ReturnType<typeof studentFaceTotals>,
  key: "hifz" | "rabt" | "muraja" | "attendance" | "wajib",
): TaskFaceMetrics {
  const faceKey = key === "hifz" ? "hifz" : key === "rabt" ? "rabt" : key === "muraja" ? "muraja" : null;
  if (faceKey) {
    return buildTaskMetrics(
      componentsWeek[faceKey],
      componentsSemester[faceKey],
      faces[`${faceKey}Actual` as "hifzActual" | "rabtActual" | "murajaActual"],
      faces[`${faceKey}Target` as "hifzTarget" | "rabtTarget" | "murajaTarget"],
    );
  }
  return buildTaskMetrics(componentsWeek[key], componentsSemester[key], 0, 0);
}

function computeStudentResult(
  student: Student,
  isTalqeen: boolean,
  grades: GradesStore,
  calendar: AcademicCalendar,
  weekNum: number,
): HalaqaStudentResult {
  const weekComponents = studentWeekComponentPercentages(
    student.id,
    student.levelType,
    isTalqeen,
    grades,
    calendar,
    weekNum,
  );
  const semesterComponents = semesterComponentPercentages(
    student.id,
    student.levelType,
    isTalqeen,
    grades,
    calendar,
  );
  const overallWeekPct = studentWeekOverallPercentage(
    student.id,
    isTalqeen,
    grades,
    weekNum,
    student.levelType,
  );
  const overallSemesterPct = semesterOverallPercentage(
    student.id,
    student.levelType,
    isTalqeen,
    grades,
    calendar,
  );

  if (isTalqeen) {
    return {
      studentId: student.id,
      studentName: student.name,
      overallWeekPct,
      overallSemesterPct,
      hifz: EMPTY_TASK,
      rabt: EMPTY_TASK,
      muraja: EMPTY_TASK,
      attendance: componentToTask(weekComponents, semesterComponents, studentFaceTotals(student, grades, calendar), "attendance"),
      wajib: componentToTask(weekComponents, semesterComponents, studentFaceTotals(student, grades, calendar), "wajib"),
    };
  }

  const faces = studentFaceTotals(student, grades, calendar);
  return {
    studentId: student.id,
    studentName: student.name,
    overallWeekPct,
    overallSemesterPct,
    hifz: componentToTask(weekComponents, semesterComponents, faces, "hifz"),
    rabt: componentToTask(weekComponents, semesterComponents, faces, "rabt"),
    muraja: componentToTask(weekComponents, semesterComponents, faces, "muraja"),
  };
}

function aggregateTasks(
  students: HalaqaStudentResult[],
  key: "hifz" | "rabt" | "muraja" | "attendance" | "wajib",
): TaskFaceMetrics {
  const rows = students
    .map((s) => s[key])
    .filter((t): t is TaskFaceMetrics => !!t);
  if (rows.length === 0) return EMPTY_TASK;

  return {
    weekPct: avg(rows.map((r) => r.weekPct)),
    semesterPct: avg(rows.map((r) => r.semesterPct)),
    actualFaces: sum(rows.map((r) => r.actualFaces)),
    termTargetFaces: sum(rows.map((r) => r.termTargetFaces)),
    facesProgressPct: facePct(
      sum(rows.map((r) => r.actualFaces)),
      sum(rows.map((r) => r.termTargetFaces)),
    ),
  };
}

export function computeHalaqaResults(
  halaqa: Halaqa,
  students: Student[],
  grades: GradesStore,
  calendar: AcademicCalendar,
): HalaqaResultsSummary {
  const halaqaStudents = students.filter((s) => s.halaqaId === halaqa.id);
  const weekNum = calendar.currentWeekNumber;
  const isTalqeen = halaqa.isTalqeen;

  const studentResults = halaqaStudents.map((s) =>
    computeStudentResult(s, isTalqeen, grades, calendar, weekNum),
  );

  const base: HalaqaResultsSummary = {
    halaqaId: halaqa.id,
    halaqaName: halaqa.name,
    isTalqeen,
    studentCount: studentResults.length,
    overallWeekPct: avg(studentResults.map((s) => s.overallWeekPct)),
    overallSemesterPct: avg(studentResults.map((s) => s.overallSemesterPct)),
    hifz: aggregateTasks(studentResults, "hifz"),
    rabt: aggregateTasks(studentResults, "rabt"),
    muraja: aggregateTasks(studentResults, "muraja"),
    students: studentResults.sort((a, b) => a.studentName.localeCompare(b.studentName, "ar")),
  };

  if (isTalqeen) {
    base.attendance = aggregateTasks(studentResults, "attendance");
    base.wajib = aggregateTasks(studentResults, "wajib");
  }

  return base;
}

export function computeAllHalaqaSummaries(
  halaqat: Halaqa[],
  students: Student[],
  grades: GradesStore,
  calendar: AcademicCalendar,
): HalaqaResultsSummary[] {
  return halaqat.map((h) => computeHalaqaResults(h, students, grades, calendar));
}
