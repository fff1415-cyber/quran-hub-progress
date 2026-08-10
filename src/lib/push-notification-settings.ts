import { hasAuthToken } from "@/lib/auth-session";
import type { PushEventType } from "@/lib/push-notifications";

export const PUSH_NOTIFICATION_SETTINGS_KEY = "push_notification_settings";

export interface PushNotificationSettings {
  /** Master switch — disables all mobile push when false */
  enabled: boolean;
  studentAbsent: boolean;
  studentLate: boolean;
  staffCheckIn: boolean;
  teacherTransfer: boolean;
}

export const DEFAULT_PUSH_NOTIFICATION_SETTINGS: PushNotificationSettings = {
  enabled: true,
  studentAbsent: true,
  studentLate: true,
  staffCheckIn: true,
  teacherTransfer: true,
};

const LOCAL_KEY = "qshatawi_push_notification_settings_v1";

const EVENT_FIELD: Record<PushEventType, keyof PushNotificationSettings> = {
  student_absent: "studentAbsent",
  student_late: "studentLate",
  staff_checkin: "staffCheckIn",
  teacher_transfer: "teacherTransfer",
};

export const PUSH_SETTING_LABELS: {
  field: keyof PushNotificationSettings;
  label: string;
  description: string;
}[] = [
  {
    field: "studentAbsent",
    label: "غياب الطالب",
    description: "إشعار ولي الأمر عند تسجيل غياب",
  },
  {
    field: "studentLate",
    label: "تأخر الطالب",
    description: "إشعار ولي الأمر عند تسجيل تأخر",
  },
  {
    field: "staffCheckIn",
    label: "حضور الكادر",
    description: "إشعار المدير عند تسجيل حضور معلم/مساعد",
  },
  {
    field: "teacherTransfer",
    label: "طلب تحويل طالب",
    description: "إشعار المدير عند إرسال تحويل من المعلم",
  },
];

function normalize(raw: Partial<PushNotificationSettings>): PushNotificationSettings {
  const d = DEFAULT_PUSH_NOTIFICATION_SETTINGS;
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : d.enabled,
    studentAbsent: typeof raw.studentAbsent === "boolean" ? raw.studentAbsent : d.studentAbsent,
    studentLate: typeof raw.studentLate === "boolean" ? raw.studentLate : d.studentLate,
    staffCheckIn: typeof raw.staffCheckIn === "boolean" ? raw.staffCheckIn : d.staffCheckIn,
    teacherTransfer: typeof raw.teacherTransfer === "boolean" ? raw.teacherTransfer : d.teacherTransfer,
  };
}

export function loadPushNotificationSettings(): PushNotificationSettings {
  if (typeof window === "undefined") return { ...DEFAULT_PUSH_NOTIFICATION_SETTINGS };
  const raw = localStorage.getItem(LOCAL_KEY);
  if (!raw) return { ...DEFAULT_PUSH_NOTIFICATION_SETTINGS };
  try {
    return normalize(JSON.parse(raw) as Partial<PushNotificationSettings>);
  } catch {
    return { ...DEFAULT_PUSH_NOTIFICATION_SETTINGS };
  }
}

export function savePushNotificationSettings(settings: PushNotificationSettings): PushNotificationSettings {
  const normalized = normalize(settings);
  if (typeof window !== "undefined") {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(normalized));
  }
  if (
    typeof window !== "undefined"
    && hasAuthToken()
    && sessionStorage.getItem("qs_syncing") !== "1"
  ) {
    void import("./cloud-sync")
      .then((m) => m.pushAppState(PUSH_NOTIFICATION_SETTINGS_KEY, normalized))
      .catch(() => undefined);
  }
  return normalized;
}

export function isPushEventEnabled(event: PushEventType): boolean {
  const s = loadPushNotificationSettings();
  if (!s.enabled) return false;
  const field = EVENT_FIELD[event];
  return s[field] === true;
}
