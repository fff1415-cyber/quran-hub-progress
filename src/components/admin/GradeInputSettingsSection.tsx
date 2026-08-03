import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ALL_ATTENDANCE_OPTIONS,
  ALL_PASS_FAIL_OPTIONS,
  ATTENDANCE_OPTION_LABELS,
  ATTENDANCE_PRESETS,
  DEFAULT_GRADE_INPUT_SETTINGS,
  PASS_FAIL_LABELS,
  attendancePresetId,
  type AttendanceOption,
  type GradeFieldInputConfig,
  type GradeInputMode,
  type GradeInputSettings,
  type PassFailOption,
} from "@/lib/grade-input-settings";
import { useGradeInputSettings } from "@/contexts/GradeInputSettingsContext";
import { RotateCcw, Save, Settings2 } from "lucide-react";
import { toast } from "sonner";

function ModeToggle({
  value,
  onChange,
  allowDropdown = true,
}: {
  value: GradeInputMode;
  onChange: (v: GradeInputMode) => void;
  allowDropdown?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {allowDropdown && (
        <button
          type="button"
          onClick={() => onChange("dropdown")}
          className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
            value === "dropdown"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-secondary/50 border-border hover:border-primary/40"
          }`}
        >
          قائمة منسدلة
        </button>
      )}
      <button
        type="button"
        onClick={() => onChange("checkbox")}
        className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
          value === "checkbox"
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-secondary/50 border-border hover:border-primary/40"
        }`}
      >
        مربع اختيار
      </button>
    </div>
  );
}

