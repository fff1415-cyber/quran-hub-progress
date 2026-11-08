import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { listStudentFollowups, STUDENT_FOLLOWUPS_CHANGED } from "@/lib/student-followups";
import { StaffTasksPanel } from "@/components/StaffTasksPanel";
import { useStaffTaskCount } from "@/hooks/use-staff-task-count";
import {
  loadSardQueue, loadNotifications, countTransfersForRole, loadGeneralNotificationsForManager,
} from "@/lib/mock-data";
import { getSessionName } from "@/lib/session-role";
import { AppHeader } from "@/components/AppHeader";
import { RoleShell, RolePageHeader, type RoleTab } from "@/components/role-workspace/RoleShell";
import { ManagerInboxPanel } from "@/components/role-workspace/ManagerInboxPanel";
import { ManagerDataPanel } from "@/components/role-workspace/ManagerDataPanel";
import { ManagerGradesEvaluationPanel } from "@/components/role-workspace/ManagerGradesEvaluationPanel";
import { ManagerGeneralSettingsPanel } from "@/components/role-workspace/ManagerGeneralSettingsPanel";
import { ManagerStaffPanel } from "@/components/role-workspace/ManagerStaffPanel";
import { FinancialLedgerPanel } from "@/components/role-workspace/FinancialLedgerPanel";
import { ManagerAcademicReportsPanel } from "@/components/role-workspace/ManagerAcademicReportsPanel";
import {
  Crown, Inbox, Database, UserCheck, GraduationCap, Settings, Wallet, ListTodo, FileBarChart,
} from "lucide-react";
import { Toaster } from "sonner";

const MAIN_TABS = ["inbox", "tasks", "reports", "data", "finances", "staff", "grades", "settings"] as const;
type MainTab = (typeof MAIN_TABS)[number];

const DEFAULT_SECTION: Record<MainTab, string> = {
  inbox: "pending",
  tasks: "tasks",
  reports: "reports",
  data: "import",
  finances: "ledger",
  staff: "monitor",
  grades: "sard",
  settings: "branding",
};

const VALID_SECTIONS: Record<MainTab, string[]> = {
  inbox: ["pending", "struggling", "failed", "history", "notifications", "transfers"],
  tasks: ["tasks"],
  data: ["import", "halaqat", "students", "codes", "student-entries"],
  reports: ["reports"],
  finances: ["ledger"],
  staff: ["monitor", "report"],
  grades: ["sard", "items", "weekly", "staff-settings"],
  settings: ["branding", "kiosk", "semesters", "messages", "push-notifications", "teacher-features", "student-portal"],
};

function resolveMainTab(raw?: string): MainTab {
  if (raw && MAIN_TABS.includes(raw as MainTab)) return raw as MainTab;
  return "inbox";
}

function resolveSection(main: MainTab, raw?: string): string {
  const allowed = VALID_SECTIONS[main];
  if (main === "inbox" && raw === "transfers") return "pending";
  if (raw && allowed.includes(raw)) return raw;
  return DEFAULT_SECTION[main];
}

export function managerValidateSearch(s: Record<string, unknown>) {
  return {
    tab: typeof s.tab === "string" ? s.tab : undefined,
    section: typeof s.section === "string" ? s.section : undefined,
  };
}

export const Route = createFileRoute("/manager")({
  validateSearch: managerValidateSearch,
  component: ManagerPage,
});

export function ManagerPage() {
  const taskCount = useStaffTaskCount();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as ReturnType<typeof managerValidateSearch>;
  const name = getSessionName("المدير");
  const [followupTransferCount, setFollowupTransferCount] = useState(0);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const data = await listStudentFollowups();
        if (active) setFollowupTransferCount(data.items.filter((item) => item.status === "escalated").length);
      } catch { /* Retain last count when offline. */ }
    };
    void refresh();
    window.addEventListener(STUDENT_FOLLOWUPS_CHANGED, refresh);
    const timer = setInterval(() => void refresh(), 60_000);
    return () => { active = false; clearInterval(timer); window.removeEventListener(STUDENT_FOLLOWUPS_CHANGED, refresh); };
  }, []);

  const mainTab = resolveMainTab(search.tab);
  const section = resolveSection(mainTab, search.section);

  const inboxBadge = useMemo(() => {
    const queue = loadSardQueue();
    const pendingTransfers = countTransfersForRole("manager");
    const struggling = loadNotifications().filter(
      (n) => n.type === "transfer" && n.transferStatus === "struggling",
    );
    const failedFinal = queue.filter((q) => q.status === "final_failed");
    const generalUnread = loadGeneralNotificationsForManager().length;
    return pendingTransfers + followupTransferCount + struggling.length + failedFinal.length + generalUnread;
  }, [followupTransferCount]);

  const setMainTab = (tab: string) => {
    const next = resolveMainTab(tab);
    navigate({
      search: (prev) => ({
        ...prev,
        tab: next,
        section: DEFAULT_SECTION[next],
      }),
    });
  };

  const setSection = (nextSection: string) => {
    navigate({
      search: (prev) => ({
        ...prev,
        tab: mainTab,
        section: nextSection,
      }),
    });
  };

  const tabs: RoleTab[] = [
    { id: "tasks", label: "المهام", icon: ListTodo, roles: ["manager"], badge: taskCount, content: <StaffTasksPanel canCreate manager /> },
    { id: "reports", label: "التقارير", icon: FileBarChart, roles: ["manager"], content: <ManagerAcademicReportsPanel /> },
    {
      id: "inbox",
      label: "صندوق العمل",
      icon: Inbox,
      roles: ["manager"],
      badge: inboxBadge,
      content: <ManagerInboxPanel section={section} onSectionChange={setSection} />,
    },
    {
      id: "data",
      label: "البيانات",
      icon: Database,
      roles: ["manager"],
      content: <ManagerDataPanel section={section} onSectionChange={setSection} />,
    },
    {
      id: "finances",
      label: "المالية",
      icon: Wallet,
      roles: ["manager"],
      perm: "manage_finances",
      content: <FinancialLedgerPanel />,
    },
    {
      id: "staff",
      label: "العاملين",
      icon: UserCheck,
      roles: ["manager"],
      content: <ManagerStaffPanel section={section} onSectionChange={setSection} />,
    },
    {
      id: "grades",
      label: "الدرجات والتقييم",
      icon: GraduationCap,
      roles: ["manager"],
      content: <ManagerGradesEvaluationPanel section={section} onSectionChange={setSection} />,
    },
    {
      id: "settings",
      label: "الإعدادات",
      icon: Settings,
      roles: ["manager"],
      content: <ManagerGeneralSettingsPanel section={section} onSectionChange={setSection} />,
    },
  ];

  return (
    <div className="min-h-screen">
      <Toaster position="top-center" richColors />
      <AppHeader title="لوحة المدير" subtitle={name} />
      <main className="mx-auto px-4 py-8">
        <RoleShell
          className="max-w-5xl mx-auto"
          tabs={tabs}
          defaultTab="inbox"
          activeTab={mainTab}
          onTabChange={setMainTab}
          header={
            <RolePageHeader
              icon={Crown}
              title="لوحة المدير"
              description="قرارات، بيانات، وإعدادات المجمع — التشغيل اليومي عند السكرتير والمشرف"
            />
          }
        />
      </main>
    </div>
  );
}
