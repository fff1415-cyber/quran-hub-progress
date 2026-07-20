import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { loadGrades, loadStudents, loadSardQueue } from "@/lib/mock-data";
import { getOperationalDayKey } from "@/lib/operational-date";
import { getSessionName } from "@/lib/session-role";
import { AppHeader } from "@/components/AppHeader";
import { GradesExport } from "@/components/GradesExport";
import { RoleShell, RolePageHeader, type RoleTab } from "@/components/role-workspace/RoleShell";
import {
  SecretaryAttendancePanel,
  SecretaryLatePermitPanel,
  SecretarySardPanel,
} from "@/components/role-workspace/RoleSections";
import { Clipboard, UserX, Clock, Mic } from "lucide-react";
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
  const todayKey = getOperationalDayKey();
  const [queue] = useState(() => loadSardQueue());

  const todayCount = useMemo(() => {
    const currentWeek = 1;
    return students.filter((s) => {
      const w: WeekRecord | undefined = grades[s.id]?.[currentWeek];
      const status = w?.days[todayKey]?.attendance;
      return status === "absent" || status === "late";
    }).length;
  }, [students, grades, todayKey]);

  const passedSard = useMemo(() => queue.filter((q) => q.status === "passed"), [queue]);
  const finalFailed = useMemo(() => queue.filter((q) => q.status === "final_failed"), [queue]);

  const tabs: RoleTab[] = [
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
          defaultTab="attendance"
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
