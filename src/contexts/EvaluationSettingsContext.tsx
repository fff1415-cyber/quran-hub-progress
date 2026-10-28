import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  verified: boolean;
  error?: string;
  refresh: () => Promise<void>;
  save: (next: EvaluationSettings) => Promise<void>;
}

const EvaluationSettingsContext = createContext<EvaluationSettingsContextValue | null>(null);

export function EvaluationSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<EvaluationSettings>(() => getCachedEvaluationSettings());
  const [loading, setLoading] = useState(true);
  const [verified,setVerified] = useState(false);
  const [error,setError] = useState<string>();

  const refresh = useCallback(async () => {
    const token=getToken(),complex=getActiveComplexId();
    setVerified(false);setError(undefined);
    if (!token) {
      setSettings(getCachedEvaluationSettings());
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next=await fetchEvaluationSettings();
      if(getToken()!==token||getActiveComplexId()!==complex)return;
      setSettings(next);setVerified(true);
    } catch(e) {
      if(getToken()!==token||getActiveComplexId()!==complex)return;
      setError(e instanceof Error?e.message:String(e));
      setSettings(getCachedEvaluationSettings());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let token=getToken(),complex=getActiveComplexId();
    void refresh();
    const check=()=>{const t=getToken(),c=getActiveComplexId();if(t!==token||c!==complex){token=t;complex=c;void refresh();}};
    const timer=setInterval(check,1000);window.addEventListener("focus",check);window.addEventListener("storage",check);
    return ()=>{clearInterval(timer);window.removeEventListener("focus",check);window.removeEventListener("storage",check);};
  }, [refresh]);

  const save = useCallback(async (next: EvaluationSettings) => {
    const saved = await saveEvaluationSettings(next);
    setSettings(saved);setVerified(true);setError(undefined);
  }, []);

  const value = useMemo(
    () => ({ settings, loading, verified, error, refresh, save }),
    [settings, loading, verified, error, refresh, save],
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
      verified: false,
      refresh: async () => undefined,
      save: async () => undefined,
    };
  }
  return ctx;
}
