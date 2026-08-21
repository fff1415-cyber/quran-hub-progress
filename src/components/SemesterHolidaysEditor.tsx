import { useMemo, useState } from "react";
import {
  holidayDisplayLabel,
  serializeSemesterHolidays,
  sortSemesterHolidays,
  type SemesterHoliday,
} from "@/lib/semester-holidays";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function SemesterHolidaysEditor({
  holidays,
  onChange,
}: {
  holidays: SemesterHoliday[];
  onChange: (next: SemesterHoliday[]) => void;
}) {
  const [holidayPick, setHolidayPick] = useState("");
  const [holidayName, setHolidayName] = useState("");

  const sorted = useMemo(() => sortSemesterHolidays(holidays), [holidays]);

  const addHoliday = () => {
    if (!holidayPick) {
      toast.error("اختر تاريخاً للإجازة");
      return;
    }
    const label = holidayName.trim();
    if (!label) {
      toast.error("أدخل اسماً للإجازة (مثل: عيد الفطر)");
      return;
    }
    if (holidays.some((h) => h.date === holidayPick)) {
      toast.info("هذا التاريخ مُضاف مسبقاً");
      return;
    }
    onChange(serializeSemesterHolidays([...holidays, { date: holidayPick, name: label }]));
    setHolidayPick("");
    setHolidayName("");
  };

  const removeHoliday = (date: string) => {
    onChange(holidays.filter((h) => h.date !== date));
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-4 bg-secondary/20">
      <Label>الإجازات والعطل</Label>
      <p className="text-xs text-muted-foreground">أضف تاريخ الإجازة واسمها (مثل: إجازة منتصف الفصل)</p>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1">
          <Label htmlFor="holiday-date" className="text-xs text-muted-foreground">التاريخ</Label>
          <Input
            id="holiday-date"
            type="date"
            value={holidayPick}
            onChange={(e) => setHolidayPick(e.target.value)}
            dir="ltr"
            className="max-w-[200px] text-start"
          />
        </div>
        <div className="space-y-1 flex-1 min-w-[160px]">
          <Label htmlFor="holiday-name" className="text-xs text-muted-foreground">اسم الإجازة</Label>
          <Input
            id="holiday-name"
            value={holidayName}
            onChange={(e) => setHolidayName(e.target.value)}
            placeholder="مثال: عيد الأضحى"
            className="text-start"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addHoliday();
              }
            }}
          />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addHoliday} className="shrink-0">
          <Plus className="w-4 h-4" />
          إضافة إجازة
        </Button>
      </div>
      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground">لم تُضف إجازات بعد</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {sorted.map((h) => (
            <Badge key={h.date} variant="secondary" className="gap-1 pe-1 max-w-full">
              <span className="truncate">{holidayDisplayLabel(h)}</span>
              <button
                type="button"
                onClick={() => removeHoliday(h.date)}
                className="rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive shrink-0"
                aria-label={`حذف ${holidayDisplayLabel(h)}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
