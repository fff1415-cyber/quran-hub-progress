import { useMemo, useState } from "react";
import {
  generateAcademicWeeks,
  WEEKDAY_OPTIONS,
  formatDateArabic,
  type GeneratedAcademicWeek,
} from "@/lib/calendar-generator";
import { getToken } from "@/lib/cloud-sync";
import { secureCreateSemester } from "@/lib/secure-data.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CalendarDays, Eye, Save, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_WORKING_DAYS = [0, 1, 2, 3, 4];

export function SemesterSetupForm() {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [weeksCount, setWeeksCount] = useState(18);
  const [workingDays, setWorkingDays] = useState<number[]>(DEFAULT_WORKING_DAYS);
  const [excludedDates, setExcludedDates] = useState<string[]>([]);
  const [holidayPick, setHolidayPick] = useState("");
  const [preview, setPreview] = useState<GeneratedAcademicWeek[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);

  const sortedExcluded = useMemo(
    () => [...excludedDates].sort((a, b) => a.localeCompare(b)),
    [excludedDates],
  );

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

  const addHoliday = () => {
    if (!holidayPick) {
      toast.error("اختر تاريخاً للإجازة");
      return;
    }
    if (excludedDates.includes(holidayPick)) {
      toast.info("هذا التاريخ مُضاف مسبقاً");
      return;
    }
    setExcludedDates((cur) => [...cur, holidayPick].sort());
    setHolidayPick("");
    setPreview(null);
  };

  const removeHoliday = (date: string) => {
    setExcludedDates((cur) => cur.filter((d) => d !== date));
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
    excludedDates: sortedExcluded,
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

  const handleSave = async () => {
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

      await secureCreateSemester({
        data: {
          token,
          semester: {
            name: name.trim(),
            start_date: startDate,
            weeks_count: weeksCount,
            working_days: workingDays,
            excluded_dates: sortedExcluded,
          },
          weeks: weeks.map((w) => ({
            week_number: w.weekNumber,
            start_date: w.startDate,
            end_date: w.endDate,
          })),
        },
      });

      setPreview(weeks);
      toast.success(`تم اعتماد الفصل «${name.trim()}» مع ${weeks.length} أسبوعاً`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل اعتماد الفصل الدراسي");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="glass-card border-primary/15 shadow-none" dir="rtl">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2 text-primary">
          <CalendarDays className="w-5 h-5" />
          نظام التقويم الأكاديمي
        </CardTitle>
        <CardDescription>
          إعداد الفصل الدراسي وتوليد الأسابيع تلقائياً وفق أيام العمل والإجازات
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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

        <div className="space-y-3 rounded-lg border border-border p-4 bg-secondary/20">
          <Label>تواريخ الإجازات</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              type="date"
              value={holidayPick}
              onChange={(e) => setHolidayPick(e.target.value)}
              dir="ltr"
              className="max-w-[200px] text-start"
            />
            <Button type="button" variant="outline" size="sm" onClick={addHoliday}>
              <Plus className="w-4 h-4" />
              إضافة إجازة
            </Button>
          </div>
          {sortedExcluded.length === 0 ? (
            <p className="text-xs text-muted-foreground">لم تُضف إجازات بعد</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sortedExcluded.map((d) => (
                <Badge key={d} variant="secondary" className="gap-1 pe-1">
                  <span dir="ltr">{d}</span>
                  <button
                    type="button"
                    onClick={() => removeHoliday(d)}
                    className="rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive"
                    aria-label={`حذف إجازة ${d}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={handlePreview} disabled={previewing || saving}>
            {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            معاينة الجدول
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving || previewing} className="gold-gradient text-primary-foreground">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            اعتماد الفصل الدراسي
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
  );
}
