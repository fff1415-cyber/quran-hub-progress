import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { loadSardQueue } from "@/lib/mock-data";
import { getSessionName } from "@/lib/session-role";
import { AppHeader } from "@/components/AppHeader";
import { LateSardList, ActiveSardList } from "@/components/SardLists";
import { RoleShell, RolePageHeader, type RoleTab } from "@/components/role-workspace/RoleShell";
import {
  SupervisorHalaqatPanel,
  SupervisorApprovalsPanel,
  SupervisorForceRetryPanel,
  SupervisorPassedPanel,
} from "@/components/role-workspace/RoleSections";
import { Eye, BookOpen, Mic, CheckCircle2, Zap, Award } from "lucide-react";
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
  const [queue] = useState(() => loadSardQueue());

  const awaiting = useMemo(() => queue.filter((q) => q.status === "awaiting_supervisor"), [queue]);
  const scheduled = useMemo(() => queue.filter((q) => q.status === "scheduled"), [queue]);
  const passed = useMemo(() => queue.filter((q) => q.status === "passed"), [queue]);

  const tabs: RoleTab[] = [
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
