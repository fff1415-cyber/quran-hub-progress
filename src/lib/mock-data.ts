// Mock data + localStorage store for مجمع حلقات الشتيوي

export type Role = "manager" | "secretary" | "supervisor" | "teacher" | "assistant" | "musammi" | "student" | "parent";

export interface Halaqa {
  id: number;
  name: string;
  isTalqeen: boolean;
  teacherName: string;
  teacherCode: string;
  assistantName: string;
  assistantCode: string;
}

export interface Student {
  id: string;
  name: string;
  halaqaId: number;
  nationalId: string;
  parentPhone: string;
  level: string;
  levelType: "gold" | "silver";
  assignedTo?: "teacher" | "assistant"; // for splitting between teacher & assistant
  memorized?: string;
}

export type HifzValue = "" | "half" | "one" | "two";

export interface DayEntry {
  attendance: "present" | "late" | "excused" | "absent" | "";
  hifz: HifzValue;
  rabt: "pass" | "fail" | "";
  muraja: "pass" | "fail" | "";
  wajib?: boolean; // talqeen
}

export interface WeekRecord {
  days: Record<string, DayEntry>;
  testMuraja: boolean;
  testRabt: boolean;
  sard: boolean;
}

export type GradesStore = Record<string, Record<number, WeekRecord>>;

// ---- Roles & Codes ----
export interface RoleAccount {
  role: Role;
  name: string;
  code: string;
}

export const ROLE_ACCOUNTS: RoleAccount[] = [
  { role: "manager", name: "أ. فيصل الفوزان", code: "1414" },
  { role: "secretary", name: "أ. أحمد العمر", code: "4141" },
  { role: "supervisor", name: "أ. محمد البرادي", code: "5522" },
  { role: "musammi", name: "أ. يزيد الخضير", code: "0011" },
  { role: "musammi", name: "أ. عبدالله الدبيخي", code: "0022" },
];

export const HALAQAT: Halaqa[] = [
  {
    id: 1, name: "حلقة عمرو بن شرحبيل", isTalqeen: false,
    teacherName: "أ. عبداللطيف الدبيان", teacherCode: "2111",
    assistantName: "—", assistantCode: "",
  },
  {
    id: 2, name: "حلقة عبدالرحمن بن أبي ليلى", isTalqeen: false,
    teacherName: "أ. عمر الغيث", teacherCode: "1212",
    assistantName: "أ. معاذ السعوي", assistantCode: "2121",
  },
  {
    id: 3, name: "حلقة عبدالرحمن بن العلاء", isTalqeen: false,
    teacherName: "أ. عبدالرحمن الحميضي", teacherCode: "2211",
    assistantName: "أ. غسان العضيبي", assistantCode: "1122",
  },
  {
    id: 4, name: "حلقة حنظلة بن أبي سفيان", isTalqeen: false,
    teacherName: "أ. عبدالله الحصين", teacherCode: "1133",
    assistantName: "أ. مجاهد الجبيري", assistantCode: "3311",
  },
];

const FIRST_NAMES = ["عبدالله", "محمد", "أحمد", "إبراهيم", "يوسف", "عمر", "علي", "خالد", "سعد", "فهد", "ياسر", "بدر", "تركي", "ماجد", "سلطان", "ناصر", "وليد", "زياد", "حمزة", "أنس"];
const LAST_NAMES = ["الشتيوي", "العتيبي", "القحطاني", "الحربي", "المطيري", "الدوسري", "السبيعي", "الزهراني", "الغامدي", "الشهري"];

function rand(arr: string[]) { return arr[Math.floor(Math.random() * arr.length)]; }

