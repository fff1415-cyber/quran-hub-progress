import { useState } from "react";
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
  ALL_SCIENTIFIC_FIELDS,
  SCIENTIFIC_FIELD_LABELS,
  defaultScientificFields,
  enabledScientificFields,
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
  const [draftFields, setDraftFields] = useState<ScientificFieldsConfig>(() => ({
    ...config.fields,
  }));

  const hasSetup = enabledScientificFields(config.fields).length > 0;

  const openSetup = () => {
    setDraftFields({ ...config.fields });
    setDialogOpen(true);
  };

  const applyConfig = (next: ScientificGradesConfig) => {
    setConfig(next);
    saveScientificConfig(halaqaId, next);
    onConfigChange(next);
  };

  const toggleVisible = () => {
    if (!hasSetup) {
      openSetup();
      return;
    }
    applyConfig({ ...config, visible: !config.visible });
  };

  const confirmSetup = () => {
    const enabled = enabledScientificFields(draftFields);
    if (enabled.length === 0) {
      return false;
    }
    applyConfig({ visible: true, fields: { ...draftFields } });
    setDialogOpen(false);
    return true;
  };

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          type="button"
          variant={config.visible ? "default" : "outline"}
          size="sm"
          className="gap-1.5"
          onClick={toggleVisible}
        >
          <FlaskConical className="w-4 h-4" />
          {config.visible ? "إخفاء الدرجات العلمية" : "إظهار الدرجات العلمية"}
        </Button>
        {hasSetup && (
          <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={openSetup}>
            <Settings2 className="w-4 h-4" />
            إعداد
          </Button>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تفعيل الدرجات العلمية</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            اختر البنود التي تريد إضافة عمود درجة رقمية بجانبها. تظهر المجاميع في برنامج «درجات العلمي».
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
          <DialogFooter className="gap-2 sm:gap-0">
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
              تفعيل وحفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ScientificGradeInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
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
      className="w-full min-w-0 max-w-[44px] mx-auto px-0.5 py-1 text-center text-xs rounded border border-primary/30 bg-primary/5 focus:border-primary focus:outline-none disabled:opacity-50"
      dir="ltr"
    />
  );
}
