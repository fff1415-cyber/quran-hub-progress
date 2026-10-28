import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { EvaluationSettings } from "@/lib/evaluation-types";
import { DEFAULT_EVALUATION_SETTINGS } from "@/lib/evaluation-types";
import {
  fetchEvaluationSettings,
  getCachedEvaluationSettings,
  saveEvaluationSettings,
} from "@/lib/evaluation-settings-service";
import { getToken } from "@/lib/auth-session";
import { getActiveComplexId } from "@/lib/tenant";

interface EvaluationSettingsContextValue {
  settings: EvaluationSettings;
  loading: boolean;
  saving: boolean;
  verified: boolean;
  error?: string;
  refresh: () => Promise<void>;
  save: (next: EvaluationSettings) => Promise<void>;
}

const EvaluationSettingsContext = createContext<EvaluationSettingsContextValue | null>(null);

export function EvaluationSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<EvaluationSettings>(() => getCachedEvaluationSettings());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string>();
  const request = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++request.current;
    const token = getToken(), complex = getActiveComplexId();
    const current = () => id === request.current && token === getToken() && complex === getActiveComplexId();
    setSettings(getCachedEvaluationSettings());
    setVerified(false); setError(undefined); setSaving(false);
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await fetchEvaluationSettings();
      if (current()) { setSettings(next); setVerified(true); }
    } catch (cause) {
      if (current()) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (current()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let token = getToken(), complex = getActiveComplexId();
    void refresh();
    const check = () => {
      const nextToken = getToken(), nextComplex = getActiveComplexId();
      if (token !== nextToken || complex !== nextComplex) {
        token = nextToken; complex = nextComplex; void refresh();
      }
    };
    const timer = setInterval(check, 1000);
    window.addEventListener("focus", check); window.addEventListener("storage", check);
    return () => { request.current++; clearInterval(timer); window.removeEventListener("focus", check); window.removeEventListener("storage", check); };
  }, [refresh]);

  const save = useCallback(async (next: EvaluationSettings) => {
    const id = ++request.current;
    const token = getToken(), complex = getActiveComplexId();
    const current = () => id === request.current && token === getToken() && complex === getActiveComplexId();
    setSaving(true); setLoading(false); setError(undefined);
    try {
      const saved = await saveEvaluationSettings(next);
      if (current()) { setSettings(saved); setVerified(true); }
    } catch (cause) {
      if (current()) setError(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    } finally { if (current()) setSaving(false); }
  }, []);

  const value = useMemo(
    () => ({ settings, loading, saving, verified, error, refresh, save }),
    [settings, loading, saving, verified, error, refresh, save],
  );

  return (
    <EvaluationSettingsContext.Provider value={value}>{children}</EvaluationSettingsContext.Provider>
  );
}

export function useEvaluationSettings(): EvaluationSettingsContextValue {
  const ctx = useContext(EvaluationSettingsContext);
  if (!ctx) {
    return {
      settings: DEFAULT_EVALUATION_SETTINGS,
      loading: false,
      saving: false,
      verified: false,
      refresh: async () => undefined,
      save: async () => { throw new Error("تعذّر تأكيد إعدادات التقييم — أعد تحميل الصفحة"); },
    };
  }
  return ctx;
}
