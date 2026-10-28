import { flushSharedEdits } from "@/lib/shared-state";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_GRADE_INPUT_SETTINGS,
  loadGradeInputSettings,
  saveGradeInputSettings,
  type GradeInputSettings,
} from "@/lib/grade-input-settings";

type Ctx = {
  settings: GradeInputSettings;
  loading: boolean;
  save: (next: GradeInputSettings) => Promise<GradeInputSettings>;
  reload: () => void;
};

const GradeInputSettingsContext = createContext<Ctx | null>(null);

export function GradeInputSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<GradeInputSettings>(DEFAULT_GRADE_INPUT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setSettings(loadGradeInputSettings());
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
    const onChange = () => reload();
    window.addEventListener("grade-input-settings-changed", onChange);
    return () => window.removeEventListener("grade-input-settings-changed", onChange);
  }, [reload]);

  const save = useCallback(async (next: GradeInputSettings) => {
    const normalized = saveGradeInputSettings(next);
    await flushSharedEdits();
    setSettings(normalized);
    return normalized;
  }, []);

  const value = useMemo(
    () => ({ settings, loading, save, reload }),
    [settings, loading, save, reload],
  );

  return (
    <GradeInputSettingsContext.Provider value={value}>
      {children}
    </GradeInputSettingsContext.Provider>
  );
}

export function useGradeInputSettings(): Ctx {
  const ctx = useContext(GradeInputSettingsContext);
  if (!ctx) {
    return {
      settings: DEFAULT_GRADE_INPUT_SETTINGS,
      loading: false,
      save: async(next)=>{const value=saveGradeInputSettings(next);await flushSharedEdits();return value;},
      reload: () => {},
    };
  }
  return ctx;
}
