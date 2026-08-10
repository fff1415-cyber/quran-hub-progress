import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { AppHeader } from "@/components/AppHeader";
import {
  findTodayCheckIn,
  formatTime12,
  getDailySchedule,
  loadStaffAttendanceSettings,
  registerStaffCheckIn,
  staffUserKey,
  STAFF_STATUS_LABEL,
  type DailySchedule,
  type StaffCheckIn,
} from "@/lib/staff-attendance";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Clock, Loader2, UserCheck } from "lucide-react";
import { toast, Toaster } from "sonner";
import { halaqaSearchParamSchema, resolveTeacherHalaqaId, readLocalHalaqat, findHalaqaById } from "@/lib/teacher-halaqa-access";
import { useTenant } from "@/contexts/TenantContext";
import { getSessionName, getSessionRole } from "@/lib/session-role";
import { dispatchPushEvent } from "@/lib/push-notifications";
import { tenantPath } from "@/lib/tenant";

export const staffAttendanceSearchSchema = z.object({
  h: halaqaSearchParamSchema,
});

export const Route = createFileRoute("/staff-attendance")({
  validateSearch: staffAttendanceSearchSchema,
  component: StaffAttendancePage,
});

export function StaffAttendancePage() {
  const { h } = useSearch({ strict: false }) as z.infer<typeof staffAttendanceSearchSchema>;
  const navigate = useNavigate();
  const { loading: tenantLoading } = useTenant();
  const [role, setRole] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [schedule, setSchedule] = useState<DailySchedule | null>(null);
  const [todayRecord, setTodayRecord] = useState<StaffCheckIn | null>(null);
  const [loading, setLoading] = useState(true);

  const settings = loadStaffAttendanceSettings();
  const halaqat = tenantLoading ? [] : readLocalHalaqat();
  const halaqaId = resolveTeacherHalaqaId(h);
  const halaqa = findHalaqaById(halaqat, halaqaId);

  useEffect(() => {
    setRole(getSessionRole());
    setName(getSessionName());
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getDailySchedule()
      .then((s) => {
        if (!cancelled) setSchedule(s);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!role || !name || !halaqaId) return;
    const key = staffUserKey(role, halaqaId, name);
    setTodayRecord(findTodayCheckIn(key) ?? null);
  }, [role, name, halaqaId, busy]);

  const canCheckIn = role === "teacher" || role === "assistant" || role === "manager";

  const onCheckIn = async () => {
    if (!role || !name || !halaqa) {
      toast.error("بيانات الجلسة غير مكتملة");
      return;
    }
    setBusy(true);
    try {
      const { checkIn, alreadyRegistered } = await registerStaffCheckIn({
        role,
        name,
        halaqaId: halaqa.id,
        halaqaName: halaqa.name,
      });
      setTodayRecord(checkIn);
      if (alreadyRegistered) {
        toast.info("سبق تسجيل حضورك اليوم");
      } else {
        void dispatchPushEvent({
          event: "staff_checkin",
          title: "تسجيل حضور كادر",
          body: `${name} (${role}) — ${halaqa.name} · ${STAFF_STATUS_LABEL[checkIn.status]}`,
          url: tenantPath("/manager"),
          targets: { roles: ["manager"] },
        });
        if (checkIn.status === "late") {
          toast.warning("تم التسجيل — حالة: متأخر");
        } else {
          toast.success("تم تسجيل حضورك — حاضر");
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل التسجيل");
    } finally {
      setBusy(false);
    }
  };

  const backToTeacher = () => {
    if (halaqa) {
      navigate({ to: tenantPath("/teacher"), search: { h: halaqa.id } });
    } else {
      navigate({ to: tenantPath("/") });
    }
  };

  if (!settings.enabled) {
    return (
      <div className="min-h-screen">
        <AppHeader title="حضور العاملين" />
        <main className="max-w-lg mx-auto px-4 py-12 text-center text-muted-foreground">
          <p>حضور العاملين غير مفعّل حالياً</p>
          <Button variant="outline" className="mt-4" onClick={backToTeacher}>العودة</Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Toaster position="top-center" richColors />
      <AppHeader title="حضور العاملين" subtitle={halaqa?.name ?? ""} />
      <main className="max-w-lg mx-auto px-4 py-8 space-y-6">
        <button
          type="button"
          onClick={backToTeacher}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowRight className="w-4 h-4" /> العودة للحلقة
        </button>

        <div className="glass-card rounded-2xl p-6 space-y-5">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl gold-gradient flex items-center justify-center mx-auto mb-3">
              <UserCheck className="w-8 h-8 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-bold gold-text">{name || "—"}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {role === "assistant" ? "مساعد" : role === "manager" ? "مدير (معلم)" : "معلم"}
              {halaqa ? ` · ${halaqa.name}` : ""}
            </p>
          </div>

          {loading ? (
            <p className="text-center text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> جاري تحميل وقت اليوم…
            </p>
          ) : schedule ? (
            <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>مواعيد اليوم ({settings.city})</span>
              </div>
              <p>العصر: <strong>{formatTime12(schedule.asrTime)}</strong></p>
              <p>بداية الحلقة: <strong className="text-primary">{formatTime12(schedule.scheduledStart)}</strong></p>
              <p className="text-xs text-muted-foreground">
                مهلة التأخير: {settings.late_grace_minutes} د · التسجيل مفتوح دائماً
              </p>
            </div>
          ) : (
            <p className="text-center text-destructive text-sm">تعذّر جلب وقت العصر</p>
          )}

          {todayRecord ? (
            <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-center space-y-2">
              <Badge variant={todayRecord.status === "late" ? "destructive" : "default"} className="text-sm">
                {STAFF_STATUS_LABEL[todayRecord.status]}
              </Badge>
              <p className="text-sm">
                سُجّل الساعة{" "}
                <strong dir="ltr">
                  {new Date(todayRecord.checkedInAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                </strong>
              </p>
              <p className="text-xs text-muted-foreground">لا يمكن التسجيل مرتين في نفس اليوم</p>
            </div>
          ) : canCheckIn ? (
            <Button
              type="button"
              onClick={() => void onCheckIn()}
              disabled={busy}
              className="w-full py-6 text-lg gold-gradient text-primary-foreground gap-2"
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserCheck className="w-5 h-5" />}
              تسجيل حضور الآن
            </Button>
          ) : (
            <p className="text-center text-muted-foreground text-sm">هذه الصفحة للمعلمين والمساعدين</p>
          )}
        </div>
      </main>
    </div>
  );
}
