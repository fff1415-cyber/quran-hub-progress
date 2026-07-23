import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  findTodayCheckIn,
  loadStaffAttendanceSettings,
  staffUserKey,
} from "@/lib/staff-attendance";
import { UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface StaffAttendanceCheckInButtonProps {
  role: string;
  name: string;
  halaqaId: number;
  className?: string;
}

export function StaffAttendanceCheckInButton({
  role,
  name,
  halaqaId,
  className,
}: StaffAttendanceCheckInButtonProps) {
  const [checkedIn, setCheckedIn] = useState(false);
  const settings = loadStaffAttendanceSettings();

  useEffect(() => {
    if (!name) return;
    const key = staffUserKey(role, halaqaId, name);
    setCheckedIn(!!findTodayCheckIn(key));
  }, [role, name, halaqaId]);

  if (!settings.enabled || !name) return null;

  return (
    <Link
      to="/staff-attendance"
      search={{ h: halaqaId }}
      className={cn(
        "inline-flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-lg border text-sm font-bold transition-colors",
        checkedIn
          ? "border-success/40 bg-success/10 text-success"
          : "border-warning/50 bg-warning/10 text-warning animate-pulse",
        className,
      )}
    >
      <UserCheck className="w-4 h-4" />
      <span className="hidden sm:inline">{checkedIn ? "تم التحضير" : "تسجيل حضور"}</span>
      <span className="sm:hidden">{checkedIn ? "✓" : "!"}</span>
    </Link>
  );
}
