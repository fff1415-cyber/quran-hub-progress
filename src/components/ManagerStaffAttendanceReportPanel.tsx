import { useCallback, useEffect, useMemo, useState } from "react";
import { loadHalaqat } from "@/lib/mock-data";
import { loadRoleAccountsCloud, syncFromCloud } from "@/lib/cloud-sync";
import {
  STAFF_ATTENDANCE_CHANGED,
  STAFF_STATUS_LABEL,
  formatTime12,
  getCalendarIsoDate,
  loadStaffCheckIns,
  staffRoleLabel,
} from "@/lib/staff-attendance";
import {
  STAFF_ROLE_FILTER_OPTIONS,
  buildExpectedStaffRoster,
  buildStaffSummaryRows,
  clampReportEndDate,
  computeStaffReportStats,
  defaultReportFromDate,
  downloadStaffAttendanceWorkbook,
  filterCheckIns,
  type StaffReportFilters,
} from "@/lib/staff-attendance-report";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Download, FileSpreadsheet, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

type Preset = "7d" | "30d" | "month" | "custom";

function applyPreset(preset: Preset, today: string): { from: string; to: string } {
  if (preset === "7d") {
    return { from: defaultReportFromDate(7, today), to: today };
  }
  if (preset === "30d") {
    return { from: defaultReportFromDate(30, today), to: today };
  }
  if (preset === "month") {
    const [y, m] = today.split("-");
    return { from: `${y}-${m}-01`, to: today };
  }
  return { from: defaultReportFromDate(7, today), to: today };
}

