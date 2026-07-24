import type { HifzValue } from "@/lib/mock-data";
import { HIFZ_LABELS } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

/** Fixed-width selects for the halaqa grade table (width set by colgroup). */
export const gradeCellSelectClass =
  "w-full max-w-full min-w-0 bg-input border border-border rounded px-1 py-1 text-xs truncate";

export function AttSelect({
  value,
  onChange,
  talqeen,
}: {
  value: string;
  onChange: (v: "present" | "late" | "excused" | "absent" | "") => void;
  talqeen?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as "present" | "late" | "excused" | "absent" | "")}
      className={gradeCellSelectClass}
    >
      <option value="">—</option>
      <option value="present">حاضر</option>
      {!talqeen && <option value="late">متأخر</option>}
      {!talqeen && <option value="excused">مستأذن</option>}
      <option value="absent">غائب</option>
    </select>
  );
}

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
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
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

export function PassFail({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: "pass" | "fail" | "") => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as "pass" | "fail" | "")}
      className={gradeCellSelectClass}
    >
      <option value="">—</option>
      <option value="pass">مجتاز</option>
      <option value="fail">راسب</option>
    </select>
  );
}
