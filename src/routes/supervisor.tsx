import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { loadSardQueue, countTransfersForRole } from "@/lib/mock-data";
import { listStudentFollowups, STUDENT_FOLLOWUPS_CHANGED } from "@/lib/student-followups";
import { getSessionName, getSessionRole } from "@/lib/session-role";
import { StaffAttendancePromptDialog } from "@/components/StaffAttendancePromptDialog";
import {
  COMPLEX_STAFF_HALAQA_ID,
  COMPLEX_STAFF_HALAQA_NAME,
  shouldPromptStaffAttendance,
} from "@/lib/staff-attendance";
import { AppHeader } from "@/components/AppHeader";
import { RoleShell, RolePageHeader, type RoleTab } from "@/components/role-workspace/RoleShell";
import {
  SupervisorSardPanel,
  SupervisorPlansPanelGroup,
  SupervisorOversightPanel,
} from "@/components/role-workspace/SupervisorPanels";
import { Eye, Mic, GraduationCap, BookOpen } from "lucide-react";
import { Toaster } from "sonner";

const MAIN_TABS = ["sard", "plans", "oversight"] as const;
type MainTab = (typeof MAIN_TABS)[number];

const DEFAULT_SECTION: Record<MainTab, string> = {
  sard: "sard",
  plans: "plans",
  oversight: "halaqat",
};

const VALID_SECTIONS: Record<MainTab, string[]> = {
  sard: ["sard", "approvals", "force-retry", "passed"],
  plans: ["plans", "plan-completed"],
  oversight: ["halaqat", "student-followups", "halaqa-results", "hifz-tracking", "weekly-tests", "transfers"],
};

const LEGACY_TAB: Record<string, { main: MainTab; section: string }> = {
  sard: { main: "sard", section: "sard" },
  approvals: { main: "sard", section: "approvals" },
  "force-retry": { main: "sard", section: "force-retry" },
  passed: { main: "sard", section: "passed" },
  plans: { main: "plans", section: "plans" },
  "plan-completed": { main: "plans", section: "plan-completed" },
  halaqat: { main: "oversight", section: "halaqat" },
  "student-followups": { main: "oversight", section: "student-followups" },
  "halaqa-results": { main: "oversight", section: "halaqa-results" },
  "hifz-tracking": { main: "oversight", section: "hifz-tracking" },
  "weekly-tests": { main: "oversight", section: "weekly-tests" },
  transfers: { main: "oversight", section: "transfers" },
};

function resolveMainTab(raw?: string): MainTab {
  if (raw && MAIN_TABS.includes(raw as MainTab)) return raw as MainTab;
  if (raw && LEGACY_TAB[raw]) return LEGACY_TAB[raw].main;
  return "sard";
}

function resolveSection(main: MainTab, tabRaw?: string, sectionRaw?: string): string {
  if (sectionRaw && VALID_SECTIONS[main].includes(sectionRaw)) return sectionRaw;
  if (tabRaw && LEGACY_TAB[tabRaw]?.main === main) return LEGACY_TAB[tabRaw].section;
  if (tabRaw && VALID_SECTIONS[main].includes(tabRaw)) return tabRaw;
  return DEFAULT_SECTION[main];
}

export function supervisorValidateSearch(s: Record<string, unknown>) {
  return {
    tab: typeof s.tab === "string" ? s.tab : undefined,
    section: typeof s.section === "string" ? s.section : undefined,
  };
}

export const Route = createFileRoute("/supervisor")({
  validateSearch: supervisorValidateSearch,
  component: SupervisorPage,
});

export function SupervisorPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as ReturnType<typeof supervisorValidateSearch>;
  const name = getSessionName("المشرف التعليمي");
  const [role, setRole] = useState<string | null>(null);
  const [queue, setQueue] = useState(() => loadSardQueue());
  const [dueFollowups, setDueFollowups] = useState(0);

  useEffect(() => {
    setRole(getSessionRole());
  }, []);

  useEffect(() => {
    const id = setInterval(() => setQueue(loadSardQueue()), 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const data = await listStudentFollowups();
        if (active) setDueFollowups(data.items.filter((item) => item.dueDate <= data.today && item.status === "active").length);
      } catch { /* Keep the last count while offline. */ }
    };
    void refresh();
    window.addEventListener(STUDENT_FOLLOWUPS_CHANGED, refresh);
    const timer = setInterval(() => void refresh(), 60_000);
    return () => { active = false; clearInterval(timer); window.removeEventListener(STUDENT_FOLLOWUPS_CHANGED, refresh); };
  }, []);

  const mainTab = resolveMainTab(search.tab);
  const section = resolveSection(mainTab, search.tab, search.section);

  const planCompleted = useMemo(() => queue.filter((q) => q.status === "plan_completed"), [queue]);
  const awaiting = useMemo(() => queue.filter((q) => q.status === "awaiting_supervisor"), [queue]);
  const scheduled = useMemo(() => queue.filter((q) => q.status === "scheduled"), [queue]);
  const passed = useMemo(() => queue.filter((q) => q.status === "passed"), [queue]);
  const forwardedTransfers = countTransfersForRole("supervisor");

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
      id: "sard",
      label: "السرد",
      icon: Mic,
      perm: "view_attendance",
      badge: awaiting.length + scheduled.length,
      content: (
        <SupervisorSardPanel
          section={section}
          onSectionChange={setSection}
          awaitingCount={awaiting.length}
          scheduledCount={scheduled.length}
          passedCount={passed.length}
        />
      ),
    },
    {
      id: "plans",
      label: "الخطط",
      icon: GraduationCap,
      roles: ["supervisor"],
      perm: "manage_plans",
      badge: planCompleted.length,
      content: (
        <SupervisorPlansPanelGroup
          section={section}
          onSectionChange={setSection}
          planCompletedCount={planCompleted.length}
        />
      ),
    },
    {
      id: "oversight",
      label: "المتابعة والإشراف",
      icon: BookOpen,
      perm: "view_attendance",
      badge: forwardedTransfers + dueFollowups,
      content: (
        <SupervisorOversightPanel
          section={section}
          onSectionChange={setSection}
          forwardedTransfers={forwardedTransfers}
        />
      ),
    },
  ];

  return (
    <div className="min-h-screen">
      <Toaster position="top-center" richColors />
      {name && role && shouldPromptStaffAttendance(role) && (
        <StaffAttendancePromptDialog
          role={role}
          name={name}
          halaqaId={COMPLEX_STAFF_HALAQA_ID}
          halaqaName={COMPLEX_STAFF_HALAQA_NAME}
        />
      )}
      <AppHeader title="الإشراف التعليمي" subtitle={name} />
      <main className="mx-auto px-4 py-8">
        <RoleShell
          className="max-w-5xl mx-auto"
          tabs={tabs}
          defaultTab="sard"
          activeTab={mainTab}
          onTabChange={setMainTab}
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
