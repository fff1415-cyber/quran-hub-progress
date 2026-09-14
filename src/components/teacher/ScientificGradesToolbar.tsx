import { useEffect, useState } from "react";
import { ChevronDown, FlaskConical, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { ATTENDANCE_OPTION_LABELS } from "@/lib/grade-input-settings";
import { toast } from "sonner";
import {
  ALL_SCIENTIFIC_ATTENDANCE_OPTIONS,
  ALL_SCIENTIFIC_FIELDS,
  SCIENTIFIC_FIELD_LABELS,
  defaultScientificFields,
  enabledScientificFields,
  isScientificProgramEnabled,
  loadScientificConfig,
  saveScientificConfig,
  validateDefaultScoresForFields,
  type ScientificDefaultScores,
  type ScientificFieldsConfig,
  type ScientificGradesConfig,
} from "@/lib/scientific-grades";

type Props = {
  halaqaId: number;
  onConfigChange: (config: ScientificGradesConfig, options?: { resetOverrides?: boolean }) => void;
};

function cloneDefaultScores(scores: ScientificDefaultScores): ScientificDefaultScores {
  return {
    ...scores,
    attendance: scores.attendance ? { ...scores.attendance } : undefined,
  };
}

function scoreInputClassName() {
  return "w-full max-w-[80px] px-2 py-1.5 text-center text-xs rounded border border-border bg-input focus:border-primary focus:outline-none";
}

export function ScientificGradesToolbar({ halaqaId, onConfigChange }: Props) {
  const [config, setConfig] = useState(() => loadScientificConfig(halaqaId));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [draftFields, setDraftFields] = useState<ScientificFieldsConfig>(() => ({
    ...config.fields,
  }));
  const [draftScores, setDraftScores] = useState<ScientificDefaultScores>(() =>
    cloneDefaultScores(config.defaultScores),
  );

  useEffect(() => {
    const next = loadScientificConfig(halaqaId);
    setConfig(next);
  }, [halaqaId]);

  const isActive = isScientificProgramEnabled(config);

  const openSetup = () => {
    const fresh = loadScientificConfig(halaqaId);
    setDraftFields({ ...fresh.fields });
    setDraftScores(cloneDefaultScores(fresh.defaultScores));
    setDialogOpen(true);
  };

  const applyConfig = (next: ScientificGradesConfig, resetOverrides = false) => {
    setConfig(next);
    saveScientificConfig(halaqaId, next);
    onConfigChange(next, resetOverrides ? { resetOverrides: true } : undefined);
  };

  const updateAttendanceScore = (option: (typeof ALL_SCIENTIFIC_ATTENDANCE_OPTIONS)[number], raw: string) => {
    if (raw !== "" && !/^-?\d*\.?\d*$/.test(raw)) return;
    setDraftScores((prev) => {
      const attendance = { ...(prev.attendance ?? {}) };
      if (raw.trim() === "") delete attendance[option];
      else attendance[option] = raw;
      return { ...prev, attendance };
    });
  };

  const updateTaskScore = (field: "hifz" | "rabt" | "muraja", raw: string) => {
    if (raw !== "" && !/^-?\d*\.?\d*$/.test(raw)) return;
    setDraftScores((prev) => {
      const next = { ...prev };
      if (raw.trim() === "") delete next[field];
      else next[field] = raw;
      return next;
    });
  };

  const confirmSetup = () => {
    const err = validateDefaultScoresForFields(draftFields, draftScores);
    if (err) {
      toast.error(err);
      return false;
    }
    const next: ScientificGradesConfig = {
      visible: true,
      fields: { ...draftFields },
      defaultScores: cloneDefaultScores(draftScores),
    };
    applyConfig(next, true);
    setDialogOpen(false);
    toast.success(isActive ? "تم حفظ إعدادات البرنامج العلمي" : "تم تفعيل البرنامج العلمي");
    return true;
  };

  const disableProgram = () => {
    const next: ScientificGradesConfig = {
      visible: false,
      fields: defaultScientificFields(),
      defaultScores: {},
    };
    applyConfig(next);
    setDisableOpen(false);
    setDialogOpen(false);
  };

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {isActive ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="default" size="sm" className="gap-1.5">
                <FlaskConical className="w-4 h-4" />
                البرنامج العلمي — مفعّل
                <ChevronDown className="w-3.5 h-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={openSetup} className="gap-2 cursor-pointer">
                <Settings2 className="w-4 h-4" />
                تعديل البنود والنقاط
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setDisableOpen(true)}
                className="gap-2 cursor-pointer text-destructive focus:text-destructive"
              >
                إيقاف التفعيل
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={openSetup}>
            <FlaskConical className="w-4 h-4" />
            تفعيل البرنامج العلمي
          </Button>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isActive ? "تعديل البرنامج العلمي" : "تفعيل البرنامج العلمي"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            فعّل البنود وحدّد نقاط كل بند. تُحسب الدرجات تلقائياً في «برنامج الحلقة» عند التحضير.
          </p>
          <div className="space-y-4 py-2">
            {ALL_SCIENTIFIC_FIELDS.map((field) => (
              <div key={field} className="rounded-lg border border-border overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-secondary/30">
                  <Label htmlFor={`sci-${field}`} className="font-medium cursor-pointer">
                    {SCIENTIFIC_FIELD_LABELS[field]}
                  </Label>
                  <Switch
                    id={`sci-${field}`}
                    checked={draftFields[field]}
                    onCheckedChange={(checked) =>
                      setDraftFields((prev) => ({ ...prev, [field]: checked }))
                    }
                  />
                </div>
                {draftFields[field] && field === "attendance" && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 border-t border-border/50">
                    {ALL_SCIENTIFIC_ATTENDANCE_OPTIONS.map((opt) => (
                      <div key={opt} className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground block text-center">
                          {ATTENDANCE_OPTION_LABELS[opt]}
                        </Label>
                        <input
                          type="text"
                          inputMode="decimal"
                          dir="ltr"
                          placeholder="0"
                          value={draftScores.attendance?.[opt] ?? ""}
                          onChange={(e) => updateAttendanceScore(opt, e.target.value)}
                          className={scoreInputClassName()}
                        />
                      </div>
                    ))}
                  </div>
                )}
                {draftFields[field] && field !== "attendance" && (
                  <div className="p-3 border-t border-border/50 flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">درجة {SCIENTIFIC_FIELD_LABELS[field]}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      dir="ltr"
                      placeholder="0"
                      value={draftScores[field] ?? ""}
                      onChange={(e) => updateTaskScore(field, e.target.value)}
                      className={scoreInputClassName()}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          {enabledScientificFields(draftFields).length === 0 && (
            <p className="text-xs text-destructive">فعّل بنداً واحداً على الأقل</p>
          )}
          <DialogFooter className="gap-2 sm:gap-0 flex-col sm:flex-row">
            {isActive && (
              <Button
                type="button"
                variant="outline"
                className="text-destructive border-destructive/30 hover:bg-destructive/10 sm:mr-auto"
                onClick={() => {
                  setDialogOpen(false);
                  setDisableOpen(true);
                }}
              >
                إيقاف البرنامج
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!confirmSetup()) return;
              }}
              disabled={enabledScientificFields(draftFields).length === 0}
            >
              {isActive ? "حفظ وإتمام" : "تفعيل وإتمام"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={disableOpen} onOpenChange={setDisableOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>إيقاف البرنامج العلمي؟</AlertDialogTitle>
            <AlertDialogDescription>
              ستُخفى أعمدة الدرجات العلمية عن جدول المعلّم ولن تُحسب في برنامج الحلقة. الدرجات
              المحفوظة تبقى مخزّنة ويمكن استعادتها بتفعيل البرنامج من جديد.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={disableProgram}
            >
              إيقاف البرنامج
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function ScientificGradeInput({
  value,
  onChange,
  disabled,
  overridden,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  overridden?: boolean;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "" || /^-?\d*\.?\d*$/.test(v)) onChange(v);
      }}
      placeholder="—"
      title={overridden ? "درجة معدّلة يدوياً" : "درجة تلقائية — يمكن التعديل"}
      className={cn(
        "w-full min-w-0 max-w-[44px] mx-auto px-0.5 py-1 text-center text-xs rounded border focus:outline-none disabled:opacity-50",
        overridden
          ? "border-warning/50 bg-warning/10 focus:border-warning"
          : "border-primary/30 bg-primary/5 focus:border-primary",
      )}
      dir="ltr"
    />
  );
}
