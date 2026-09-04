import { useMemo, useState } from "react";
import { loadGrades, loadHalaqat, loadStudents } from "@/lib/mock-data";
import { ATTENDANCE_OPTION_LABELS, type AttendanceOption } from "@/lib/grade-input-settings";
import {
  ALL_SCIENTIFIC_ATTENDANCE_OPTIONS,
  SCIENTIFIC_FIELD_LABELS,
  loadScientificConfig,
  reapplyScientificScoresForHalaqa,
  saveScientificConfig,
  type ScientificAttendanceScores,
  type ScientificDefaultScores,
  type ScientificGradeField,
} from "@/lib/scientific-grades";
import { FlaskConical, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const TASK_FIELDS: ScientificGradeField[] = ["hifz", "rabt", "muraja"];

function scoreInputClassName() {
  return "w-full max-w-[72px] mx-auto block px-1.5 py-1.5 text-center text-xs rounded border border-border bg-input focus:border-primary focus:outline-none";
}

function patchAttendanceScore(
  scores: ScientificDefaultScores,
  option: AttendanceOption,
  raw: string,
): ScientificDefaultScores {
  const trimmed = raw.trim();
  const attendance: ScientificAttendanceScores = { ...(scores.attendance ?? {}) };
  if (trimmed === "") {
    delete attendance[option];
  } else {
    attendance[option] = trimmed;
  }
  const next = { ...scores };
  if (Object.keys(attendance).length === 0) {
    delete next.attendance;
  } else {
    next.attendance = attendance;
  }
  return next;
}

function patchTaskScore(
  scores: ScientificDefaultScores,
  field: "hifz" | "rabt" | "muraja",
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

  const updateAttendanceDraft = (halaqaId: number, option: AttendanceOption, raw: string) => {
    if (raw !== "" && !/^-?\d*\.?\d*$/.test(raw)) return;
    setDrafts((prev) => ({
      ...prev,
      [halaqaId]: patchAttendanceScore(prev[halaqaId] ?? {}, option, raw),
    }));
  };

  const updateTaskDraft = (halaqaId: number, field: "hifz" | "rabt" | "muraja", raw: string) => {
    if (raw !== "" && !/^-?\d*\.?\d*$/.test(raw)) return;
    setDrafts((prev) => ({
      ...prev,
      [halaqaId]: patchTaskScore(prev[halaqaId] ?? {}, field, raw),
    }));
  };

  const saveHalaqa = (halaqaId: number, halaqaName: string) => {
    setSavingId(halaqaId);
    try {
      const config = loadScientificConfig(halaqaId);
      const nextConfig = {
        ...config,
        defaultScores: { ...(drafts[halaqaId] ?? {}) },
      };
      saveScientificConfig(halaqaId, nextConfig);
      const studentIds = loadStudents()
        .filter((s) => s.halaqaId === halaqaId)
        .map((s) => s.id);
      reapplyScientificScoresForHalaqa(halaqaId, loadGrades(), studentIds, nextConfig);
      toast.success(`تم حفظ نقاط برنامج «${halaqaName}» العلمي`);
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
          نقاط البرنامج العلمي — لكل حلقة
        </h3>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          يضبط المدير النقاط مرة واحدة هنا. المعلّم يسجّل التحضير العادي فقط (حضور · حفظ · ربط · مراجعة)
          وتُحسب النقاط تلقائياً في برنامج الحلقة الخاص — بدون أعمدة إضافية في جدول التحضير.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[920px] border-collapse">
          <thead>
            <tr className="text-right text-muted-foreground border-b border-border">
              <th className="p-2 font-medium sticky right-0 bg-card z-10" rowSpan={2}>الحلقة</th>
              <th className="p-2 font-medium text-center border-r border-border/40" colSpan={4}>
                {SCIENTIFIC_FIELD_LABELS.attendance}
              </th>
              {TASK_FIELDS.map((field) => (
                <th key={field} className="p-2 font-medium text-center min-w-[72px]" rowSpan={2}>
                  {SCIENTIFIC_FIELD_LABELS[field]}
                </th>
              ))}
              <th className="p-2 w-16" rowSpan={2} />
            </tr>
            <tr className="text-right text-[10px] text-muted-foreground border-b border-border">
              {ALL_SCIENTIFIC_ATTENDANCE_OPTIONS.map((opt) => (
                <th key={opt} className="p-1.5 font-medium text-center min-w-[72px] border-r border-border/30">
                  {ATTENDANCE_OPTION_LABELS[opt]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {halaqat.map((h) => {
              const scores = drafts[h.id] ?? {};
              return (
                <tr key={h.id} className="border-b border-border/40 hover:bg-muted/20">
                  <td className="p-2 font-medium sticky right-0 bg-card z-10">
                    {h.name}
                    {h.isTalqeen && (
                      <span className="mr-1 text-[10px] text-muted-foreground">· تلقين</span>
                    )}
                  </td>
                  {ALL_SCIENTIFIC_ATTENDANCE_OPTIONS.map((opt) => (
                    <td key={opt} className="p-1.5 border-r border-border/20">
                      <input
                        type="text"
                        inputMode="decimal"
                        dir="ltr"
                        placeholder="—"
                        value={scores.attendance?.[opt] ?? ""}
                        onChange={(e) => updateAttendanceDraft(h.id, opt, e.target.value)}
                        className={scoreInputClassName()}
                      />
                    </td>
                  ))}
                  {TASK_FIELDS.map((field) => (
                    <td key={field} className="p-1.5">
                      <input
                        type="text"
                        inputMode="decimal"
                        dir="ltr"
                        placeholder="—"
                        value={scores[field] ?? ""}
                        onChange={(e) => updateTaskDraft(h.id, field, e.target.value)}
                        className={scoreInputClassName()}
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
        يفعّل المعلّم البنود من صفحته؛ النقاط تظهر في «برنامج الحلقة» فقط عند تسجيل التحضير.
      </p>
    </div>
  );
}
