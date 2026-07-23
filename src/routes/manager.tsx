import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  loadSardQueue, loadNotifications, loadAttendanceArchive, countTransfersForRole,
} from "@/lib/mock-data";
import { getSessionName } from "@/lib/session-role";
import { AppHeader } from "@/components/AppHeader";
import { SemesterSetupForm } from "@/components/SemesterSetupForm";
import { SemesterEditForm } from "@/components/SemesterEditForm";
import { DailyOperations } from "@/components/DailyOperations";
import { RoleShell, RolePageHeader, type RoleTab } from "@/components/role-workspace/RoleShell";
import { AdminOverviewPanel } from "@/components/role-workspace/AdminOverviewPanel";
import { ManagerTransfersPanel } from "@/components/role-workspace/ManagerTransfersPanel";
import { ManagerRecordsPanel } from "@/components/role-workspace/ManagerRecordsPanel";
import { ManagerSettingsPanel } from "@/components/role-workspace/ManagerSettingsPanel";
import { ManagerEvaluationSettingsPanel } from "@/components/role-workspace/ManagerEvaluationSettingsPanel";
import { ManagerHalaqaFieldsPanel } from "@/components/role-workspace/ManagerHalaqaFieldsPanel";
import { ManagerWeeklyTestsSettingsPanel } from "@/components/ManagerWeeklyTestsSettingsPanel";
import { WeeklyTestsOverviewPanel } from "@/components/WeeklyTestsOverviewPanel";
import {
  Crown, CalendarDays, ClipboardList, Send, BarChart3, FolderArchive, MessageSquare, LayoutDashboard, Scale, Columns3, ClipboardCheck,
} from "lucide-react";
import { Toaster } from "sonner";

export const Route = createFileRoute("/manager")({
  validateSearch: (s: Record<string, unknown>) => ({
    tab: typeof s.tab === "string" ? s.tab : undefined,
  }),
  component: ManagerPage,
});

function ManagerPage() {
  const navigate = useNavigate({ from: "/manager" });
  const search = Route.useSearch();
  const name = getSessionName("المدير");

  const [queue] = useState(() => loadSardQueue());
  const archive = loadAttendanceArchive();
  const [notifs] = useState(() => loadNotifications());

  const pendingTransfers = countTransfersForRole("manager");
  const struggling = useMemo(
    () => notifs.filter((n) => n.type === "transfer" && n.transferStatus === "struggling"),
    [notifs],
  );
  const failedFinal = useMemo(() => queue.filter((q) => q.status === "final_failed"), [queue]);
  const absenceArchive = useMemo(() => archive.filter((a) => a.type === "absent"), [archive]);
  const lateArchive = useMemo(() => archive.filter((a) => a.type === "late"), [archive]);

  const tabs: RoleTab[] = [
    {
      id: "calendar",
      label: "التقويم",
      icon: CalendarDays,
      roles: ["manager"],
      content: (
        <div className="space-y-6">
          <div className="ring-2 ring-success/25 rounded-2xl">
            <SemesterEditForm />
          </div>
          <div className="ring-2 ring-primary/25 rounded-2xl">
            <SemesterSetupForm />
          </div>
        </div>
      ),
    },
    {
      id: "operations",
      label: "المتابعة اليومية",
      icon: ClipboardList,
      perm: "view_attendance",
      content: (
        <div className="glass-card rounded-2xl p-5 md:p-6">
          <DailyOperations />
        </div>
      ),
    },
    {
      id: "transfers",
      label: "التحويلات",
      icon: Send,
      roles: ["manager"],
      badge: pendingTransfers + struggling.length + failedFinal.length,
      content: <ManagerTransfersPanel />,
    },
    {
      id: "overview",
      label: "المتابعة والإشعارات",
      icon: BarChart3,
      perm: "view_attendance",
      roles: ["manager"],
      content: <AdminOverviewPanel />,
    },
    {
      id: "records",
      label: "السجلات",
      icon: FolderArchive,
      perm: "view_attendance",
      roles: ["manager"],
      badge: absenceArchive.length + lateArchive.length,
      content: <ManagerRecordsPanel />,
    },
    {
      id: "halaqa-fields",
      label: "أعمدة الحلقات",
      icon: Columns3,
      roles: ["manager"],
      content: <ManagerHalaqaFieldsPanel />,
    },
    {
      id: "weekly-tests",
      label: "الاختبارات الأسبوعية",
      icon: ClipboardCheck,
      roles: ["manager"],
      content: (
        <div className="space-y-6">
          <ManagerWeeklyTestsSettingsPanel />
          <WeeklyTestsOverviewPanel />
        </div>
      ),
    },
    {
      id: "evaluation-settings",
      label: "لائحة التقييم",
      icon: Scale,
      roles: ["manager"],
      content: <ManagerEvaluationSettingsPanel />,
    },
    {
      id: "settings",
      label: "إعدادات الرسائل",
      icon: MessageSquare,
      roles: ["manager"],
      content: <ManagerSettingsPanel />,
    },
  ];

  const setTab = (tab: string) => {
    navigate({ search: (prev) => ({ ...prev, tab }) });
  };

  return (
    <div className="min-h-screen">
      <Toaster position="top-center" richColors />
      <AppHeader title="لوحة المدير" subtitle={name} />
      <main className="mx-auto px-4 py-8">
        <RoleShell
          className="max-w-5xl mx-auto"
          tabs={tabs}
          defaultTab="operations"
          activeTab={search.tab}
          onTabChange={setTab}
          header={
            <>
              <RolePageHeader
                icon={Crown}
                title="لوحة المدير"
                description="إدارة عليا — كل الأقسام حسب صلاحياتك في مكان واحد"
                extra={
                  <Link to="/dashboard" className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-lg border border-primary/30 text-primary text-sm font-bold hover:bg-primary/10">
                    <LayoutDashboard className="w-4 h-4" />
                    لوحة التحكم — طلاب وحلقات واستيراد
                  </Link>
                }
              />
            </>
          }
        />
      </main>
    </div>
  );
}