function genStudents(): Student[] {
  const all: Student[] = [];
  let nidCounter = 1000000000;
  HALAQAT.forEach((h) => {
    const count = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      nidCounter++;
      all.push({
        id: `s-${h.id}-${i}`,
        name: `${rand(FIRST_NAMES)} ${rand(LAST_NAMES)}`,
        halaqaId: h.id,
        nationalId: String(nidCounter),
        parentPhone: `9665${Math.floor(10000000 + Math.random() * 89999999)}`,
        level: String(1 + Math.floor(Math.random() * 8)),
        levelType: Math.random() > 0.5 ? "gold" : "silver",
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
const KEY_STUDENTS = "qshatawi_students_v2";
const KEY_HALAQAT = "qshatawi_halaqat_v2";
const KEY_GRADES = "qshatawi_grades_v2";
const KEY_NOTIFICATIONS = "qshatawi_notifications_v2";
const KEY_SARD_QUEUE = "qshatawi_sard_queue_v2";
const KEY_SARD_HISTORY = "qshatawi_sard_history_v2";

export function loadStudents(): Student[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(KEY_STUDENTS);
  return raw ? JSON.parse(raw) : [];
}
export function saveStudents(s: Student[]) { localStorage.setItem(KEY_STUDENTS, JSON.stringify(s)); }

export function loadHalaqat(): Halaqa[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(KEY_HALAQAT);
  return raw ? JSON.parse(raw) : [];
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
  localStorage.setItem(KEY_NOTIFICATIONS, JSON.stringify(list.slice(0, 200)));
}

// ---- Sard Queue & History ----
export type SardStatus =
  | "pending"            // in queue, waiting for musammi
  | "scheduled"          // failed once, scheduled for retry after 2 days
  | "awaiting_supervisor" // failed twice, needs supervisor approval
  | "approved_third"     // supervisor approved 3rd attempt
  | "passed"
  | "final_failed";      // failed third attempt -> manager page

export interface SardQueueItem {
  id: string;
  studentId: string;
  halaqaId: number;
  week: number;
  attempt: 1 | 2 | 3;
  status: SardStatus;
  scheduledAt?: string; // ISO date for next attempt
  createdAt: string;
  hifzErrors?: number;       // for in-progress evaluation
  reviewErrors?: number[];   // 5 segments
  finalPercent?: number;
}

export function loadSardQueue(): SardQueueItem[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(KEY_SARD_QUEUE);
  return raw ? JSON.parse(raw) : [];
}
export function saveSardQueue(q: SardQueueItem[]) {
  localStorage.setItem(KEY_SARD_QUEUE, JSON.stringify(q));
}

export function enqueueSard(studentId: string, halaqaId: number, week: number) {
  const queue = loadSardQueue();
  // Skip if already pending/scheduled/awaiting for same student-week
  const existing = queue.find((q) => q.studentId === studentId && q.week === week && q.status !== "passed" && q.status !== "final_failed");
  if (existing) return existing;
  const item: SardQueueItem = {
    id: `sq-${Date.now()}-${Math.random()}`,
    studentId, halaqaId, week,
    attempt: 1,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  queue.unshift(item);
  saveSardQueue(queue);
  return item;
}

export function updateSardItem(id: string, patch: Partial<SardQueueItem>) {
  const queue = loadSardQueue();
  const idx = queue.findIndex((q) => q.id === id);
  if (idx === -1) return;
  queue[idx] = { ...queue[idx], ...patch };
  saveSardQueue(queue);
}

export interface SardHistoryItem {
  id: string;
  studentId: string;
  halaqaId: number;
  week: number;
  attempt: 1 | 2 | 3;
  result: "passed" | "failed";
  percent: number;
  hifzErrors: number;
  reviewErrors: number[];
  at: string;
}
export function loadSardHistory(): SardHistoryItem[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(KEY_SARD_HISTORY);
  return raw ? JSON.parse(raw) : [];
}
export function pushSardHistory(h: SardHistoryItem) {
  const list = loadSardHistory();
  list.unshift(h);
  localStorage.setItem(KEY_SARD_HISTORY, JSON.stringify(list.slice(0, 500)));
}

// ---- Scoring ----
export const HIFZ_SCORES: Record<HifzValue, number> = { "": 0, half: 15, one: 20, two: 25 };
export const HIFZ_LABELS: Record<HifzValue, string> = { "": "—", half: "½", one: "١", two: "٢" };

export function dayScore(d: DayEntry, isTalqeen: boolean): number {
  const att = d.attendance === "present" ? 15 : d.attendance === "late" ? 10 : d.attendance === "excused" ? 5 : 0;
  if (isTalqeen) return att + (d.wajib ? 15 : 0);
  const hifz = HIFZ_SCORES[d.hifz];
  const rabt = d.rabt === "pass" ? 15 : d.rabt === "fail" ? 5 : 0;
  const mur = d.muraja === "pass" ? 15 : d.muraja === "fail" ? 5 : 0;
  return att + hifz + rabt + mur;
}

export function weekPercentage(w: WeekRecord | undefined, isTalqeen: boolean): number {
  if (!w) return 0;
  let total = 0;
  const maxPerDay = isTalqeen ? 30 : 70; // 15+15 talqeen ; 15+25+15+15 = 70 regular
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
    days[d.key] = { attendance: "", hifz: "", rabt: "", muraja: "", wajib: false };
  });
  return { days, testMuraja: false, testRabt: false, sard: false };
}

// ---- Auth lookup ----
export interface AuthResult {
  role: Role;
  name: string;
  halaqaId?: number;
}

export function authenticateByCode(code: string): AuthResult | null {
  const trimmed = code.trim();
  if (!trimmed) return null;

  // global roles
  const acc = ROLE_ACCOUNTS.find((a) => a.code === trimmed);
  if (acc) return { role: acc.role, name: acc.name };

  // halaqa teachers / assistants
  const halaqat = loadHalaqat();
  for (const h of halaqat) {
    if (h.teacherCode && h.teacherCode === trimmed) {
      return { role: "teacher", name: h.teacherName, halaqaId: h.id };
    }
    if (h.assistantCode && h.assistantCode === trimmed) {
      return { role: "assistant", name: h.assistantName, halaqaId: h.id };
    }
  }
  return null;
}

export function authenticateByNationalId(nid: string): Student | null {
  const trimmed = nid.trim();
  if (!trimmed) return null;
  const students = loadStudents();
  return students.find((s) => s.nationalId === trimmed) || null;
}