export function ManagerStaffAttendanceReportPanel() {
  const { brandName } = useTenant();
  const today = getCalendarIsoDate();
  const [preset, setPreset] = useState<Preset>("7d");
  const [fromIso, setFromIso] = useState(() => defaultReportFromDate(7, today));
  const [toIso, setToIso] = useState(today);
  const [role, setRole] = useState("all");
  const [halaqaId, setHalaqaId] = useState<number | "all">("all");
  const [nameQuery, setNameQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);

  const halaqat = useMemo(() => loadHalaqat(), [tick]);
  const [roleAccounts, setRoleAccounts] = useState<{ role: string; name: string }[]>([]);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  const refreshFromCloud = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncFromCloud({ force: true });
      try {
        const rows = await loadRoleAccountsCloud();
        setRoleAccounts(rows.map((r) => ({ role: r.role, name: r.name })));
      } catch {
        /* role accounts optional */
      }
      reload();
    } finally {
      setRefreshing(false);
    }
  }, [reload]);

  useEffect(() => {
    void refreshFromCloud();
    const onChange = () => reload();
    window.addEventListener(STAFF_ATTENDANCE_CHANGED, onChange);
    return () => window.removeEventListener(STAFF_ATTENDANCE_CHANGED, onChange);
  }, [refreshFromCloud, reload]);

  const filters: StaffReportFilters = useMemo(
    () => ({ fromIso, toIso, role, halaqaId, nameQuery }),
    [fromIso, toIso, role, halaqaId, nameQuery],
  );

  const filtered = useMemo(() => {
    void tick;
    return filterCheckIns(loadStaffCheckIns(), filters);
  }, [filters, tick]);

  const expected = useMemo(
    () => buildExpectedStaffRoster(halaqat, roleAccounts),
    [halaqat, roleAccounts],
  );

  const summary = useMemo(
    () => buildStaffSummaryRows(filtered, expected, fromIso, toIso, today),
    [filtered, expected, fromIso, toIso, today],
  );

  const stats = useMemo(
    () => computeStaffReportStats(filtered, summary, fromIso, toIso),
    [filtered, summary, fromIso, toIso],
  );

  const cappedTo = clampReportEndDate(toIso, today);

  const onPreset = (next: Preset) => {
    setPreset(next);
    if (next !== "custom") {
      const { from, to } = applyPreset(next, today);
      setFromIso(from);
      setToIso(to);
    }
  };

  const exportExcel = () => {
    if (!fromIso || !toIso) {
      toast.error("حدّد تاريخ البداية والنهاية");
      return;
    }
    if (fromIso > toIso) {
      toast.error("تاريخ البداية يجب أن يكون قبل النهاية");
      return;
    }
    if (filtered.length === 0) {
      toast.error("لا توجد تسجيلات في الفترة المختارة");
      return;
    }
    downloadStaffAttendanceWorkbook({
      filtered,
      summary,
      fromIso,
      toIso,
      brandName: brandName ?? undefined,
    });
    toast.success(`تم تصدير ${filtered.length} تسجيل`);
  };

  return (
    <section className="glass-card rounded-2xl p-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-primary flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" /> تقرير حضور العاملين
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            استعراض وتصدير سجل الحضور للفترات السابقة — معلمون، مساعدون، ومسمّع وسكرتير ومشرفون
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={refreshing}
          onClick={() => void refreshFromCloud()}
        >
          {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "تحديث من السحابة"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["7d", "آخر 7 أيام"],
            ["30d", "آخر 30 يوم"],
            ["month", "هذا الشهر"],
            ["custom", "مخصص"],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={preset === id ? "default" : "outline"}
            onClick={() => onPreset(id)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="staff-from">من تاريخ</Label>
          <Input
            id="staff-from"
            type="date"
            value={fromIso}
            max={cappedTo}
            dir="ltr"
            className="text-start"
            onChange={(e) => {
              setPreset("custom");
              setFromIso(e.target.value);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="staff-to">إلى تاريخ</Label>
          <Input
            id="staff-to"
            type="date"
            value={cappedTo}
            min={fromIso}
            max={today}
            dir="ltr"
            className="text-start"
            onChange={(e) => {
              setPreset("custom");
              setToIso(e.target.value);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="staff-role">الدور</Label>
          <select
            id="staff-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {STAFF_ROLE_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="staff-halaqa">الحلقة</Label>
          <select
            id="staff-halaqa"
            value={halaqaId === "all" ? "all" : String(halaqaId)}
            onChange={(e) => {
              const v = e.target.value;
              setHalaqaId(v === "all" ? "all" : Number(v));
            }}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">كل الحلقات</option>
            {halaqat.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={nameQuery}
          onChange={(e) => setNameQuery(e.target.value)}
          placeholder="بحث بالاسم…"
          className="pr-9"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <div className="rounded-xl border border-border bg-secondary/30 p-3 text-center">
          <p className="text-xs text-muted-foreground">أيام الفترة</p>
          <p className="text-lg font-bold">{stats.daysInRange}</p>
        </div>
        <div className="rounded-xl border border-border bg-secondary/30 p-3 text-center">
          <p className="text-xs text-muted-foreground">تسجيلات</p>
          <p className="text-lg font-bold">{stats.totalCheckIns}</p>
        </div>
        <div className="rounded-xl border border-border bg-secondary/30 p-3 text-center">
          <p className="text-xs text-muted-foreground">حاضر</p>
          <p className="text-lg font-bold text-success">{stats.presentCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-secondary/30 p-3 text-center">
          <p className="text-xs text-muted-foreground">متأخر</p>
          <p className="text-lg font-bold text-destructive">{stats.lateCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-secondary/30 p-3 text-center col-span-2 sm:col-span-1">
          <p className="text-xs text-muted-foreground">غياب (أيام)</p>
          <p className="text-lg font-bold text-warning">{stats.absentSlots}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {fromIso} → {cappedTo} · {stats.uniqueStaff} عامل · الغياب محسوب للكادر المتوقع حالياً
        </p>
        <Button
          type="button"
          onClick={exportExcel}
          disabled={filtered.length === 0}
          className="gold-gradient text-primary-foreground gap-2"
        >
          <Download className="w-4 h-4" />
          تصدير Excel
        </Button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">لا توجد تسجيلات في الفترة المختارة</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-muted-foreground">
                <th className="p-2 text-right">التاريخ</th>
                <th className="p-2 text-right">الاسم</th>
                <th className="p-2 text-right">الدور</th>
                <th className="p-2 text-right">الحلقة</th>
                <th className="p-2 text-center">الحالة</th>
                <th className="p-2 text-center">التسجيل</th>
                <th className="p-2 text-center">بداية الحلقة</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map((c) => (
                <tr key={c.id} className="border-b border-border/50">
                  <td className="p-2 font-mono text-xs" dir="ltr">{c.date}</td>
                  <td className="p-2 font-medium">{c.name}</td>
                  <td className="p-2">{staffRoleLabel(c.role)}</td>
                  <td className="p-2">{c.halaqaName || "—"}</td>
                  <td className="p-2 text-center">
                    <Badge variant={c.status === "late" ? "destructive" : "default"}>
                      {STAFF_STATUS_LABEL[c.status]}
                    </Badge>
                  </td>
                  <td className="p-2 text-center font-mono text-xs" dir="ltr">
                    {new Date(c.checkedInAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="p-2 text-center">{formatTime12(c.scheduledStart)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 200 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              يُعرض أول 200 تسجيل — صدّر Excel للقائمة الكاملة ({filtered.length})
            </p>
          )}
        </div>
      )}

      {summary.length > 0 && (
        <details className="rounded-xl border border-border p-4">
          <summary className="cursor-pointer font-medium text-sm text-primary">ملخص حسب العامل</summary>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="p-2 text-right">الاسم</th>
                  <th className="p-2 text-right">الدور</th>
                  <th className="p-2 text-right">الحلقة</th>
                  <th className="p-2 text-center">أيام</th>
                  <th className="p-2 text-center">حاضر</th>
                  <th className="p-2 text-center">متأخر</th>
                  <th className="p-2 text-center">غياب</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((r) => (
                  <tr key={r.userKey} className="border-b border-border/50">
                    <td className="p-2 font-medium">{r.name}</td>
                    <td className="p-2">{staffRoleLabel(r.role)}</td>
                    <td className="p-2">{r.halaqaName}</td>
                    <td className="p-2 text-center">{r.checkInDays}</td>
                    <td className="p-2 text-center">{r.presentDays}</td>
                    <td className="p-2 text-center">{r.lateDays}</td>
                    <td className="p-2 text-center">{r.absentDays}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