function OptionChecks<T extends string>({
  all,
  selected,
  labels,
  onChange,
}: {
  all: readonly T[];
  selected: T[];
  labels: Record<T, string>;
  onChange: (next: T[]) => void;
}) {
  const toggle = (opt: T) => {
    const set = new Set(selected);
    if (set.has(opt)) {
      if (set.size <= 1) return;
      set.delete(opt);
    } else {
      set.add(opt);
    }
    onChange(all.filter((o) => set.has(o)));
  };

  return (
    <div className="flex flex-wrap gap-2">
      {all.map((opt) => (
        <label
          key={opt}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border cursor-pointer ${
            selected.includes(opt) ? "bg-primary/10 border-primary text-primary" : "bg-muted/40 border-border"
          }`}
        >
          <input
            type="checkbox"
            className="accent-primary"
            checked={selected.includes(opt)}
            onChange={() => toggle(opt)}
          />
          {labels[opt]}
        </label>
      ))}
    </div>
  );
}

function AttendanceFieldEditor({
  config,
  onChange,
}: {
  config: GradeFieldInputConfig<AttendanceOption>;
  onChange: (next: GradeFieldInputConfig<AttendanceOption>) => void;
}) {
  const preset = attendancePresetId(config.options);

  return (
    <div className="space-y-3">
      <ModeToggle value={config.mode} onChange={(mode) => onChange({ ...config, mode })} />
      {config.mode === "dropdown" && (
        <>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">قالب جاهز</label>
            <select
              value={preset}
              onChange={(e) => {
                if (e.target.value === "custom") return;
                const p = ATTENDANCE_PRESETS.find((x) => x.id === e.target.value);
                if (p) onChange({ ...config, options: [...p.options] });
              }}
              className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm"
            >
              {ATTENDANCE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
              <option value="custom">مخصص — اختر الخيارات أدناه</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">الخيارات الظاهرة للمعلّm</label>
            <OptionChecks
              all={ALL_ATTENDANCE_OPTIONS}
              selected={config.options}
              labels={ATTENDANCE_OPTION_LABELS}
              onChange={(options) => onChange({ ...config, options })}
            />
          </div>
        </>
      )}
      {config.mode === "checkbox" && (
        <p className="text-xs text-muted-foreground">
          ✓ = حاضر · فارغ = غائب
        </p>
      )}
    </div>
  );
}

function PassFailFieldEditor({
  config,
  onChange,
  checkboxHint,
}: {
  config: GradeFieldInputConfig<PassFailOption>;
  onChange: (next: GradeFieldInputConfig<PassFailOption>) => void;
  checkboxHint: string;
}) {
  return (
    <div className="space-y-3">
      <ModeToggle value={config.mode} onChange={(mode) => onChange({ ...config, mode })} />
      {config.mode === "dropdown" && (
        <div>
          <label className="text-xs text-muted-foreground block mb-1">الخيارات الظاهرة</label>
          <OptionChecks
            all={ALL_PASS_FAIL_OPTIONS}
            selected={config.options}
            labels={PASS_FAIL_LABELS}
            onChange={(options) => onChange({ ...config, options })}
          />
        </div>
      )}
      {config.mode === "checkbox" && (
        <p className="text-xs text-muted-foreground">{checkboxHint}</p>
      )}
    </div>
  );
}

export function GradeInputSettingsSection() {
  const { settings, save } = useGradeInputSettings();
  const [draft, setDraft] = useState<GradeInputSettings>(settings);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const onSave = () => {
    save(draft);
    toast.success("تم حفظ إعدادات طريقة التحضير");
  };

  const onReset = () => setDraft({ ...DEFAULT_GRADE_INPUT_SETTINGS });

  const fields: {
    key: keyof Pick<GradeInputSettings, "attendance" | "hifz" | "rabt" | "muraja" | "wajib">;
    title: string;
    hint: string;
  }[] = [
    { key: "attendance", title: "الحضور", hint: "طريقة تسجيل حضور الطالب يومياً" },
    { key: "hifz", title: "الحفظ", hint: "الافتراضي: مربع اختيار — قرأ مقطعه أم لا" },
    { key: "rabt", title: "الربط", hint: "تقييم الربط اليومي" },
    { key: "muraja", title: "المراجعة", hint: "تقييم المراجعة اليومية" },
    { key: "wajib", title: "الواجب (تلقين)", hint: "حلقات التلقين فقط — مربع اختيار" },
  ];

  return (
    <div className="glass-card rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-bold text-primary flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            طريقة التحضير والدرجات
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            يحدد شكل الحقول في صفحة المعلّm — قائمة منسدلة أو مربع اختيار والخيارات الظاهرة.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onReset}>
            <RotateCcw className="w-3.5 h-3.5 ml-1" />
            افتراضي
          </Button>
          <Button type="button" size="sm" onClick={onSave}>
            <Save className="w-3.5 h-3.5 ml-1" />
            حفظ
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {fields.map(({ key, title, hint }) => (
          <div key={key} className="rounded-xl border border-border/70 bg-secondary/20 p-4">
            <p className="font-medium text-sm mb-0.5">{title}</p>
            <p className="text-[11px] text-muted-foreground mb-3">{hint}</p>

            {key === "attendance" && (
              <AttendanceFieldEditor
                config={draft.attendance}
                onChange={(attendance) => setDraft((d) => ({ ...d, attendance }))}
              />
            )}
            {key === "hifz" && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">مربع اختيار — ✓ = أتم الحفظ · فارغ = لم يحفظ</p>
              </div>
            )}
            {key === "rabt" && (
              <PassFailFieldEditor
                config={draft.rabt}
                onChange={(rabt) => setDraft((d) => ({ ...d, rabt }))}
                checkboxHint="✓ = مجتاز · فارغ = لم يُقيَّم"
              />
            )}
            {key === "muraja" && (
              <PassFailFieldEditor
                config={draft.muraja}
                onChange={(muraja) => setDraft((d) => ({ ...d, muraja }))}
                checkboxHint="✓ = مجتاز · فارغ = لم يُقيَّم"
              />
            )}
            {key === "wajib" && (
              <p className="text-xs text-muted-foreground">مربع اختيار — ✓ = أنجز الواجب</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
