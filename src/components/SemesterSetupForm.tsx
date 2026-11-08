import { useCallback, useEffect, useMemo, useState } from "react";
import {
  generateAcademicWeeks,
  WEEKDAY_OPTIONS,
  formatDateArabic,
  type GeneratedAcademicWeek,
} from "@/lib/calendar-generator";
import { getToken } from "@/lib/cloud-sync";
import { secureCreateSemester, secureGetActiveSemester } from "@/lib/secure-data.functions";
import { clearCalendarCache, fetchActiveCalendar } from "@/lib/academic-context";
import { resetGradesForNewSemester } from "@/lib/mock-data";
import { resetWeeklyTestsForNewSemester } from "@/lib/weekly-tests";
import {
  holidayDateStrings,
  serializeSemesterHolidays,
  type SemesterHoliday,
} from "@/lib/semester-holidays";
import { exportSemesterGradesExcel } from "@/lib/grades-semester-export";
import { SemesterHolidaysEditor } from "@/components/SemesterHolidaysEditor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CalendarDays, Eye, Save, Loader2, Download } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_WORKING_DAYS = [0, 1, 2, 3, 4];

interface ActiveSemesterSnapshot {
  name: string;
  weeks_count: number;
}

export function SemesterSetupForm() {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [weeksCount, setWeeksCount] = useState(18);
  const [workingDays, setWorkingDays] = useState<number[]>(DEFAULT_WORKING_DAYS);
  const [holidays, setHolidays] = useState<SemesterHoliday[]>([]);
  const [preview, setPreview] = useState<GeneratedAcademicWeek[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeSemester, setActiveSemester] = useState<ActiveSemesterSnapshot | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  const serializedHolidays = useMemo(() => serializeSemesterHolidays(holidays), [holidays]);

  const loadActiveSemester = useCallback(async () => {
    try {
      const token = getToken();
      if (!token) {
        setActiveSemester(null);
        return;
      }
      const res = await secureGetActiveSemester({ data: { token } });
      const sem = res.semester as Record<string, unknown> | null;
      if (!sem || typeof sem.name !== "string") {
        setActiveSemester(null);
        return;
      }
      setActiveSemester({
        name: sem.name,
        weeks_count: Number(sem.weeks_count ?? 18) || 18,
      });
    } catch {
      setActiveSemester(null);
    }
  }, []);

  useEffect(() => {
    void loadActiveSemester();
  }, [loadActiveSemester]);

  const toggleWorkingDay = (day: number) => {
    setWorkingDays((cur) => {
      if (cur.includes(day)) {
        const next = cur.filter((d) => d !== day);
        return next.length === 0 ? cur : next.sort((a, b) => a - b);
      }
      return [...cur, day].sort((a, b) => a - b);
    });
    setPreview(null);
  };

  const validateForm = (): boolean => {
    if (!name.trim()) {
      toast.error("أدخل اسم الفصل الدراسي");
      return false;
    }
    if (!startDate) {
      toast.error("حدّد تاريخ بداية الفصل");
      return false;
    }
    if (weeksCount < 1 || weeksCount > 52) {
      toast.error("عدد الأسابيع يجب أن يكون بين 1 و 52");
      return false;
    }
    if (workingDays.length === 0) {
      toast.error("اختر يوم عمل واحداً على الأقل");
      return false;
    }
    return true;
  };

  const buildInput = () => ({
    startDate,
    weeksCount,
    workingDays,
    excludedDates: holidayDateStrings(serializedHolidays),
  });

  const handlePreview = () => {
    if (!validateForm()) return;
    setPreviewing(true);
    try {
      const weeks = generateAcademicWeeks(buildInput());
      setPreview(weeks);
      toast.success(`تم توليد ${weeks.length} أسبوعاً أكاديمياً`);
    } catch (e) {
      setPreview(null);
      toast.error(e instanceof Error ? e.message : "فشل توليد الجدول");
    } finally {
      setPreviewing(false);
    }
  };

  const commitNewSemester = async () => {
    if (!validateForm()) return;

    let weeks: GeneratedAcademicWeek[];
    try {
      weeks = generateAcademicWeeks(buildInput());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل توليد الأسابيع قبل الحفظ");
      return;
    }

    setSaving(true);
    try {
      const token = getToken();
      if (!token) throw new Error("الجلسة منتهية — أعد تسجيل الدخول");

      const result = await secureCreateSemester({
        data: {
          token,
          semester: {
            name: name.trim(),
            start_date: startDate,
            weeks_count: weeksCount,
            working_days: workingDays,
            excluded_dates: serializedHolidays,
          },
          weeks: weeks.map((w) => ({
            week_number: w.weekNumber,
            start_date: w.startDate,
            end_date: w.endDate,
          })),
        },
      });

      clearCalendarCache();
      resetGradesForNewSemester(result.id);
      resetWeeklyTestsForNewSemester(result.id);
      await fetchActiveCalendar(true);
      try {
        const { pushAppState } = await import("@/lib/cloud-sync");
        await pushAppState("grades", {});
        await pushAppState("weekly_tests", {});
      } catch {
        /* local reset applied */
      }

      setPreview(weeks);
      setActiveSemester({ name: name.trim(), weeks_count: result.weeks_count });
      toast.success(`تم اعتماد الفصل «${name.trim()}» — بدء فصل جديد (${result.weeks_count} أسبوعاً)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل اعتماد الفصل الدراسي");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveClick = () => {
    if (!validateForm()) return;
    if (activeSemester) {
      setExportDialogOpen(true);
      return;
    }
    void commitNewSemester();
  };

  const handleExportAndContinue = () => {
    if (activeSemester) {
      const ok = exportSemesterGradesExcel(activeSemester.name, activeSemester.weeks_count);
      if (ok) toast.success(`تم تصدير درجات «${activeSemester.name}»`);
      else toast.error("لا توجد بيانات للتصدير");
    }
    setExportDialogOpen(false);
    void commitNewSemester();
  };

  const handleContinueWithoutExport = () => {
    setExportDialogOpen(false);
    void commitNewSemester();
  };

  return (
    <>
      <Card className="glass-card border-primary/15 shadow-none" dir="rtl">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-primary">
            <CalendarDays className="w-5 h-5" />
            نظام التقويم الأكاديمي — فصل جديد
          </CardTitle>
          <CardDescription>
            إعداد فصل دراسي جديد — عند الاعتماد تُصفّر درجات جميع الطلاب تلقائياً
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
            تنبيه: اعتماد فصل جديد يُلغي الفصل السابق ويصفّر جميع الدرجات — استخدم «تحرير الفصل الحالي» للتعديلات دون تصفير.
            {activeSemester && (
              <span className="block mt-1 text-warning/90">
                الفصل الحالي: «{activeSemester.name}» — سيُعرض خيار تصدير درجاته قبل الاعتماد.
              </span>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="semester-name">اسم الفصل الدراسي</Label>
              <Input
                id="semester-name"
                value={name}
                onChange={(e) => { setName(e.target.value); setPreview(null); }}
                placeholder="مثال: الفصل الأول 1447هـ"
                className="text-start"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="semester-start">تاريخ بداية الفصل</Label>
              <Input
                id="semester-start"
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setPreview(null); }}
                dir="ltr"
                className="text-start"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="semester-weeks">عدد الأسابيع</Label>
              <Input
                id="semester-weeks"
                type="number"
                min={1}
                max={52}
                value={weeksCount}
                onChange={(e) => {
                  setWeeksCount(Math.max(1, Math.min(52, Number(e.target.value) || 1)));
                  setPreview(null);
                }}
                dir="ltr"
                className="text-start"
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label>أيام العمل</Label>
            <div className="flex flex-wrap gap-3">
              {WEEKDAY_OPTIONS.map(({ value, label }) => {
                const checked = workingDays.includes(value);
                return (
                  <label
                    key={value}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 cursor-pointer hover:bg-secondary/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleWorkingDay(value)}
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <SemesterHolidaysEditor
            holidays={holidays}
            onChange={(next) => {
              setHolidays(next);
              setPreview(null);
            }}
          />

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={handlePreview} disabled={previewing || saving}>
              {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              معاينة الجدول
            </Button>
            <Button type="button" onClick={handleSaveClick} disabled={saving || previewing} className="gold-gradient text-primary-foreground">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              اعتماد فصل جديد (تصفير الدرجات)
            </Button>
          </div>

          {preview && preview.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-primary">معاينة الأسابيع ({preview.length})</h3>
              <div className="rounded-lg border border-border overflow-x-auto max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">الأسبوع</TableHead>
                      <TableHead className="text-right">البداية</TableHead>
                      <TableHead className="text-right">النهاية</TableHead>
                      <TableHead className="text-right">أيام العمل</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((w) => (
                      <TableRow key={w.weekNumber}>
                        <TableCell className="font-bold">{w.weekNumber}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{formatDateArabic(w.startDate)}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{formatDateArabic(w.endDate)}</TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">{w.workingDayDates.length} يوم</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تصدير درجات الفصل السابق؟</AlertDialogTitle>
            <AlertDialogDescription className="text-start leading-relaxed">
              {activeSemester ? (
                <>
                  هل تريد تصدير درجات الفصل «<strong>{activeSemester.name}</strong>» إلى ملف Excel قبل اعتماد الفصل الجديد؟
                  <span className="block mt-2 text-warning">
                    بعد الاعتماد تُصفّر جميع الدرجات ولا يمكن استرجاعها إلا من الملف المُصدَّر.
                  </span>
                </>
              ) : (
                "هل تريد تصدير درجات الفصل السابق قبل الاعتماد؟"
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2 sm:justify-start">
            <AlertDialogAction
              onClick={handleExportAndContinue}
              className="gap-2"
              disabled={saving}
            >
              <Download className="w-4 h-4" />
              تصدير ثم المتابعة
            </AlertDialogAction>
            <Button
              type="button"
              variant="outline"
              onClick={handleContinueWithoutExport}
              disabled={saving}
            >
              متابعة بدون تصدير
            </Button>
            <AlertDialogCancel disabled={saving}>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
