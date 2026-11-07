export const LEGACY_GRADE_KEY = "qshatawi_grades_v2";
export const LEGACY_SEMESTER_KEY = "qshatawi_grades_semester_id";
type LocalCopy = { raw: string; semester: string | null };
type Scope = { complexId: number; halaqaId: number };
type Student = { id: string; name: string };
const gradeFields = new Set(["attendance", "hifz", "rabt", "muraja", "wajib", "compensationFaces", "testMuraja", "testRabt", "sard", "compensationMurajaFaces"]);
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
function at(value: unknown, key: string): unknown {
  return object(value) && !["__proto__", "constructor", "prototype"].includes(key) && Object.hasOwn(value, key) ? value[key] : undefined;
}
function parse(raw: string): unknown { try { return JSON.parse(raw); } catch { return undefined; } }
export function legacyGradeCopies(storage: Storage, archived: readonly LocalCopy[] = []): LocalCopy[] {
  const raw = storage.getItem(LEGACY_GRADE_KEY);
  const result = [...(raw && raw !== "{}" ? [{ raw, semester: storage.getItem(LEGACY_SEMESTER_KEY) }] : []), ...archived];
  return result.filter((copy, index) => result.findIndex(item => item.raw === copy.raw && item.semester === copy.semester) === index);
}
function openArchive(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("qhp-legacy-grade-recovery-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("copies");
    request.onsuccess = () => resolve(request.result);
    request.onerror = request.onblocked = () => reject(new Error("تعذّر فتح أرشيف التسجيلات المحلية"));
  });
}
export async function readLegacyArchive(): Promise<LocalCopy[]> {
  const db = await openArchive();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("copies", "readonly").objectStore("copies").getAll();
      request.onsuccess = () => resolve(request.result as LocalCopy[]);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
export async function archiveDisplacedLegacyCopy(raw: string | null) {
  if (!raw || raw === "{}") return;
  // Keep archives out of localStorage so they cannot consume the grade outbox quota.
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const key = Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, "0")).join("");
  const db = await openArchive();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("copies", "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
      tx.objectStore("copies").put({ raw, semester: null }, key);
    });
  } finally { db.close(); }
}
/** Accept only the current authenticated roster response, never a local cached roster. */
export function recoveryStudents(rows: unknown[], scope: Scope): Student[] {
  return rows.flatMap(row => object(row) && typeof row.id === "string" && typeof row.name === "string" &&
    Number(row.complex_id) === scope.complexId && Number(row.halaqa_id) === scope.halaqaId ? [{ id: row.id, name: row.name }] : []);
}
export function compareLegacyStudent(copy: LocalCopy, student: string, allowed: readonly Student[], confirmed: unknown, confirmedSemester: string | null) {
  if (!allowed.some(row => row.id === student)) return [];
  const weeks = at(parse(copy.raw), student);
  if (!object(weeks)) return [];
  const result: { path: string; local: string | number | boolean; confirmed?: unknown }[] = [];
  const samePeriod = copy.semester !== null && copy.semester === confirmedSemester;
  const visit = (old: unknown, saved: unknown, path: string[]) => {
    if (!object(old)) return;
    for (const key of Object.keys(old)) {
      const value = at(old, key), server = at(saved, key);
      if (gradeFields.has(key) && (typeof value === "string" || typeof value === "boolean" || typeof value === "number")) {
        if (!samePeriod || value !== server) result.push({ path: [...path, key].join(" / "), local: value, confirmed: samePeriod ? server : undefined });
      } else if (key === "days" || /^(sun|mon|tue|wed|thu|fri|sat|[1-9]\d{0,2})$/.test(key)) {
        visit(value, server, [...path, key]);
      }
    }
  };
  visit(weeks, at(confirmed, student), []);
  return result;
}
