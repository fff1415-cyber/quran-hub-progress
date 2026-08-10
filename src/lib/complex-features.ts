import { hasAuthToken } from "@/lib/auth-session";

const KEY = "qshatawi_complex_features_v1";
export const COMPLEX_FEATURES_APP_STATE_KEY = "complex_features";

export interface ComplexFeatures {
  /** Show «إرسال المتعثرين للإدارة» on teacher halaqa page */
  showTeacherTransferButton: boolean;
}

export const DEFAULT_COMPLEX_FEATURES: ComplexFeatures = {
  showTeacherTransferButton: true,
};

function normalize(raw: Partial<ComplexFeatures>): ComplexFeatures {
  const d = DEFAULT_COMPLEX_FEATURES;
  return {
    showTeacherTransferButton:
      typeof raw.showTeacherTransferButton === "boolean"
        ? raw.showTeacherTransferButton
        : d.showTeacherTransferButton,
  };
}

export function loadComplexFeatures(): ComplexFeatures {
  if (typeof window === "undefined") return { ...DEFAULT_COMPLEX_FEATURES };
  const raw = localStorage.getItem(KEY);
  if (!raw) return { ...DEFAULT_COMPLEX_FEATURES };
  try {
    return normalize(JSON.parse(raw) as Partial<ComplexFeatures>);
  } catch {
    return { ...DEFAULT_COMPLEX_FEATURES };
  }
}

export function saveComplexFeatures(settings: ComplexFeatures): ComplexFeatures {
  const normalized = normalize(settings);
  if (typeof window !== "undefined") {
    localStorage.setItem(KEY, JSON.stringify(normalized));
  }
  if (
    typeof window !== "undefined"
    && hasAuthToken()
    && sessionStorage.getItem("qs_syncing") !== "1"
  ) {
    void import("./cloud-sync").then((m) => m.pushAppState(COMPLEX_FEATURES_APP_STATE_KEY, normalized)).catch(() => undefined);
  }
  return normalized;
}
