/**
 * Staff (teacher/assistant) attendance — start time from daily Asr + offset.
 * Check-in is never blocked; late status applies after grace minutes.
 */

export type StaffCheckInStatus = "present" | "late";

export interface StaffAttendanceSettings {
  enabled: boolean;
  city: string;
  country: string;
  /** Minutes after Asr when halaqa officially starts. */
  minutes_after_asr: number;
  /** Still counts as present if within this many minutes after start. */
  late_grace_minutes: number;
  /** Aladhan method — 4 = Umm al-Qura (Saudi). */
  prayer_method: number;
}

export interface StaffCheckIn {
  id: string;
  userKey: string;
  role: string;
  name: string;
  halaqaId: number;
  halaqaName: string;
  date: string;
  checkedInAt: string;
  status: StaffCheckInStatus;
  asrTime: string;
  scheduledStart: string;
}

export interface DailySchedule {
  date: string;
  asrTime: string;
  scheduledStart: string;
}

export const DEFAULT_STAFF_ATTENDANCE_SETTINGS: StaffAttendanceSettings = {
  enabled: true,
  city: "Buraydah",
  country: "Saudi Arabia",
  minutes_after_asr: 50,
  late_grace_minutes: 5,
  prayer_method: 4,
};

const KEY_SETTINGS = "qshatawi_staff_attendance_settings_v1";
const KEY_STORE = "qshatawi_staff_attendance_v1";
const KEY_PRAYER_PREFIX = "qshatawi_prayer_asr_v1_";

function persistSettings(value: StaffAttendanceSettings) {
  if (typeof window === "undefined" || !sessionStorage.getItem("qs_token")) return;
  if (sessionStorage.getItem("qs_syncing") === "1") return;
  void import("./cloud-sync").then((m) => m.pushAppState("staff_attendance_settings", value)).catch(() => undefined);
}

function persistStore(value: StaffCheckIn[]) {
  if (typeof window === "undefined" || !sessionStorage.getItem("qs_token")) return;
  if (sessionStorage.getItem("qs_syncing") === "1") return;
  void import("./cloud-sync").then((m) => m.pushAppState("staff_attendance", value)).catch(() => undefined);
}

function clampInt(n: number, min: number, max: number, fallback: number): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

export function normalizeStaffAttendanceSettings(
  raw: Partial<StaffAttendanceSettings>,
): StaffAttendanceSettings {
  return {
    ...DEFAULT_STAFF_ATTENDANCE_SETTINGS,
    ...raw,
    city: (raw.city ?? DEFAULT_STAFF_ATTENDANCE_SETTINGS.city).trim() || DEFAULT_STAFF_ATTENDANCE_SETTINGS.city,
    country: (raw.country ?? DEFAULT_STAFF_ATTENDANCE_SETTINGS.country).trim() || DEFAULT_STAFF_ATTENDANCE_SETTINGS.country,
    minutes_after_asr: clampInt(raw.minutes_after_asr ?? 50, 0, 180, 50),
    late_grace_minutes: clampInt(raw.late_grace_minutes ?? 5, 0, 60, 5),
    prayer_method: clampInt(raw.prayer_method ?? 4, 1, 15, 4),
  };
}

export function loadStaffAttendanceSettings(): StaffAttendanceSettings {
  if (typeof window === "undefined") return { ...DEFAULT_STAFF_ATTENDANCE_SETTINGS };
  const raw = localStorage.getItem(KEY_SETTINGS);
  if (!raw) return { ...DEFAULT_STAFF_ATTENDANCE_SETTINGS };
  try {
    return normalizeStaffAttendanceSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_STAFF_ATTENDANCE_SETTINGS };
  }
}

export function saveStaffAttendanceSettings(settings: StaffAttendanceSettings) {
  const normalized = normalizeStaffAttendanceSettings(settings);
  localStorage.setItem(KEY_SETTINGS, JSON.stringify(normalized));
  persistSettings(normalized);
}

export function loadStaffCheckIns(): StaffCheckIn[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(KEY_STORE);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as StaffCheckIn[];
  } catch {
    return [];
  }
}

export function saveStaffCheckIns(list: StaffCheckIn[]) {
  const trimmed = list.slice(0, 5000);
  localStorage.setItem(KEY_STORE, JSON.stringify(trimmed));
  persistStore(trimmed);
}

export function staffUserKey(role: string, halaqaId: number, name: string): string {
  return `${role}:${halaqaId}:${name.trim()}`;
}

