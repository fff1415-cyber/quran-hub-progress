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
const KEY_MESSAGE_TEMPLATES = "qshatawi_message_templates_v2";
const KEY_LATE_PERMISSIONS = "qshatawi_late_permissions_v2";

function persistShared(key: "grades" | "sard_queue" | "sard_history" | "notifications" | "message_templates" | "late_permissions", value: unknown) {
  if (typeof window === "undefined" || !sessionStorage.getItem("qs_token")) return;
  if (sessionStorage.getItem("qs_syncing") === "1") return;
  void import("./cloud-sync").then((m) => m.pushAppState(key, value)).catch(() => undefined);
}

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
export function saveGrades(g: GradesStore) { localStorage.setItem(KEY_GRADES, JSON.stringify(g)); persistShared("grades", g); }

export interface Notification {
  id: string;
  message: string;
  type: "sard" | "absence" | "late" | "info" | "transfer";
  createdAt: string;
  read: boolean;
  targetHalaqaId?: number;
  actionTab?: "today" | "sard" | "late" | "passed" | "failed" | "transfers";
  transferData?: {
    studentId: string;
    halaqaId: number;
    week: number;
    reason: string;
    fromName: string;
  };
  transferStatus?: "pending" | "to_secretary" | "to_supervisor" | "struggling" | "closed";
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
  persistShared("notifications", list.slice(0, 200));
}
export function saveNotifications(list: Notification[]) {
  localStorage.setItem(KEY_NOTIFICATIONS, JSON.stringify(list.slice(0, 200)));
  persistShared("notifications", list.slice(0, 200));
}
export function dismissNotification(id: string) {
  const list = loadNotifications().map((n) => (n.id === id ? { ...n, read: true } : n));
  saveNotifications(list);
}
export function updateNotification(id: string, patch: Partial<Notification>) {
  const list = loadNotifications().map((n) => (n.id === id ? { ...n, ...patch } : n));
  saveNotifications(list);
}

// ---- WhatsApp message templates ----
export type MessageTemplateKey = "absence" | "late" | "sard_pass" | "sard_fail";
export const DEFAULT_MESSAGE_TEMPLATES: Record<MessageTemplateKey, string> = {
  absence: "السلام عليكم، نُعلمكم بغياب الطالب {student} عن حلقة {halaqa} اليوم.",
  late: "السلام عليكم، نُعلمكم بأن الطالب {student} حضر متأخراً وتم منحه إذن الدخول لحلقة {halaqa}.",
  sard_pass: "السلام عليكم، نبارك لكم اجتياز الطالب {student} للسرد في {week} بنسبة {percent}%.",
  sard_fail: "السلام عليكم، نُعلمكم بأن الطالب {student} لم يجتز السرد في {week} بنسبة {percent}%، وسيتم اتخاذ الإجراء المناسب.",
};
export function loadMessageTemplates(): Record<MessageTemplateKey, string> {
  if (typeof window === "undefined") return DEFAULT_MESSAGE_TEMPLATES;
  const raw = localStorage.getItem(KEY_MESSAGE_TEMPLATES);
  return { ...DEFAULT_MESSAGE_TEMPLATES, ...(raw ? JSON.parse(raw) : {}) };
}
export function saveMessageTemplates(t: Record<MessageTemplateKey, string>) {
  localStorage.setItem(KEY_MESSAGE_TEMPLATES, JSON.stringify(t));
  persistShared("message_templates", t);
}
export function formatMessage(template: string, values: Record<string, string | number | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
}

// ---- Late entry permissions ----
export interface LatePermission {
  id: string;
  studentId: string;
  halaqaId: number;
  grantedBy: string;
  grantedAt: string;
  date: string;
}
export function loadLatePermissions(): LatePermission[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(KEY_LATE_PERMISSIONS);
  return raw ? JSON.parse(raw) : [];
}
export function saveLatePermissions(list: LatePermission[]) {
  localStorage.setItem(KEY_LATE_PERMISSIONS, JSON.stringify(list.slice(0, 1000)));
  persistShared("late_permissions", list.slice(0, 1000));
}

