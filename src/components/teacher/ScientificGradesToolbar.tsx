import { useEffect, useState } from "react";
import { FlaskConical, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
import {
  ALL_SCIENTIFIC_FIELDS,
  SCIENTIFIC_FIELD_LABELS,
  defaultScientificFields,
  enabledScientificFields,
  isScientificProgramEnabled,
  loadScientificConfig,
  saveScientificConfig,
  type ScientificFieldsConfig,
  type ScientificGradesConfig,
} from "@/lib/scientific-grades";

type Props = {
  halaqaId: number;
  onConfigChange: (config: ScientificGradesConfig) => void;
};

export function ScientificGradesToolbar({ halaqaId, onConfigChange }: Props) {
  const [config, setConfig] = useState(() => loadScientificConfig(halaqaId));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [draftFields, setDraftFields] = useState<ScientificFieldsConfig>(() => ({
    ...config.fields,
  }));

  useEffect(() => {
    setConfig(loadScientificConfig(halaqaId));
  }, [halaqaId]);

  const isActive = isScientificProgramEnabled(config);

  const openSetup = () => {
    setDraftFields({ ...config.fields });
    setDialogOpen(true);
  };

  const applyConfig = (next: ScientificGradesConfig) => {
    setConfig(next);
    saveScientificConfig(halaqaId, next);
    onConfigChange(next);
  };

  const confirmSetup = () => {
    const enabled = enabledScientificFields(draftFields);
    if (enabled.length === 0) {
      return false;
    }
    const fresh = loadScientificConfig(halaqaId);
    const next: ScientificGradesConfig = {
      visible: true,
      fields: { ...draftFields },
      defaultScores: fresh.defaultScores,
    };
    applyConfig(next);
    setDialogOpen(false);
    return true;
  };

  const disableProgram = () => {
    const fresh = loadScientificConfig(halaqaId);
    const next: ScientificGradesConfig = {
      visible: false,
      fields: defaultScientificFields(),
      defaultScores: fresh.defaultScores,
    };
    applyConfig(next);
    setDisableOpen(false);
    setDialogOpen(false);
  };

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          type="button"
          variant={isActive ? "default" : "outline"}
          size="sm"
          className="gap-1.5"
          onClick={openSetup}
        >
          <FlaskConical className="w-4 h-4" />
          {isActive ? "البرنامج العلمي — مفعّل" : "تفعيل البرنامج العلمي"}
        </Button>
        {isActive && (
          <>
            <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={openSetup}>
              <Settings2 className="w-4 h-4" />
              تعديل البنود
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setDisableOpen(true)}
            >
              إيقاف البرنامج
            </Button>
          </>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isActive ? "تعديل البرنامج العلمي" : "تفعيل البرنامج العلمي"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            اختر البنود التي تُحسب في «برنامج الحلقة». تُملأ الدرجة تلقائياً من نقاط المدير
            عند التحضير، ويمكنك زيادتها أو تقليلها يدوياً.
          </p>
          <div className="space-y-3 py-2">
            {ALL_SCIENTIFIC_FIELDS.map((field) => (
              <div key={field} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
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
              {isActive ? "حفظ التعديلات" : "تفعيل وحفظ"}
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
      title={overridden ? "درجة معدّلة يدوياً عن نقطة المدير" : "درجة معتمدة من المدير — يمكن التعديل"}
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
