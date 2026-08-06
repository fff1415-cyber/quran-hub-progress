import { useMemo } from "react";
import { hasPerm } from "@/lib/permissions";
import { getSessionRole } from "@/lib/session-role";
import { LateSardList, ActiveSardList } from "@/components/SardLists";
import { ManagerSubTabs, type ManagerSubTab } from "@/components/role-workspace/ManagerSubTabs";
import {
  SupervisorHalaqatPanel,
  SupervisorApprovalsPanel,
  SupervisorForceRetryPanel,
  SupervisorPassedPanel,
  SupervisorPlanCompletedPanel,
} from "@/components/role-workspace/RoleSections";
import { ForwardedTransfersPanel } from "@/components/role-workspace/ForwardedTransfersPanel";
import { SupervisorPlansPanel } from "@/components/plans/SupervisorPlansPanel";
import { WeeklyTestsOverviewPanel } from "@/components/WeeklyTestsOverviewPanel";
import { SupervisorHalaqaResultsPanel } from "@/components/role-workspace/SupervisorHalaqaResultsPanel";
import {
  Mic, CheckCircle2, RotateCcw, Award,
  GraduationCap, BookOpen, ClipboardCheck, Send, BarChart3,
} from "lucide-react";
import type { PermissionKey } from "@/lib/permissions";

type Props = {
  section: string;
  onSectionChange: (id: string) => void;
};

type SubTab = ManagerSubTab & { perm?: PermissionKey; roles?: string[] };

function filterSubTabs(tabs: SubTab[]): ManagerSubTab[] {
  const role = getSessionRole();
  return tabs.filter((t) => {
    if (t.roles && t.roles.length > 0 && !t.roles.includes(role ?? "") && role !== "manager") {
      return false;
    }
    if (t.perm && !hasPerm(role, null, t.perm)) return false;
    return true;
  });
}

export function SupervisorSardPanel({
  section,
  onSectionChange,
  awaitingCount,
  scheduledCount,
  passedCount,
}: Props & { awaitingCount: number; scheduledCount: number; passedCount: number }) {
  const tabs = useMemo(
    () =>
      filterSubTabs([
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
          label: "الموافقات",
          icon: CheckCircle2,
          perm: "approve_sard",
          badge: awaitingCount,
          content: <SupervisorApprovalsPanel />,
        },
        {
          id: "force-retry",
          label: "بانتظار الإعادة",
          icon: RotateCcw,
          perm: "force_retry",
          badge: scheduledCount,
          content: <SupervisorForceRetryPanel />,
        },
        {
          id: "passed",
          label: "المجتازون",
          icon: Award,
          perm: "view_attendance",
          badge: passedCount,
          content: <SupervisorPassedPanel />,
        },
      ]),
    [awaitingCount, scheduledCount, passedCount],
  );

  return <ManagerSubTabs tabs={tabs} value={section} onValueChange={onSectionChange} />;
}

export function SupervisorPlansPanelGroup({
  section,
  onSectionChange,
  planCompletedCount,
}: Props & { planCompletedCount: number }) {
  const tabs = useMemo(
    () =>
      filterSubTabs([
        {
          id: "plans",
          label: "الخطط التعليمية",
          icon: GraduationCap,
          roles: ["supervisor"],
          perm: "manage_plans",
          content: <SupervisorPlansPanel />,
        },
        {
          id: "plan-completed",
          label: "إكمال الخطة",
          icon: GraduationCap,
          roles: ["supervisor"],
          perm: "manage_plans",
          badge: planCompletedCount,
          content: <SupervisorPlanCompletedPanel />,
        },
      ]),
    [planCompletedCount],
  );

  return <ManagerSubTabs tabs={tabs} value={section} onValueChange={onSectionChange} />;
}

export function SupervisorOversightPanel({
  section,
  onSectionChange,
  forwardedTransfers,
}: Props & { forwardedTransfers: number }) {
  const tabs = useMemo(
    () =>
      filterSubTabs([
        {
          id: "halaqat",
          label: "الحلقات",
          icon: BookOpen,
          perm: "view_attendance",
          content: <SupervisorHalaqatPanel />,
        },
        {
          id: "halaqa-results",
          label: "نتائج الحلقات",
          icon: BarChart3,
          perm: "view_attendance",
          content: <SupervisorHalaqaResultsPanel />,
        },
        {
          id: "weekly-tests",
          label: "الاختبارات الأسبوعية",
          icon: ClipboardCheck,
          perm: "view_attendance",
          content: <WeeklyTestsOverviewPanel />,
        },
        {
          id: "transfers",
          label: "التحويلات",
          icon: Send,
          perm: "view_attendance",
          badge: forwardedTransfers,
          content: <ForwardedTransfersPanel role="supervisor" />,
        },
      ]),
    [forwardedTransfers],
  );

  return <ManagerSubTabs tabs={tabs} value={section} onValueChange={onSectionChange} />;
}
