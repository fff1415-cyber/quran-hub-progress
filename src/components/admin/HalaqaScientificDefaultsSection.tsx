import { useMemo, useState } from "react";
import { loadHalaqat } from "@/lib/mock-data";
import {
  ALL_SCIENTIFIC_FIELDS,
  SCIENTIFIC_FIELD_LABELS,
  loadScientificConfig,
  saveScientificConfig,
  type ScientificDefaultScores,
  type ScientificGradeField,
} from "@/lib/scientific-grades";
import { FlaskConical, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const TASK_FIELDS: ScientificGradeField[] = ["hifz", "rabt", "muraja"];

function scoreInputValue(scores: ScientificDefaultScores, field: ScientificGradeField): string {
  return scores[field] ?? "";
}

function patchScore(
  scores: ScientificDefaultScores,
  field: ScientificGradeField,
  raw: string,
): ScientificDefaultScores {
  const trimmed = raw.trim();
  const next = { ...scores };
  if (trimmed === "") {
    delete next[field];
  } else {
    next[field] = trimmed;
  }
  return next;
}

export function HalaqaScientificDefaultsSection() {
  const halaqat = useMemo(() => loadHalaqat(), []);
  const [drafts, setDrafts] = useState<Record<number, ScientificDefaultScores>>(() => {
    const init: Record<number, ScientificDefaultScores> = {};
    for (const h of loadHalaqat()) {
      init[h.id] = { ...loadScientificConfig(h.id).defaultScores };
    }
    return init;
  });
  const [savingId, setSavingId] = useState<number | null>(null);

  const updateDraft = (halaqaId: number, field: ScientificGradeField, raw: string) => {
    setDrafts((prev) => ({
      ...prev,
      [halaqaId]: patchScore(prev[halaqaId] ?? {}, field, raw),
    }));
  };

  const saveHalaqa = (halaqaId: number, halaqaName: string) => {
    setSavingId(halaqaId);
    try {
      const config = loadScientificConfig(halaqaId);
      saveScientificConfig(halaqaId, {
        ...config,
        defaultScores: { ...(drafts[halaqaId] ?? {}) },
      });
      toast.success(`تم حفظ درجات حلقة «${halaqaName}»`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSavingId(null);
    }
  };

  if (halaqat.length === 0) {
    return null;
  }

  return (
    <div className="glass-card rounded-2xl p-5 space-y-4">
      <div>
        <h3 className="font-bold text-primary flex items-center gap-2">
          <FlaskConical className="w-4 h-4" />
          الدرجات العلمية الافتراضية — لكل حلقة
        </h3>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          عند تفعيل المعلّم للحفظ أو الربط أو المراجعة (✓)، تُثبَّت هذه الدرجة تلقائياً في عمود الدرجة
          العلمية. يمكن للمعلّم تعديلها يدوياً لاحقاً إن لزم.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px] border-collapse">
          <thead>
            <tr className="text-right text-muted-foreground border-b border-border">
              <th className="p-2 font-medium">الحلقة</th>
              {TASK_FIELDS.map((field) => (
                <th key={field} className="p-2 font-medium text-center min-w-[88px]">
                  {SCIENTIFIC_FIELD_LABELS[field]}
                </th>
              ))}
              <th className="p-2 w-16" />
            </tr>
          </thead>
          <tbody>
            {halaqat.map((h) => {
              const scores = drafts[h.id] ?? {};
              return (
                <tr key={h.id} className="border-b border-border/40 hover:bg-muted/20">
                  <td className="p-2 font-medium">
                    {h.name}
                    {h.isTalqeen && (
                      <span className="mr-1 text-[10px] text-muted-foreground">· تلقين</span>
                    )}
                  </td>
                  {TASK_FIELDS.map((field) => (
                    <td key={field} className="p-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        dir="ltr"
                        placeholder="—"
                        value={scoreInputValue(scores, field)}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "" || /^-?\d*\.?\d*$/.test(v)) {
                            updateDraft(h.id, field, v);
                          }
                        }}
                        className="w-full max-w-[80px] mx-auto block px-2 py-1.5 text-center text-xs rounded border border-border bg-input focus:border-primary focus:outline-none"
                      />
                    </td>
                  ))}
                  <td className="p-2 text-center">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 px-2"
                      disabled={savingId === h.id}
                      onClick={() => saveHalaqa(h.id, h.name)}
                    >
                      {savingId === h.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-muted-foreground">
        تُستخدم فقط عند تفعيل «الدرجات العلمية» للحلقة وبند الحفظ/الربط/المراجعة. البنود:{" "}
        {ALL_SCIENTIFIC_FIELDS.map((f) => SCIENTIFIC_FIELD_LABELS[f]).join(" · ")}.
      </p>
    </div>
  );
}