// ---- Acknowledged attendance archive (after secretary presses ✓ on today's row) ----
export interface AttendanceArchiveItem {
  id: string;
  studentId: string;
  halaqaId: number;
  type: "absent" | "late" | "excused";
  date: string;            // ISO yyyy-mm-dd
  dayKey: string;          // sun/mon/..
  acknowledgedAt: string;
  acknowledgedBy: string;
}
const KEY_ATT_ARCHIVE = "qshatawi_att_archive_v1";
export function loadAttendanceArchive(): AttendanceArchiveItem[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(KEY_ATT_ARCHIVE);
  return raw ? JSON.parse(raw) : [];
}
export function saveAttendanceArchive(list: AttendanceArchiveItem[]) {
  localStorage.setItem(KEY_ATT_ARCHIVE, JSON.stringify(list.slice(0, 2000)));
}
export function acknowledgeAttendance(item: Omit<AttendanceArchiveItem, "id" | "acknowledgedAt">) {
  const list = loadAttendanceArchive();
  // de-dup on student+date+type
  const exists = list.some((x) => x.studentId === item.studentId && x.date === item.date && x.type === item.type);
  if (exists) return;
  list.unshift({ ...item, id: `att-${Date.now()}-${Math.random()}`, acknowledgedAt: new Date().toISOString() });
  saveAttendanceArchive(list);
}
export function isAttendanceAcked(studentId: string, date: string, type: "absent" | "late" | "excused"): boolean {
  return loadAttendanceArchive().some((x) => x.studentId === studentId && x.date === date && x.type === type);
}

// ---- Sard Queue & History ----
export type SardStatus =
  | "pending"            // in queue, waiting for musammi
  | "scheduled"          // failed once, scheduled for retry after 2 days
  | "awaiting_supervisor" // failed twice, needs supervisor approval
  | "approved_third"     // supervisor approved 3rd attempt
  | "passed"
  | "level_repeat"
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
  persistShared("sard_queue", q);
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

/** Is a pending sard item considered late (>2 days since createdAt)? */
export function isLateSard(q: SardQueueItem): boolean {
  if (q.status !== "pending") return false;
  const days = (Date.now() - new Date(q.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  return days >= 2;
}

/** Scan queue, push a one-time notification per late item. */
export function notifyLateSard(students: Student[]) {
  if (typeof window === "undefined") return;
  const NOTIFIED_KEY = "qshatawi_late_notified";
  const notified: string[] = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || "[]");
  const queue = loadSardQueue();
  const newly: string[] = [];
  queue.forEach((q) => {
    if (isLateSard(q) && !notified.includes(q.id)) {
      const s = students.find((x) => x.id === q.studentId);
      if (s) {
        pushNotification({
          message: `الطالب ${s.name} لم يقرأ السرد حتى الآن — تجاوز يومين`,
          type: "sard",
        });
        newly.push(q.id);
      }
    }
  });
  if (newly.length > 0) {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...notified, ...newly]));
  }
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
  persistShared("sard_history", list.slice(0, 500));
}
export function saveSardHistory(list: SardHistoryItem[]) {
  localStorage.setItem(KEY_SARD_HISTORY, JSON.stringify(list.slice(0, 500)));
  persistShared("sard_history", list.slice(0, 500));
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

export interface StudentStats {
  hifzCount: number;       // total hifz entries (not blank)
  lateCount: number;
  absentCount: number;
  excusedCount: number;
  murajaPass: number;
  murajaFail: number;
  rabtPass: number;
  rabtFail: number;
  weeksRecorded: number;
}
export function studentStats(studentId: string, grades: GradesStore): StudentStats {
  const stats: StudentStats = {
    hifzCount: 0, lateCount: 0, absentCount: 0, excusedCount: 0,
    murajaPass: 0, murajaFail: 0, rabtPass: 0, rabtFail: 0, weeksRecorded: 0,
  };
  const weeks = grades[studentId];
  if (!weeks) return stats;
  Object.values(weeks).forEach((w) => {
    stats.weeksRecorded++;
    DAYS.forEach((d) => {
      const e = w.days[d.key];
      if (!e) return;
      if (e.attendance === "late") stats.lateCount++;
      else if (e.attendance === "absent") stats.absentCount++;
      else if (e.attendance === "excused") stats.excusedCount++;
      if (e.hifz && e.hifz !== "") stats.hifzCount++;
      if (e.rabt === "pass") stats.rabtPass++;
      else if (e.rabt === "fail") stats.rabtFail++;
      if (e.muraja === "pass") stats.murajaPass++;
      else if (e.muraja === "fail") stats.murajaFail++;
    });
  });
  return stats;
}

export function emptyWeek(): WeekRecord {
  const days: Record<string, DayEntry> = {};
  DAYS.forEach((d) => {
    days[d.key] = { attendance: "", hifz: "", rabt: "", muraja: "", wajib: false };
  });
  return { days, testMuraja: false, testRabt: false, sard: false };
}

// Auth lookups moved to server functions — see src/lib/secure-data.functions.ts
// (loginByCode, loginByNationalId). Credentials are no longer readable
// from the browser; do not add client-side authenticate* helpers here.
