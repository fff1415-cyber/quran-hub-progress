// Mock data + localStorage store for مجمع حلقات الشتيوي

export type Role = "admin" | "teacher" | "assistant" | "musammi" | "student" | "parent";

export interface Halaqa {
  id: number;
  name: string;
  code: string;
  isTalqeen: boolean; // الحلقات 5 و 6
  teacher: string;
  assistant: string;
}

export interface Student {
  id: string;
  name: string;
  halaqaId: number;
  parentPhone: string;
  memorized: string; // المقاطع المحفوظة
}

export interface DayEntry {
  attendance: "present" | "late" | "excused" | "absent" | "";
  hifz: boolean;
  rabt: "pass" | "fail" | "";
  muraja: "pass" | "fail" | "";
  // talqeen halaqas:
  wajib?: boolean;
}

export interface WeekRecord {
  days: Record<string, DayEntry>; // sun..thu
  testMuraja: boolean;
  testRabt: boolean;
  sard: boolean;
  sardResults?: {
    sard1?: "pass" | "fail";
    sard2?: ("pass" | "fail")[];
    sard3?: ("pass" | "fail")[];
  };
}

export type GradesStore = Record<string, Record<number, WeekRecord>>;
// studentId -> week (1..18) -> WeekRecord

export const HALAQAT: Halaqa[] = [
  { id: 1, name: "حلقة عمرو بن شرحبيل", code: "2111", isTalqeen: false, teacher: "محمد", assistant: "سلمان" },
  { id: 2, name: "حلقة عبدالرحمن بن العلاء", code: "1211", isTalqeen: false, teacher: "محمد", assistant: "سلمان" },
  { id: 3, name: "حلقة عبدالرحمن بن أبي ليلى", code: "1121", isTalqeen: false, teacher: "محمد", assistant: "سلمان" },
  { id: 4, name: "حلقة حنظلة بن أبي سفيان", code: "1112", isTalqeen: false, teacher: "محمد", assistant: "سلمان" },
  { id: 5, name: "حلقة التلقين - المستوى الرابع", code: "1212", isTalqeen: true, teacher: "محمد", assistant: "سلمان" },
  { id: 6, name: "حلقة التلقين - المستوى الثالث", code: "1212", isTalqeen: true, teacher: "محمد", assistant: "سلمان" },
];

export const ADMIN_CODE = "1221";
export const MUSAMMI_CODE = "1122";

const FIRST_NAMES = ["عبدالله", "محمد", "أحمد", "إبراهيم", "يوسف", "عمر", "علي", "خالد", "سعد", "فهد", "ياسر", "بدر", "تركي", "ماجد", "سلطان", "ناصر", "وليد", "زياد", "حمزة", "أنس"];
const LAST_NAMES = ["الشتيوي", "العتيبي", "القحطاني", "الحربي", "المطيري", "الدوسري", "السبيعي", "الزهراني", "الغامدي", "الشهري"];

function rand(arr: string[]) { return arr[Math.floor(Math.random() * arr.length)]; }

function genStudents(): Student[] {
  const all: Student[] = [];
  HALAQAT.forEach((h) => {
    const count = 10 + Math.floor(Math.random() * 6);
    for (let i = 0; i < count; i++) {
      all.push({
        id: `s-${h.id}-${i}`,
        name: `${rand(FIRST_NAMES)} ${rand(LAST_NAMES)}`,
        halaqaId: h.id,
        parentPhone: `9665${Math.floor(10000000 + Math.random() * 89999999)}`,
        memorized: `من سورة ${["البقرة", "آل عمران", "النساء", "المائدة", "الأنعام"][Math.floor(Math.random() * 5)]}`,
      });
    }
  });
  return all;
}

export const DAYS = [
  { key: "sun", label: "الأحد" },
  { key: "mon", label: "الاثنين" },
  { key: "tue", label: "الثلاثاء" },
  { key: "wed", label: "الأربعاء" },
  { key: "thu", label: "الخميس" },
];

