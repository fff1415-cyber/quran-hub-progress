import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  loadSardQueue, loadNotifications, countTransfersForRole,
} from "@/lib/mock-data";
import { getSessionName } from "@/lib/session-role";
import { AppHeader } from "@/components/AppHeader";
import { RoleShell, RolePageHeader, type RoleTab } from "@/components/role-workspace/RoleShell";
import { ManagerInboxPanel } from "@/components/role-workspace/ManagerInboxPanel";
import { ManagerDataPanel } from "@/components/role-workspace/ManagerDataPanel";
import { ManagerGradesEvaluationPanel } from "@/components/role-workspace/ManagerGradesEvaluationPanel";
import { ManagerGeneralSettingsPanel } from "@/components/role-workspace/ManagerGeneralSettingsPanel";
import { ManagerStaffAttendanceMonitorPanel } from "@/components/ManagerStaffAttendanceMonitorPanel";
import {
  Crown, Inbox, Database, UserCheck, GraduationCap, Settings,
} from "lucide-react";
import { Toaster } from "sonner";

const MAIN_TABS = ["inbox", "data", "staff", "grades", "settings"] as const;
type MainTab = (typeof MAIN_TABS)[number];

const DEFAULT_SECTION: Record<MainTab, string> = {
  inbox: "transfers",
  data: "import",
  staff: "monitor",
  grades: "sard",
  settings: "branding",
};

const VALID_SECTIONS: Record<MainTab, string[]> = {
  inbox: ["transfers", "notifications"],
  data: ["import", "halaqat", "students", "codes"],
  staff: ["monitor"],
  grades: ["sard", "items", "weekly", "staff-settings"],
  settings: ["branding", "kiosk", "semesters", "messages", "student-portal"],
};

function resolveMainTab(raw?: string): MainTab {
  if (raw && MAIN_TABS.includes(raw as MainTab)) return raw as MainTab;
  return "inbox";
}

function resolveSection(main: MainTab, raw?: string): string {
  const allowed = VALID_SECTIONS[main];
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
  const navigate = useNavigate();
  const search = Route.useSearch();
  const name = getSessionName("المدير");

  const mainTab = resolveMainTab(search.tab);
  const section = resolveSection(mainTab, search.section);

  const inboxBadge = useMemo(() => {
    const queue = loadSardQueue();
    const notifs = loadNotifications();
    const pendingTransfers = countTransfersForRole("manager");
    const struggling = notifs.filter((n) => n.type === "transfer" && n.transferStatus === "struggling");
    const failedFinal = queue.filter((q) => q.status === "final_failed");
    const unread = notifs.filter((n) => !n.read);
    return pendingTransfers + struggling.length + failedFinal.length + unread.length;
  }, []);

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
      id: "staff",
      label: "العاملين",
      icon: UserCheck,
      roles: ["manager"],
      content: <ManagerStaffAttendanceMonitorPanel />,
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
