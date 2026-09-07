import { useCallback, useEffect, useMemo, useState } from "react";
import { loadHalaqat } from "@/lib/mock-data";
import {
  formatTime12,
  staffRoleLabel,
  STAFF_ATTENDANCE_CHANGED,
  STAFF_STATUS_LABEL,
  todayCheckIns,
} from "@/lib/staff-attendance";
import { syncFromCloud } from "@/lib/cloud-sync";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserCheck } from "lucide-react";

export function ManagerStaffAttendanceMonitorPanel() {
  const [checkIns, setCheckIns] = useState(() => todayCheckIns());
  const [refreshing, setRefreshing] = useState(false);
  const halaqat = useMemo(() => loadHalaqat(), [checkIns]);

  const reloadLocal = useCallback(() => {
    setCheckIns(todayCheckIns());
  }, []);

  const refreshFromCloud = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncFromCloud({ force: true });
      reloadLocal();
    } finally {
      setRefreshing(false);
    }
  }, [reloadLocal]);

  useEffect(() => {
    void refreshFromCloud();
    const onChange = () => reloadLocal();
    window.addEventListener(STAFF_ATTENDANCE_CHANGED, onChange);
    const timer = window.setInterval(() => void refreshFromCloud(), 60_000);
    return () => {
      window.removeEventListener(STAFF_ATTENDANCE_CHANGED, onChange);
      window.clearInterval(timer);
    };
  }, [refreshFromCloud, reloadLocal]);

  const expectedStaff = useMemo(() => {
    const rows: { role: string; name: string; halaqaId: number; halaqaName: string }[] = [];
    halaqat.forEach((h) => {
      if (h.teacherName?.trim()) {
        rows.push({ role: "teacher", name: h.teacherName.trim(), halaqaId: h.id, halaqaName: h.name });
      }
      if (h.assistantName?.trim()) {
        rows.push({ role: "assistant", name: h.assistantName.trim(), halaqaId: h.id, halaqaName: h.name });
      }
    });
    return rows;
  }, [halaqat]);

  const checkedKeys = useMemo(
    () => new Set(checkIns.map((c) => `${c.role}:${c.halaqaId}:${c.name}`)),
    [checkIns],
  );

  const absentCount = expectedStaff.filter(
    (s) => !checkedKeys.has(`${s.role}:${s.halaqaId}:${s.name}`),
  ).length;

  return (
    <section className="glass-card rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-primary flex items-center gap-2">
            <UserCheck className="w-5 h-5" /> متابعة حضور العاملين
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            متابعة تسجيل المعلمين والمساعدين والمسمّع والسكرتير والمشرفين اليوم
          </p>
        </div>
        <div className="flex gap-2 text-xs items-center">
          <Badge variant="default">{checkIns.length} مسجّل</Badge>
          {absentCount > 0 && <Badge variant="destructive">{absentCount} لم يسجّل</Badge>}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={refreshing}
            onClick={() => void refreshFromCloud()}
          >
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "تحديث"}
          </Button>
        </div>
      </div>

      {checkIns.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">لا تسجيلات اليوم بعد</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="p-2 text-right">الاسم</th>
                <th className="p-2 text-right">الدور</th>
                <th className="p-2 text-right">الحلقة</th>
                <th className="p-2 text-center">الحالة</th>
                <th className="p-2 text-center">وقت التسجيل</th>
                <th className="p-2 text-center">بداية الحلقة</th>
              </tr>
            </thead>
            <tbody>
              {checkIns.map((c) => (
                <tr key={c.id} className="border-b border-border/50">
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
        </div>
      )}

      {absentCount > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
          <p className="text-xs font-bold text-warning mb-2">لم يسجّلوا بعد ({absentCount}) — معلمون ومساعدون</p>
          <ul className="text-xs space-y-1 text-muted-foreground">
            {expectedStaff
              .filter((s) => !checkedKeys.has(`${s.role}:${s.halaqaId}:${s.name}`))
              .map((s) => (
                <li key={`${s.role}-${s.halaqaId}-${s.name}`}>
                  {s.name} — {staffRoleLabel(s.role)} · {s.halaqaName}
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}
