import type { HifzValue } from "@/lib/mock-data";
import { COMPENSATION_FACE_OPTIONS, COMPENSATION_MURAJA_FACE_OPTIONS, HIFZ_LABELS } from "@/lib/mock-data";
import { useGradeInputSettings } from "@/contexts/GradeInputSettingsContext";
import {
  ATTENDANCE_OPTION_LABELS,
  PASS_FAIL_LABELS,
  type AttendanceOption,
  type PassFailOption,
} from "@/lib/grade-input-settings";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

/** Fixed-width selects for the halaqa grade table (width set by colgroup). */
export const gradeCellSelectClass =
  "w-full max-w-full min-w-0 bg-input border border-border rounded px-1 py-1 text-xs truncate";

function GradeCellCheckbox({
  checked,
  onChange,
  disabled,
  titleChecked,
  titleUnchecked,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  titleChecked?: string;
  titleUnchecked?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      title={checked ? titleChecked : titleUnchecked}
      className={cn(
        "w-6 h-6 mx-auto rounded border-2 flex items-center justify-center transition-all",
        checked ? "bg-primary border-primary" : "border-border bg-input hover:border-primary/50",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      {checked && <Check className="w-4 h-4 text-primary-foreground" />}
    </button>
  );
}

export function AttSelect({
  value,
  onChange,
  talqeen,
}: {
  value: string;
  onChange: (v: "present" | "late" | "excused" | "absent" | "") => void;
  talqeen?: boolean;
}) {
  const { settings } = useGradeInputSettings();
  const cfg = settings.attendance;

  if (cfg.mode === "checkbox") {
    const checked = value === "present";
    return (
      <GradeCellCheckbox
        checked={checked}
        titleChecked="حاضر"
        titleUnchecked="غائب"
        onChange={(next) => onChange(next ? "present" : "absent")}
      />
    );
  }

  let options = cfg.options;
  if (talqeen) {
    options = options.filter((o) => o !== "late" && o !== "excused");
    if (options.length === 0) options = ["present", "absent"];
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as AttendanceOption | "")}
      className={gradeCellSelectClass}
    >
      <option value="">—</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>{ATTENDANCE_OPTION_LABELS[opt]}</option>
      ))}
    </select>
  );
}

export function HifzCheckbox({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <GradeCellCheckbox
      checked={checked}
      disabled={disabled}
      titleChecked="قرأ مقطعاً واحداً"
      titleUnchecked="لم يقرأ"
      onChange={onChange}
    />
  );
}

/** @deprecated Use HifzCheckbox — kept for legacy exports/reports. */
export function HifzSelect({
  value,
  onChange,
  goldOnly,
  disabled,
}: {
  value: HifzValue;
  onChange: (v: HifzValue) => void;
  goldOnly?: boolean;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as HifzValue)}
      className={cn(gradeCellSelectClass, "font-bold")}
    >
      <option value="">{HIFZ_LABELS[""]}</option>
      {!goldOnly && <option value="half">{HIFZ_LABELS["half"]}</option>}
      <option value="one">{HIFZ_LABELS["one"]}</option>
      <option value="two">{HIFZ_LABELS["two"]}</option>
    </select>
  );
}

export function CustomFieldSelect({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={gradeCellSelectClass}
      title={options.join(" · ")}
    >
      <option value="">—</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}

export function CompensationSelect({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={String(value)}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn(gradeCellSelectClass, "font-bold text-center")}
      title="أوجه حفظ زائدة (تعويض)"
    >
      {COMPENSATION_FACE_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

export function MurajaCompensationSelect({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={String(value)}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn(gradeCellSelectClass, "font-bold text-center")}
      title="أوجه مراجعة زائدة (تعويض)"
    >
      {COMPENSATION_MURAJA_FACE_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

export function PassFail({
  value,
  onChange,
  disabled,
  field = "rabt",
}: {
  value: string;
  onChange: (v: "pass" | "fail" | "") => void;
  disabled?: boolean;
  field?: "rabt" | "muraja";
}) {
  const { settings } = useGradeInputSettings();
  const cfg = field === "muraja" ? settings.muraja : settings.rabt;

  if (cfg.mode === "checkbox") {
    const checked = value === "pass";
    return (
      <GradeCellCheckbox
        checked={checked}
        disabled={disabled}
        titleChecked="مجتاز"
        titleUnchecked="لم يُقيَّم"
        onChange={(next) => onChange(next ? "pass" : "")}
      />
    );
  }

  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as PassFailOption | "")}
      className={gradeCellSelectClass}
    >
      <option value="">—</option>
      {cfg.options.map((opt) => (
        <option key={opt} value={opt}>{PASS_FAIL_LABELS[opt]}</option>
      ))}
    </select>
  );
}
