import { useMemo, useState } from "react";
import { loadStudents } from "@/lib/mock-data";
import type { AcademicCalendar } from "@/lib/academic-context";
import { getSelectableWeeks } from "@/lib/academic-context";
import {
  defaultExportFromDate,
  downloadTeacherGradesWorkbook,
  weeksInExportRange,
} from "@/lib/grades-export-utils";
import { weekLabel } from "@/lib/arabic-numbers";
import { Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

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
    downloadTeacherGradesWorkbook(students, halaqaName, calendar, fromDate, toDate, isTalqeen);
    toast.success(`تم تصدير ${students.length} طالب — ${weekPreview.length} أسبوع`);
  };

  return (
    <div className="glass-card rounded-2xl p-6 mb-6">
      <h2 className="text-lg font-bold text-primary mb-2 flex items-center gap-2">
        <FileSpreadsheet className="w-5 h-5" /> تصدير درجات الحلقة
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        تصدير طلاب {viewerRole === "assistant" ? "المساعد" : "المعلم"} فقط — للأسابيع السابقة والحالية (حتى اليوم)
      </p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">من تاريخ</label>
          <input
            type="date"
            value={fromDate}
            min={minDate}
            max={toDate > maxDate ? maxDate : toDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">إلى تاريخ</label>
          <input
            type="date"
            value={toDate > maxDate ? maxDate : toDate}
            min={fromDate}
            max={maxDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm"
          />
        </div>
        <div className="sm:col-span-2 flex flex-col justify-end">
          <p className="text-xs text-muted-foreground mb-2">
            {students.length} طالب · {weekPreview.length > 0
              ? `الأسابيع: ${weekPreview.map((w) => weekLabel(w)).join("، ")}`
              : "لا أسابيع في هذه الفترة"}
          </p>
          <button
            type="button"
            onClick={exportGrades}
            className="px-4 py-2 rounded-lg gold-gradient text-primary-foreground font-bold flex items-center gap-2 w-fit"
          >
            <Download className="w-4 h-4" /> تصدير Excel
          </button>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground">
        يشمل: حضور · غياب · تأخر · استئذان · حفظ · ربط · مراجعة · سرد مجتاز · النسبة العامة + ورقة تفاصيل يومية
      </p>
    </div>
  );
}