export function getCalendarIsoDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parse HH:MM (24h) on a local calendar date. */
export function parseLocalDateTime(isoDate: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const [y, mo, d] = isoDate.split("-").map(Number);
  return new Date(y, mo - 1, d, h || 0, m || 0, 0, 0);
}

export function addMinutesToTime(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  let total = (h || 0) * 60 + (m || 0) + minutes;
  if (total < 0) total = 0;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

export function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "م" : "ص";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function prayerCacheKey(date: string, settings: StaffAttendanceSettings): string {
  return `${KEY_PRAYER_PREFIX}${date}_${settings.city}_${settings.country}_${settings.prayer_method}`;
}

export async function fetchAsrTimeForDate(
  date: string,
  settings: StaffAttendanceSettings = loadStaffAttendanceSettings(),
): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const cacheKey = prayerCacheKey(date, settings);
  const cached = localStorage.getItem(cacheKey);
  if (cached) return cached;

  const [y, mo, d] = date.split("-");
  const url =
    `https://api.aladhan.com/v1/timingsByCity/${d}-${mo}-${y}` +
    `?city=${encodeURIComponent(settings.city)}` +
    `&country=${encodeURIComponent(settings.country)}` +
    `&method=${settings.prayer_method}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const asr = json?.data?.timings?.Asr as string | undefined;
    if (!asr) return null;
    const hhmm = asr.split(" ")[0].slice(0, 5);
    localStorage.setItem(cacheKey, hhmm);
    return hhmm;
  } catch {
    return null;
  }
}

export async function getDailySchedule(
  date: string = getCalendarIsoDate(),
  settings: StaffAttendanceSettings = loadStaffAttendanceSettings(),
): Promise<DailySchedule | null> {
  const asrTime = await fetchAsrTimeForDate(date, settings);
  if (!asrTime) return null;
  return {
    date,
    asrTime,
    scheduledStart: addMinutesToTime(asrTime, settings.minutes_after_asr),
  };
}

export function resolveCheckInStatus(
  now: Date,
  scheduledStart: Date,
  graceMinutes: number,
): StaffCheckInStatus {
  const deadline = new Date(scheduledStart.getTime() + graceMinutes * 60_000);
  return now <= deadline ? "present" : "late";
}

export function findTodayCheckIn(
  userKey: string,
  date: string = getCalendarIsoDate(),
): StaffCheckIn | undefined {
  return loadStaffCheckIns().find((c) => c.userKey === userKey && c.date === date);
}

export function todayCheckIns(date: string = getCalendarIsoDate()): StaffCheckIn[] {
  return loadStaffCheckIns()
    .filter((c) => c.date === date)
    .sort((a, b) => a.checkedInAt.localeCompare(b.checkedInAt));
}

export async function registerStaffCheckIn(input: {
  role: string;
  name: string;
  halaqaId: number;
  halaqaName: string;
  now?: Date;
}): Promise<{ checkIn: StaffCheckIn; alreadyRegistered: boolean }> {
  const settings = loadStaffAttendanceSettings();
  const now = input.now ?? new Date();
  const date = getCalendarIsoDate(now);
  const userKey = staffUserKey(input.role, input.halaqaId, input.name);

  const existing = findTodayCheckIn(userKey, date);
  if (existing) {
    return { checkIn: existing, alreadyRegistered: true };
  }

  const schedule = await getDailySchedule(date, settings);
  if (!schedule) {
    throw new Error("تعذّر جلب وقت العصر — تحقق من اتصال الإنترنت أو إعدادات المدينة");
  }

  const startAt = parseLocalDateTime(date, schedule.scheduledStart);
  const status = resolveCheckInStatus(now, startAt, settings.late_grace_minutes);

  const checkIn: StaffCheckIn = {
    id: `sc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    userKey,
    role: input.role,
    name: input.name,
    halaqaId: input.halaqaId,
    halaqaName: input.halaqaName,
    date,
    checkedInAt: now.toISOString(),
    status,
    asrTime: schedule.asrTime,
    scheduledStart: schedule.scheduledStart,
  };

  const list = loadStaffCheckIns();
  list.unshift(checkIn);
  saveStaffCheckIns(list);
  return { checkIn, alreadyRegistered: false };
}

export const STAFF_STATUS_LABEL: Record<StaffCheckInStatus, string> = {
  present: "حاضر",
  late: "متأخر",
};
