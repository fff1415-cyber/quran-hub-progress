import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { loadSardQueue, countTransfersForRole } from "@/lib/mock-data";
import { getSessionName } from "@/lib/session-role";
import { AppHeader } from "@/components/AppHeader";
import { LateSardList, ActiveSardList } from "@/components/SardLists";
import { RoleShell, RolePageHeader, type RoleTab } from "@/components/role-workspace/RoleShell";
import {
  SupervisorHalaqatPanel,
  SupervisorApprovalsPanel,
  SupervisorForceRetryPanel,
  SupervisorPassedPanel,
  SupervisorPlanCompletedPanel,
} from "@/components/role-workspace/RoleSections";
import { ForwardedTransfersPanel } from "@/components/role-workspace/ForwardedTransfersPanel";
import { SupervisorPlansPanel } from "@/components/plans/SupervisorPlansPanel";
import { Eye, BookOpen, Mic, CheckCircle2, Zap, Award, Send, GraduationCap, ClipboardCheck } from "lucide-react";
import { WeeklyTestsOverviewPanel } from "@/components/WeeklyTestsOverviewPanel";
import { Toaster } from "sonner";

export const Route = createFileRoute("/supervisor")({
  validateSearch: (s: Record<string, unknown>) => ({
    tab: typeof s.tab === "string" ? s.tab : undefined,
  }),
  component: SupervisorPage,
});

function SupervisorPage() {
  const navigate = useNavigate({ from: "/supervisor" });
  const search = Route.useSearch();
  const name = getSessionName("المشرف التعليمي");
  const [queue, setQueue] = useState(() => loadSardQueue());

  useEffect(() => {
    const id = setInterval(() => setQueue(loadSardQueue()), 5000);
    return () => clearInterval(id);
  }, []);

  const planCompleted = useMemo(() => queue.filter((q) => q.status === "plan_completed"), [queue]);

  const awaiting = useMemo(() => queue.filter((q) => q.status === "awaiting_supervisor"), [queue]);
  const scheduled = useMemo(() => queue.filter((q) => q.status === "scheduled"), [queue]);
  const passed = useMemo(() => queue.filter((q) => q.status === "passed"), [queue]);
  const forwardedTransfers = countTransfersForRole("supervisor");

  const tabs: RoleTab[] = [
    {
      id: "plans",
      label: "الخطط التعليمية",
      icon: GraduationCap,
      roles: ["supervisor"],
      content: <SupervisorPlansPanel />,
    },
    {
      id: "plan-completed",
      label: "إكمال الخطة",
      icon: GraduationCap,
      roles: ["supervisor"],
      badge: planCompleted.length,
      content: <SupervisorPlanCompletedPanel />,
    },
    {
      id: "transfers",
      label: "التحويلات",
      icon: Send,
      perm: "view_attendance",
      badge: forwardedTransfers,
      content: <ForwardedTransfersPanel role="supervisor" />,
    },
    {
      id: "weekly-tests",
      label: "الاختبارات الأسبوعية",
      icon: ClipboardCheck,
      perm: "view_attendance",
      content: <WeeklyTestsOverviewPanel />,
    },
    {
      id: "halaqat",
      label: "الحلقات",
      icon: BookOpen,
      perm: "view_attendance",
      content: <SupervisorHalaqatPanel />,
    },
    {
      id: "sard",
      label: "السرد",
      icon: Mic,
      perm: "view_attendance",
      content: (
        <div className="space-y-6">
          <ActiveSardList />
          <LateSardList />
        </div>
      ),
    },
    {
      id: "approvals",
      label: "موافقات",
      icon: CheckCircle2,
      perm: "approve_sard",
      badge: awaiting.length,
      content: <SupervisorApprovalsPanel />,
    },
    {
      id: "force-retry",
      label: "إعادة فورية",
      icon: Zap,
      perm: "force_retry",
      badge: scheduled.length,
      content: <SupervisorForceRetryPanel />,
    },
    {
      id: "passed",
      label: "المجتازون",
      icon: Award,
      perm: "view_attendance",
      badge: passed.length,
      content: <SupervisorPassedPanel />,
    },
  ];

  const setTab = (tab: string) => {
    navigate({ search: (prev) => ({ ...prev, tab }) });
  };

  return (
    <div className="min-h-screen">
      <Toaster position="top-center" richColors />
      <AppHeader title="الإشراف التعليمي" subtitle={name} />
      <main className="mx-auto px-4 py-8">
        <RoleShell
          className="max-w-5xl mx-auto"
          tabs={tabs}
          defaultTab="halaqat"
          activeTab={search.tab}
          onTabChange={setTab}
          header={
            <RolePageHeader
              icon={Eye}
              title="الإشراف التعليمي"
              description="متابعة الحلقات والسرد — موافقات وإعادة سرد حسب صلاحياتك"
            />
          }
        />
      </main>
    </div>
  );
}
