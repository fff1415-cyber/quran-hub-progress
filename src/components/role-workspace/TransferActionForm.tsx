import { useState } from "react";
import { Loader2 } from "lucide-react";

type Props = {
  roleLabel: string;
  submitLabel?: string;
  busy?: boolean;
  onSubmit: (text: string) => void;
  onCancel?: () => void;
};

export function TransferActionForm({
  roleLabel,
  submitLabel = "تسجيل الإجراء",
  busy = false,
  onSubmit,
  onCancel,
}: Props) {
  const [text, setText] = useState("");

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
      <label className="text-xs font-bold text-primary block">
        الإجراء المتخذ ({roleLabel}) — مطلوب
      </label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="مثال: تم التواصل مع ولي الأمر · جلسة تربوية · إنذار..."
        className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm resize-none"
        disabled={busy}
      />
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={handleSubmit}
          className="px-4 py-2 rounded-lg gold-gradient text-primary-foreground text-sm font-bold disabled:opacity-50 flex items-center gap-2"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-secondary/50 disabled:opacity-50"
          >
            إلغاء
          </button>
        )}
      </div>
    </div>
  );
}

export function TransferActionsList({
  actions,
}: {
  actions: Array<{ role?: string; byName: string; text: string; at: string }>;
}) {
  if (actions.length === 0) return null;
  return (
    <div className="space-y-1.5 mt-2">
      {actions.map((a, i) => (
        <div key={`${a.at}-${i}`} className="rounded-lg bg-secondary/40 border border-border p-2 text-xs">
          <div className="flex justify-between gap-2 flex-wrap text-muted-foreground mb-0.5">
            <span className="font-bold text-foreground">
              {a.byName}{a.role ? ` · ${a.role}` : ""}
            </span>
            <span>{new Date(a.at).toLocaleString("ar-SA")}</span>
          </div>
          <p className="text-sm">{a.text}</p>
        </div>
      ))}
    </div>
  );
}
