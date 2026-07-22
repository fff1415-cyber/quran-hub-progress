import type { HifzValue } from "@/lib/mock-data";
import { HIFZ_LABELS } from "@/lib/mock-data";

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
      className="w-full bg-input border border-border rounded px-1 py-1 text-xs"
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
      className="w-full bg-input border border-border rounded px-1 py-1 text-xs font-bold"
    >
      <option value="">{HIFZ_LABELS[""]}</option>
      {!goldOnly && <option value="half">{HIFZ_LABELS["half"]}</option>}
      <option value="one">{HIFZ_LABELS["one"]}</option>
      <option value="two">{HIFZ_LABELS["two"]}</option>
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
      className="w-full bg-input border border-border rounded px-1 py-1 text-xs"
    >
      <option value="">—</option>
      <option value="pass">مجتاز</option>
      <option value="fail">راسب</option>
    </select>
  );
}
