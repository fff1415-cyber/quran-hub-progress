import { useEffect, useRef, useState } from "react";
import { Loader2, UserCheck } from "lucide-react";
import { toast } from "sonner";
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
  dismissStaffAttendancePrompt,
  findTodayCheckIn,
  getDailySchedule,
  isAfterScheduledStart,
  isStaffAttendancePromptDismissed,
  loadStaffAttendanceSettings,
  parseLocalDateTime,
  registerStaffCheckIn,
  shouldPromptStaffAttendance,
  staffRoleLabel,
  staffUserKey,
  STAFF_ATTENDANCE_CHANGED,
  STAFF_STATUS_LABEL,
} from "@/lib/staff-attendance";
import { dispatchPushEvent } from "@/lib/push-notifications";
import { tenantPath } from "@/lib/tenant";

interface StaffAttendancePromptDialogProps {
  role: string;
  name: string;
  halaqaId: number;
  halaqaName: string;
}

export function StaffAttendancePromptDialog({
  role,
  name,
  halaqaId,
  halaqaName,
}: StaffAttendancePromptDialogProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const evaluatedRef = useRef(false);
  const settings = loadStaffAttendanceSettings();

  useEffect(() => {
    if (!settings.enabled || !shouldPromptStaffAttendance(role) || !name) return;

    const userKey = staffUserKey(role, halaqaId, name);
    let cancelled = false;
    let timeoutId: number | undefined;

    const tryOpen = () => {
      if (cancelled || evaluatedRef.current) return;
      if (findTodayCheckIn(userKey)) return;
      if (isStaffAttendancePromptDismissed(userKey)) return;
      evaluatedRef.current = true;
      setOpen(true);
    };

    void getDailySchedule().then((schedule) => {
      if (cancelled || !schedule) return;
      const now = new Date();
      if (isAfterScheduledStart(now, schedule)) {
        tryOpen();
        return;
      }
      const startAt = parseLocalDateTime(schedule.date, schedule.scheduledStart);
      const delayMs = startAt.getTime() - now.getTime();
      if (delayMs > 0 && delayMs <= 12 * 60 * 60 * 1000) {
        timeoutId = window.setTimeout(tryOpen, delayMs);
      }
    });

    const onChanged = () => {
      if (findTodayCheckIn(userKey)) setOpen(false);
    };
    window.addEventListener(STAFF_ATTENDANCE_CHANGED, onChanged);

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      window.removeEventListener(STAFF_ATTENDANCE_CHANGED, onChanged);
    };
  }, [role, name, halaqaId, halaqaName, settings.enabled]);

  const onLater = () => {
    dismissStaffAttendancePrompt(staffUserKey(role, halaqaId, name));
    setOpen(false);
  };

  const onYes = async () => {
    setBusy(true);
    try {
      const { checkIn, alreadyRegistered } = await registerStaffCheckIn({
        role,
        name,
        halaqaId,
        halaqaName,
      });
      if (alreadyRegistered) {
        toast.info("سبق تسجيل حضورك اليوم");
      } else {
        void dispatchPushEvent({
          event: "staff_checkin",
          title: "تسجيل حضور كادر",
          body: `${name} (${staffRoleLabel(role)}) — ${halaqaName} · ${STAFF_STATUS_LABEL[checkIn.status]}`,
          url: tenantPath("/manager"),
          targets: { roles: ["manager"] },
        });
        if (checkIn.status === "late") {
          toast.warning("تم التسجيل — حالة: متأخر");
        } else {
          toast.success("تم تسجيل حضورك — حاضر");
        }
      }
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل التسجيل");
    } finally {
      setBusy(false);
    }
  };

  if (!settings.enabled || !shouldPromptStaffAttendance(role) || !name) return null;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onLater();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="w-14 h-14 rounded-2xl gold-gradient flex items-center justify-center mx-auto mb-2">
            <UserCheck className="w-7 h-7 text-primary-foreground" />
          </div>
          <AlertDialogTitle className="text-center">تسجيل حضور</AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            هل تريد تسجيل حضورك الآن؟
            <span className="block mt-1 text-xs">
              {staffRoleLabel(role)}
              {halaqaName ? ` · ${halaqaName}` : ""}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
          <AlertDialogCancel disabled={busy} onClick={onLater}>
            لاحقاً
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            className="gold-gradient text-primary-foreground gap-2"
            onClick={(e) => {
              e.preventDefault();
              void onYes();
            }}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
            نعم، سجّل حضوري
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
