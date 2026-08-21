import { useCallback, useEffect, useMemo, useState } from "react";
import {
  generateAcademicWeeks,
  WEEKDAY_OPTIONS,
  formatDateArabic,
  type GeneratedAcademicWeek,
} from "@/lib/calendar-generator";
import { getToken } from "@/lib/cloud-sync";
import { secureGetActiveSemester, secureUpdateActiveSemester } from "@/lib/secure-data.functions";
import { clearCalendarCache, fetchActiveCalendar, type ActiveSemester } from "@/lib/academic-context";
import {
  holidayDateStrings,
  parseSemesterHolidays,
  serializeSemesterHolidays,
  type SemesterHoliday,
} from "@/lib/semester-holidays";
import { SemesterHolidaysEditor } from "@/components/SemesterHolidaysEditor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CalendarRange, Eye, Save, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_WORKING_DAYS = [0, 1, 2, 3, 4];

function normalizeIsoDate(raw: string): string {
  return raw.slice(0, 10);
}

function parseActiveSemester(raw: unknown): ActiveSemester | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.id !== "string" || typeof s.name !== "string") return null;
  return {
    id: s.id,
    name: s.name,
    start_date: normalizeIsoDate(String(s.start_date ?? "")),
    weeks_count: Number(s.weeks_count ?? 0),
    working_days: Array.isArray(s.working_days) ? s.working_days.map(Number) : DEFAULT_WORKING_DAYS,
    excluded_dates: parseSemesterHolidays(s.excluded_dates),
  };
}

export function SemesterEditForm() {
  const [loading, setLoading] = useState(true);
  const [semesterId, setSemesterId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [weeksCount, setWeeksCount] = useState(18);
  const [workingDays, setWorkingDays] = useState<number[]>(DEFAULT_WORKING_DAYS);
  const [holidays, setHolidays] = useState<SemesterHoliday[]>([]);
  const [preview, setPreview] = useState<GeneratedAcademicWeek[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);

  const serializedHolidays = useMemo(() => serializeSemesterHolidays(holidays), [holidays]);

  const loadActive = useCallback(async () => {
    setLoading(true);
    try {
      const token = getToken();
      if (!token) {
        setSemesterId(null);
        return;
      }
      const res = await secureGetActiveSemester({ data: { token } });
      const semester = parseActiveSemester(res.semester);
      if (!semester) {
        setSemesterId(null);
        return;
      }
      setSemesterId(semester.id);
      setName(semester.name);
      setStartDate(semester.start_date);
      setWeeksCount(semester.weeks_count || 18);
      setWorkingDays(semester.working_days.length ? semester.working_days : DEFAULT_WORKING_DAYS);
      setHolidays(semester.excluded_dates);
      setPreview(null);
    } catch {
      setSemesterId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadActive();
  }, [loadActive]);

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

  const handleSave = async () => {
    if (!semesterId || !validateForm()) return;

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

      const result = await secureUpdateActiveSemester({
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
      await fetchActiveCalendar(true);

      setPreview(weeks);
      toast.success(`تم تحديث الفصل «${name.trim()}» (${result.weeks_count} أسبوعاً) — الدرجات محفوظة`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل تحديث الفصل الدراسي");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="glass-card border-border shadow-none" dir="rtl">
        <CardContent className="py-10 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          جاري تحميل الفصل الحالي...
        </CardContent>
      </Card>
    );
  }

  if (!semesterId) {
    return (
      <Card className="glass-card border-dashed border-border shadow-none" dir="rtl">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-muted-foreground">
            <CalendarRange className="w-5 h-5" />
            لا يوجد فصل نشط
          </CardTitle>
          <CardDescription>
            أنشئ فصلاً دراسياً جديداً من القسم أدناه لبدء العمل على التقويم
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="glass-card border-success/25 shadow-none" dir="rtl">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg flex items-center gap-2 text-success">
              <CalendarRange className="w-5 h-5" />
              تحرير الفصل الحالي
            </CardTitle>
            <CardDescription>
              عدّل الأسابيع أو الإجازات أو أيام العمل — الدرجات الحالية تبقى كما هي
            </CardDescription>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => void loadActive()} disabled={saving}>
            <RefreshCw className="w-4 h-4" />
            تحديث
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="edit-semester-name">اسم الفصل الدراسي</Label>
            <Input
              id="edit-semester-name"
              value={name}
              onChange={(e) => { setName(e.target.value); setPreview(null); }}
              placeholder="مثال: الفصل الأول 1447هـ"
              className="text-start"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-semester-start">تاريخ بداية الفصل</Label>
            <Input
              id="edit-semester-start"
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPreview(null); }}
              dir="ltr"
              className="text-start"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-semester-weeks">عدد الأسابيع</Label>
            <Input
              id="edit-semester-weeks"
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
          <Button type="button" onClick={() => void handleSave()} disabled={saving || previewing} className="gold-gradient text-primary-foreground">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            حفظ التعديلات
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
