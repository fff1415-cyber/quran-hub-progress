import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { loadGrades, loadStudents, loadSardQueue, countTransfersForRole } from "@/lib/mock-data";
import { getCalendarDayKey } from "@/lib/operational-date";
import { fetchActiveCalendar } from "@/lib/academic-context";
import { getSessionName } from "@/lib/session-role";
import { AppHeader } from "@/components/AppHeader";
import { GradesExport } from "@/components/GradesExport";
import { RoleShell, RolePageHeader, type RoleTab } from "@/components/role-workspace/RoleShell";
import {
  SecretaryAttendancePanel,
  SecretaryLatePermitPanel,
  SecretarySardPanel,
} from "@/components/role-workspace/RoleSections";
import { SecretaryStudentProfilesPanel } from "@/components/role-workspace/SecretaryStudentProfilesPanel";
import { ForwardedTransfersPanel } from "@/components/role-workspace/ForwardedTransfersPanel";
import { PlanStudentLookup } from "@/components/plans/SupervisorPlansPanel";
import { Clipboard, UserX, Clock, Mic, Send, GraduationCap, Users } from "lucide-react";
import { Toaster } from "sonner";
import type { WeekRecord } from "@/lib/mock-data";

export const Route = createFileRoute("/secretary")({
  validateSearch: (s: Record<string, unknown>) => ({
    tab: typeof s.tab === "string" ? s.tab : undefined,
  }),
  component: SecretaryPage,
});

function SecretaryPage() {
  const navigate = useNavigate({ from: "/secretary" });
  const search = Route.useSearch();
  const name = getSessionName("السكرتير");
  const students = loadStudents();
  const grades = loadGrades();
  const todayKey = getCalendarDayKey();
  const [currentWeek, setCurrentWeek] = useState(1);
  const [queue] = useState(() => loadSardQueue());

  useEffect(() => {
    fetchActiveCalendar().then((cal) => setCurrentWeek(cal.currentWeekNumber)).catch(() => {});
  }, []);

  const todayCount = useMemo(() => {
    return students.filter((s) => {
      const w: WeekRecord | undefined = grades[s.id]?.[currentWeek];
      const status = w?.days[todayKey]?.attendance;
      return status === "absent" || status === "late";
    }).length;
  }, [students, grades, todayKey, currentWeek]);

  const passedSard = useMemo(() => queue.filter((q) => q.status === "passed"), [queue]);
  const finalFailed = useMemo(() => queue.filter((q) => q.status === "final_failed"), [queue]);
  const forwardedTransfers = countTransfersForRole("secretary");

  const tabs: RoleTab[] = [
    {
      id: "profiles",
      label: "ملفات الطلاب",
      icon: Users,
      perm: "view_attendance",
      content: <SecretaryStudentProfilesPanel />,
    },
    {
      id: "plans",
      label: "الخطط التراكمية",
      icon: GraduationCap,
      perm: "view_attendance",
      content: <PlanStudentLookup readOnly />,
    },
    {
      id: "transfers",
      label: "التحويلات",
      icon: Send,
      perm: "view_attendance",
      badge: forwardedTransfers,
      content: <ForwardedTransfersPanel role="secretary" />,
    },
    {
      id: "attendance",
      label: "الغياب والتأخر",
      icon: UserX,
      perm: "view_attendance",
      badge: todayCount,
      content: <SecretaryAttendancePanel />,
    },
    {
      id: "late-permit",
      label: "إذن الدخول",
      icon: Clock,
      perm: "force_retry",
      content: <SecretaryLatePermitPanel />,
    },
    {
      id: "sard",
      label: "السرد",
      icon: Mic,
      perm: "view_attendance",
      badge: passedSard.length + finalFailed.length,
      content: <SecretarySardPanel />,
    },
  ];

  const setTab = (tab: string) => {
    navigate({ search: (prev) => ({ ...prev, tab }) });
  };

  return (
    <div className="min-h-screen">
      <Toaster position="top-center" richColors />
      <AppHeader title="لوحة السكرتير" subtitle={name} />
      <main className="mx-auto px-4 py-8">
        <RoleShell
          className="max-w-5xl mx-auto"
          tabs={tabs}
          defaultTab="profiles"
          activeTab={search.tab}
          onTabChange={setTab}
          header={
            <>
              <RolePageHeader
                icon={Clipboard}
                title="لوحة السكرتير"
                description="متابعة الغياب والتأخر والسرد — أقسام حسب صلاحياتك"
              />
              <GradesExport />
            </>
          }
        />
      </main>
    </div>
  );
}
