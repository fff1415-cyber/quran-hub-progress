import { useMemo, useState } from "react";
import { loadStudents } from "@/lib/mock-data";
import type { AcademicCalendar } from "@/lib/academic-context";
import { getSelectableWeeks } from "@/lib/academic-context";
import {
  defaultExportFromDate,
  downloadTeacherGradesWorkbook,
  weeksInExportRange,
} from "@/lib/grades-export-utils";
import { loadHalaqaCustomFields } from "@/lib/halaqa-custom-fields";
import { weekLabel } from "@/lib/arabic-numbers";
import { Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface TeacherGradesExportProps {
  halaqaId: number;
  halaqaName: string;
  isTalqeen: boolean;
  calendar: AcademicCalendar;
  viewerRole: "teacher" | "assistant";
}

export function TeacherGradesExport({
  halaqaId,
  halaqaName,
  isTalqeen,
  calendar,
  viewerRole,
}: TeacherGradesExportProps) {
  const [open, setOpen] = useState(false);
  const [fromDate, setFromDate] = useState(() => defaultExportFromDate(calendar));
  const [toDate, setToDate] = useState(() => calendar.operationalDate);

  const students = useMemo(() => {
    const all = loadStudents().filter((s) => s.halaqaId === halaqaId);
    return viewerRole === "assistant"
      ? all.filter((s) => s.assignedTo !== "teacher")
      : all.filter((s) => s.assignedTo !== "assistant");
  }, [halaqaId, viewerRole]);

  const weekPreview = useMemo(
    () => weeksInExportRange(calendar, fromDate, toDate),
    [calendar, fromDate, toDate],
  );

  const maxDate = calendar.operationalDate;
  const minDate = useMemo(() => {
    const selectable = getSelectableWeeks(calendar);
    return selectable[0]?.start_date ?? calendar.semester?.start_date ?? maxDate;
  }, [calendar, maxDate]);

  const openDialog = () => {
    setFromDate(defaultExportFromDate(calendar));
    setToDate(calendar.operationalDate);
    setOpen(true);
  };

  const exportGrades = () => {
    if (!fromDate || !toDate) {
      toast.error("حدّد تاريخ البداية والنهاية");
      return;
    }
    if (fromDate > toDate) {
      toast.error("تاريخ البداية يجب أن يكون قبل النهاية");
      return;
    }
    if (toDate > maxDate) {
      toast.error("لا يمكن التصدير لتاريخ مستقبلي");
      return;
    }
    if (students.length === 0) {
      toast.error("لا يوجد طلاب في هذه الحلقة");
      return;
    }
    if (weekPreview.length === 0) {
      toast.error("لا توجد أسابيع في الفترة المختارة");
      return;
    }
    downloadTeacherGradesWorkbook(
      students,
      halaqaName,
      calendar,
      fromDate,
      toDate,
      isTalqeen,
      loadHalaqaCustomFields(halaqaId),
    );
    toast.success(`تم تصدير ${students.length} طالب — ${weekPreview.length} أسبوع`);
    setOpen(false);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={openDialog}
        className="gap-1.5 shrink-0 border-primary/30 text-primary hover:bg-primary/10"
      >
        <FileSpreadsheet className="w-4 h-4" />
        <span className="hidden sm:inline">تصدير Excel</span>
        <span className="sm:hidden">تصدير</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <FileSpreadsheet className="w-5 h-5" />
              تصدير درجات الحلقة
            </DialogTitle>
            <DialogDescription>
              اختر الفترة ثم حمّل ملف Excel — {students.length} طالب
              {viewerRole === "assistant" ? " (المساعد)" : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="export-from">من تاريخ</Label>
                <Input
                  id="export-from"
                  type="date"
                  value={fromDate}
                  min={minDate}
                  max={toDate > maxDate ? maxDate : toDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  dir="ltr"
                  className="text-start"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="export-to">إلى تاريخ</Label>
                <Input
                  id="export-to"
                  type="date"
                  value={toDate > maxDate ? maxDate : toDate}
                  min={fromDate}
                  max={maxDate}
                  onChange={(e) => setToDate(e.target.value)}
                  dir="ltr"
                  className="text-start"
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground rounded-lg bg-secondary/40 px-3 py-2">
              {weekPreview.length > 0
                ? `${weekPreview.length} أسبوع: ${weekPreview.map((w) => weekLabel(w)).join("، ")}`
                : "لا أسابيع في هذه الفترة"}
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button type="button" onClick={exportGrades} className="gold-gradient text-primary-foreground gap-2">
              <Download className="w-4 h-4" />
              تصدير
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
