import { createFileRoute } from "@tanstack/react-router";
import { StaffAttendancePage, staffAttendanceSearchSchema } from "../staff-attendance";

export const Route = createFileRoute("/$tenantSlug/staff-attendance")({
  validateSearch: staffAttendanceSearchSchema,
  component: StaffAttendancePage,
});
