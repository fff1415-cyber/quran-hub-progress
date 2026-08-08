import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { loadGrades, loadStudents, loadSardQueue, countTransfersForRole } from "@/lib/mock-data";
import { getCalendarDayKey } from "@/lib/operational-date";
import { fetchActiveCalendar } from "@/lib/academic-context";
import { getSessionName } from "@/lib/session-role";
import { AppHeader } from "@/components/AppHeader";
import { RoleShell, RolePageHeader, type RoleTab } from "@/components/role-workspace/RoleShell";
import {
  SecretaryDailyPanel,
  SecretaryStudentsPanel,
  SecretaryReportsPanel,
} from "@/components/role-workspace/SecretaryPanels";
import { FinancialLedgerPanel } from "@/components/role-workspace/FinancialLedgerPanel";
import { Clipboard, CalendarDays, Users, BarChart3, Wallet } from "lucide-react";
import { Toaster } from "sonner";
import type { WeekRecord } from "@/lib/mock-data";

const MAIN_TABS = ["daily", "students", "finances", "reports"] as const;
type MainTab = (typeof MAIN_TABS)[number];

const DEFAULT_SECTION: Record<MainTab, string> = {
  daily: "attendance",
  students: "profiles",
  finances: "ledger",
  reports: "plans",
};

const VALID_SECTIONS: Record<MainTab, string[]> = {
  daily: ["attendance", "transfers", "late-permit"],
  students: ["profiles", "students", "import", "export"],
  finances: ["ledger"],
  reports: ["plans", "weekly-tests", "sard"],
};

/** Legacy flat tab ids → new main + section (bookmarks / daily-operations redirect). */
const LEGACY_TAB: Record<string, { main: MainTab; section: string }> = {
  attendance: { main: "daily", section: "attendance" },
  transfers: { main: "daily", section: "transfers" },
  "late-permit": { main: "daily", section: "late-permit" },
  profiles: { main: "students", section: "profiles" },
  students: { main: "students", section: "students" },
  import: { main: "students", section: "import" },
  plans: { main: "reports", section: "plans" },
  "weekly-tests": { main: "reports", section: "weekly-tests" },
  sard: { main: "reports", section: "sard" },
};

function resolveMainTab(raw?: string): MainTab {
  if (raw && MAIN_TABS.includes(raw as MainTab)) return raw as MainTab;
  if (raw && LEGACY_TAB[raw]) return LEGACY_TAB[raw].main;
  return "daily";
}

function resolveSection(main: MainTab, tabRaw?: string, sectionRaw?: string): string {
  if (sectionRaw && VALID_SECTIONS[main].includes(sectionRaw)) return sectionRaw;
  if (tabRaw && LEGACY_TAB[tabRaw]?.main === main) return LEGACY_TAB[tabRaw].section;
  if (tabRaw && VALID_SECTIONS[main].includes(tabRaw)) return tabRaw;
  return DEFAULT_SECTION[main];
}

export function secretaryValidateSearch(s: Record<string, unknown>) {
  return {
    tab: typeof s.tab === "string" ? s.tab : undefined,
    section: typeof s.section === "string" ? s.section : undefined,
  };
}

export const Route = createFileRoute("/secretary")({
  validateSearch: secretaryValidateSearch,
  component: SecretaryPage,
});

export function SecretaryPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as ReturnType<typeof secretaryValidateSearch>;
  const name = getSessionName("السكرتير");
  const students = loadStudents();
  const grades = loadGrades();
  const todayKey = getCalendarDayKey();
  const [currentWeek, setCurrentWeek] = useState(1);
  const [queue] = useState(() => loadSardQueue());

  useEffect(() => {
    fetchActiveCalendar().then((cal) => setCurrentWeek(cal.currentWeekNumber)).catch(() => {});
  }, []);

  const mainTab = resolveMainTab(search.tab);
  const section = resolveSection(mainTab, search.tab, search.section);

  const todayCount = useMemo(() => {
    return students.filter((s) => {
      const w: WeekRecord | undefined = grades[s.id]?.[currentWeek];
      const status = w?.days[todayKey]?.attendance;
      return status === "absent" || status === "late";
    }).length;
  }, [students, grades, todayKey, currentWeek]);

  const passedSard = useMemo(() => queue.filter((q) => q.status === "passed"), [queue]);
  const finalFailed = useMemo(() => queue.filter((q) => q.status === "final_failed"), [queue]);
  const sardBadge = passedSard.length + finalFailed.length;
  const forwardedTransfers = countTransfersForRole("secretary");

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
      id: "daily",
      label: "المتابعة اليومية",
      icon: CalendarDays,
      perm: "view_attendance",
      badge: todayCount + forwardedTransfers,
      content: (
        <SecretaryDailyPanel
          section={section}
          onSectionChange={setSection}
          todayCount={todayCount}
          forwardedTransfers={forwardedTransfers}
        />
      ),
    },
    {
      id: "students",
      label: "الطلاب والبيانات",
      icon: Users,
      perm: "view_attendance",
      content: <SecretaryStudentsPanel section={section} onSectionChange={setSection} />,
    },
    {
      id: "finances",
      label: "المالية",
      icon: Wallet,
      perm: "manage_finances",
      content: <FinancialLedgerPanel />,
    },
    {
      id: "reports",
      label: "التقارير والخطط",
      icon: BarChart3,
      perm: "view_attendance",
      badge: sardBadge,
      content: (
        <SecretaryReportsPanel
          section={section}
          onSectionChange={setSection}
          sardBadge={sardBadge}
        />
      ),
    },
  ];

  return (
    <div className="min-h-screen">
      <Toaster position="top-center" richColors />
      <AppHeader title="لوحة السكرتير" subtitle={name} />
      <main className="mx-auto px-4 py-8">
        <RoleShell
          className="max-w-5xl mx-auto"
          tabs={tabs}
          defaultTab="daily"
          activeTab={mainTab}
          onTabChange={setMainTab}
          header={
            <RolePageHeader
              icon={Clipboard}
              title="لوحة السكرتير"
              description="متابعة الغياب والتأخر والسرد — أقسام حسب صلاحياتك"
            />
          }
        />
      </main>
    </div>
  );
}