// ---- localStorage layer ----
const KEY_STUDENTS = "qshatawi_students_v1";
const KEY_HALAQAT = "qshatawi_halaqat_v1";
const KEY_GRADES = "qshatawi_grades_v1";
const KEY_NOTIFICATIONS = "qshatawi_notifications_v1";

export function loadStudents(): Student[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(KEY_STUDENTS);
  if (raw) return JSON.parse(raw);
  const s = genStudents();
  localStorage.setItem(KEY_STUDENTS, JSON.stringify(s));
  return s;
}
export function saveStudents(s: Student[]) { localStorage.setItem(KEY_STUDENTS, JSON.stringify(s)); }

export function loadHalaqat(): Halaqa[] {
  if (typeof window === "undefined") return HALAQAT;
  const raw = localStorage.getItem(KEY_HALAQAT);
  if (raw) return JSON.parse(raw);
  localStorage.setItem(KEY_HALAQAT, JSON.stringify(HALAQAT));
  return HALAQAT;
}
export function saveHalaqat(h: Halaqa[]) { localStorage.setItem(KEY_HALAQAT, JSON.stringify(h)); }

export function loadGrades(): GradesStore {
  if (typeof window === "undefined") return {};
  const raw = localStorage.getItem(KEY_GRADES);
  return raw ? JSON.parse(raw) : {};
}
export function saveGrades(g: GradesStore) { localStorage.setItem(KEY_GRADES, JSON.stringify(g)); }

export interface Notification {
  id: string;
  message: string;
  type: "sard" | "absence" | "info";
  createdAt: string;
  read: boolean;
}
export function loadNotifications(): Notification[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(KEY_NOTIFICATIONS);
  return raw ? JSON.parse(raw) : [];
}
export function pushNotification(n: Omit<Notification, "id" | "createdAt" | "read">) {
  const list = loadNotifications();
  list.unshift({ ...n, id: `n-${Date.now()}-${Math.random()}`, createdAt: new Date().toISOString(), read: false });
  localStorage.setItem(KEY_NOTIFICATIONS, JSON.stringify(list.slice(0, 100)));
}
export function saveNotifications(n: Notification[]) { localStorage.setItem(KEY_NOTIFICATIONS, JSON.stringify(n)); }

// ---- Scoring ----
export function dayScore(d: DayEntry, isTalqeen: boolean): number {
  if (isTalqeen) {
    const att = d.attendance === "present" ? 15 : d.attendance === "late" ? 10 : d.attendance === "excused" ? 5 : 0;
    return att + (d.wajib ? 15 : 0);
  }
  const att = d.attendance === "present" ? 15 : d.attendance === "late" ? 10 : d.attendance === "excused" ? 5 : 0;
  const hifz = d.hifz ? 15 : 0;
  const rabt = d.rabt === "pass" ? 15 : d.rabt === "fail" ? 5 : 0;
  const mur = d.muraja === "pass" ? 15 : d.muraja === "fail" ? 5 : 0;
  return att + hifz + rabt + mur;
}

export function weekPercentage(w: WeekRecord | undefined, isTalqeen: boolean): number {
  if (!w) return 0;
  let total = 0;
  const maxPerDay = isTalqeen ? 30 : 60;
  DAYS.forEach((d) => {
    const entry = w.days[d.key];
    if (entry) total += dayScore(entry, isTalqeen);
  });
  const max = maxPerDay * 5;
  return Math.round((total / max) * 100);
}

export function studentOverallPercentage(studentId: string, isTalqeen: boolean, grades: GradesStore): number {
  const weeks = grades[studentId];
  if (!weeks) return 0;
  const arr = Object.values(weeks).map((w) => weekPercentage(w, isTalqeen));
  if (arr.length === 0) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

export function emptyWeek(): WeekRecord {
  const days: Record<string, DayEntry> = {};
  DAYS.forEach((d) => {
    days[d.key] = { attendance: "", hifz: false, rabt: "", muraja: "", wajib: false };
  });
  return { days, testMuraja: false, testRabt: false, sard: false };
}
