import { hasAuthToken } from "@/lib/auth-session";

const KEY = "qshatawi_student_portal_settings_v1";
const APP_STATE_KEY = "student_portal_settings";

export interface StudentPortalVisibility {
  halaqaWeekly: boolean;
  dailyComplexAttendance: boolean;
  complexFaceCounts: boolean;
  honorBoard: boolean;
  studentHeader: boolean;
  todayAttendance: boolean;
  weeklyPercentages: boolean;
  faceCounts: boolean;
  absenceRecord: boolean;
  academicResults: boolean;
  educationPlan: boolean;
}

export const DEFAULT_STUDENT_PORTAL_VISIBILITY: StudentPortalVisibility = {
  halaqaWeekly: true,
  dailyComplexAttendance: true,
  complexFaceCounts: true,
  honorBoard: true,
  studentHeader: true,
  todayAttendance: true,
  weeklyPercentages: true,
  faceCounts: true,
  absenceRecord: true,
  academicResults: true,
  educationPlan: true,
};

export const STUDENT_PORTAL_SECTION_LABELS: Record<keyof StudentPortalVisibility, string> = {
  halaqaWeekly: "متوسط الحلقات (أسبوعي)",
  dailyComplexAttendance: "نسبة حضور المجمع اليوم — كل الحلق (حاضر + متأخر)",
  complexFaceCounts: "عدد أوجه المجمع — حفظ + ربط/مراجعة (من بداية الفصل)",
  honorBoard: "لوحة الشرف — أوائل الأسبوع",
  studentHeader: "معلومات الطالب (الاسم والحلقة)",
  todayAttendance: "حالة الحضور اليوم",
  weeklyPercentages: "النسب الفصلية للطالب",
  faceCounts: "عدد الأوجه المحفوظة والربط/مراجعة (من بداية الفصل)",
  absenceRecord: "سجل الغياب والاستئذان",
  academicResults: "المراحل المجتازة (السرد)",
  educationPlan: "الخطة التعليمية",
};

function normalize(raw: Partial<StudentPortalVisibility>): StudentPortalVisibility {
  const d = DEFAULT_STUDENT_PORTAL_VISIBILITY;
  const out = { ...d };
  (Object.keys(d) as (keyof StudentPortalVisibility)[]).forEach((k) => {
    if (typeof raw[k] === "boolean") out[k] = raw[k]!;
  });
  return out;
}

export function loadStudentPortalVisibility(): StudentPortalVisibility {
  if (typeof window === "undefined") return { ...DEFAULT_STUDENT_PORTAL_VISIBILITY };
  const raw = localStorage.getItem(KEY);
  if (!raw) return { ...DEFAULT_STUDENT_PORTAL_VISIBILITY };
  try {
    return normalize(JSON.parse(raw) as Partial<StudentPortalVisibility>);
  } catch {
    return { ...DEFAULT_STUDENT_PORTAL_VISIBILITY };
  }
}

export function saveStudentPortalVisibility(settings: StudentPortalVisibility): StudentPortalVisibility {
  const normalized = normalize(settings);
  if (typeof window !== "undefined") {
    localStorage.setItem(KEY, JSON.stringify(normalized));
  }
  if (typeof window !== "undefined" && hasAuthToken() && sessionStorage.getItem("qs_syncing") !== "1") {
    void import("./cloud-sync").then((m) => m.pushAppState(APP_STATE_KEY, normalized)).catch(() => undefined);
  }
  return normalized;
}

export { APP_STATE_KEY as STUDENT_PORTAL_APP_STATE_KEY };
