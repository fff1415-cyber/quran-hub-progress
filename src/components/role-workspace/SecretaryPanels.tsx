import { useMemo } from "react";
import { hasPerm } from "@/lib/permissions";
import { getSessionRole } from "@/lib/session-role";
import { GradesExport } from "@/components/GradesExport";
import { ManagerSubTabs, type ManagerSubTab } from "@/components/role-workspace/ManagerSubTabs";
import {
  SecretaryAttendancePanel,
  SecretaryAbsenceThresholdPanel,
  SecretaryLatePermitPanel,
  SecretarySardPanel,
} from "@/components/role-workspace/RoleSections";
import { SecretaryStudentProfilesPanel } from "@/components/role-workspace/SecretaryStudentProfilesPanel";
import { ForwardedTransfersPanel } from "@/components/role-workspace/ForwardedTransfersPanel";
import { PlanStudentLookup } from "@/components/plans/SupervisorPlansPanel";
import { StudentImportPanel, StudentsManagementPanel } from "@/components/admin/StudentsAdminPanel";
import { WeeklyTestsOverviewPanel } from "@/components/WeeklyTestsOverviewPanel";
import {
  UserX, Send, Clock, Users, FileSpreadsheet, Download,
  GraduationCap, ClipboardCheck, Mic,
} from "lucide-react";
import type { PermissionKey } from "@/lib/permissions";

type Props = {
  section: string;
  onSectionChange: (id: string) => void;
};

type SubTab = ManagerSubTab & { perm?: PermissionKey };

function filterSubTabs(tabs: SubTab[]): ManagerSubTab[] {
  const role = getSessionRole();
  return tabs.filter((t) => !t.perm || hasPerm(role, null, t.perm));
}

export function SecretaryDailyPanel({
  section,
  onSectionChange,
  todayCount,
  forwardedTransfers,
}: Props & { todayCount: number; forwardedTransfers: number }) {
  const tabs = useMemo(
    () =>
      filterSubTabs([
        {
          id: "attendance",
          label: "الغياب والتأخر",
          icon: UserX,
          perm: "view_attendance",
          badge: todayCount,
          content: (
            <div className="space-y-6">
              <SecretaryAttendancePanel />
              <SecretaryAbsenceThresholdPanel />
            </div>
          ),
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
          id: "late-permit",
          label: "إذن الدخول",
          icon: Clock,
          perm: "force_retry",
          content: <SecretaryLatePermitPanel />,
        },
      ]),
    [todayCount, forwardedTransfers],
  );

  return <ManagerSubTabs tabs={tabs} value={section} onValueChange={onSectionChange} />;
}

export function SecretaryStudentsPanel({ section, onSectionChange }: Props) {
  const tabs = useMemo(
    () =>
      filterSubTabs([
        {
          id: "profiles",
          label: "ملفات الطلاب",
          icon: Users,
          perm: "view_attendance",
          content: <SecretaryStudentProfilesPanel />,
        },
        {
          id: "students",
          label: "إدارة الطلاب",
          icon: Users,
          perm: "manage_students",
          content: <StudentsManagementPanel />,
        },
        {
          id: "import",
          label: "استيراد الطلاب",
          icon: FileSpreadsheet,
          perm: "import_sheets",
          content: <StudentImportPanel />,
        },
        {
          id: "export",
          label: "تصدير الدرجات",
          icon: Download,
          perm: "view_attendance",
          content: <GradesExport />,
        },
      ]),
    [],
  );

  return <ManagerSubTabs tabs={tabs} value={section} onValueChange={onSectionChange} />;
}

export function SecretaryReportsPanel({
  section,
  onSectionChange,
  sardBadge,
}: Props & { sardBadge: number }) {
  const tabs = useMemo(
    () =>
      filterSubTabs([
        {
          id: "plans",
          label: "الخطط التراكمية",
          icon: GraduationCap,
          perm: "view_attendance",
          content: <PlanStudentLookup readOnly />,
        },
        {
          id: "weekly-tests",
          label: "الاختبارات الأسبوعية",
          icon: ClipboardCheck,
          perm: "view_attendance",
          content: <WeeklyTestsOverviewPanel readOnly />,
        },
        {
          id: "sard",
          label: "السرد",
          icon: Mic,
          perm: "view_attendance",
          badge: sardBadge,
          content: <SecretarySardPanel />,
        },
      ]),
    [sardBadge],
  );

  return <ManagerSubTabs tabs={tabs} value={section} onValueChange={onSectionChange} />;
}
