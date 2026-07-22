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
import { getToken } from "@/lib/cloud-sync";

interface EvaluationSettingsContextValue {
  settings: EvaluationSettings;
  loading: boolean;
  refresh: () => Promise<void>;
  save: (next: EvaluationSettings) => Promise<void>;
}

const EvaluationSettingsContext = createContext<EvaluationSettingsContextValue | null>(null);

export function EvaluationSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<EvaluationSettings>(() => getCachedEvaluationSettings());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setSettings(getCachedEvaluationSettings());
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setSettings(await fetchEvaluationSettings());
    } catch {
      setSettings(getCachedEvaluationSettings());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(async (next: EvaluationSettings) => {
    const saved = await saveEvaluationSettings(next);
    setSettings(saved);
  }, []);

  const value = useMemo(
    () => ({ settings, loading, refresh, save }),
    [settings, loading, refresh, save],
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
      refresh: async () => undefined,
      save: async () => undefined,
    };
  }
  return ctx;
}
