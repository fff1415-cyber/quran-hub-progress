import { useEffect, useMemo, useState } from "react";
import { loadHalaqat } from "@/lib/mock-data";
import type { AcademicCalendar } from "@/lib/academic-context";
import { fetchActiveCalendar } from "@/lib/academic-context";
import { ensureTarbawiSemester } from "@/lib/tarbawi-program";
import { ProgramSupervisorSettingsPanel } from "@/components/tarbawi/ProgramSupervisorSettingsPanel";
import { ProgramSupervisorApprovalsPanel } from "@/components/tarbawi/ProgramSupervisorApprovalsPanel";
import { ProgramSupervisorMonitorPanel } from "@/components/tarbawi/ProgramSupervisorMonitorPanel";
import { RoleShell, RolePageHeader, type RoleTab } from "@/components/role-workspace/RoleShell";
import { AppHeader } from "@/components/AppHeader";
import { getSessionName } from "@/lib/session-role";
import { listSubmittedTarbawiPlans } from "@/lib/tarbawi-program";
import { ClipboardList, Eye, Settings2, Loader2 } from "lucide-react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Toaster } from "sonner";

export function programSupervisorValidateSearch(s: Record<string, unknown>) {
  return {
    tab: typeof s.tab === "string" ? s.tab : undefined,
  };
}

export const Route = createFileRoute("/program-supervisor")({
  validateSearch: programSupervisorValidateSearch,
  component: ProgramSupervisorPage,
});

export function ProgramSupervisorPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const name = getSessionName("مشرف البرامج");
  const [calendar, setCalendar] = useState<AcademicCalendar | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchActiveCalendar(true)
      .then((cal) => {
        if (cancelled) return;
        ensureTarbawiSemester(cal.semester?.id ?? null);
        setCalendar(cal);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const pendingCount = useMemo(() => {
    if (!calendar?.semester?.id) return 0;
    return listSubmittedTarbawiPlans(calendar.semester.id).length;
  }, [calendar, loading]);

  const tab = search.tab ?? "monitor";

  const tabs: RoleTab[] = [
    {
      id: "monitor",
      label: "متابعة الحلقات",
      icon: Eye,
      roles: ["program_supervisor", "manager"],
      badge: undefined,
      content: calendar ? (
        <ProgramSupervisorMonitorPanel calendar={calendar} />
      ) : (
        <LoadingBlock />
      ),
    },
    {
      id: "approvals",
      label: "اعتماد الخطط",
      icon: ClipboardList,
      roles: ["program_supervisor", "manager"],
      badge: pendingCount || undefined,
      content: calendar ? (
        <ProgramSupervisorApprovalsPanel calendar={calendar} />
      ) : (
        <LoadingBlock />
      ),
    },
    {
      id: "settings",
      label: "إعدادات البرنامج",
      icon: Settings2,
      roles: ["program_supervisor", "manager"],
      content: calendar ? (
        <ProgramSupervisorSettingsPanel
          key={calendar.semester?.id ?? "default"}
          calendar={calendar}
          halaqat={loadHalaqat()}
        />
      ) : (
        <LoadingBlock />
      ),
    },
  ];

  return (
    <div className="min-h-screen">
      <Toaster position="top-center" richColors />
      <AppHeader title="مشرف البرامج" subtitle={name} />
      <main className="mx-auto px-4 py-8">
        <RoleShell
          className="max-w-6xl mx-auto"
          tabs={tabs}
          defaultTab="monitor"
          activeTab={tab}
          onTabChange={(t) => navigate({ search: (prev) => ({ ...prev, tab: t }) })}
          header={
            <RolePageHeader
              icon={ClipboardList}
              title="البرنامج التربوي"
              description="إعداد الفقرات، اعتماد خطط المعلّمين، ومتابعة التنفيذ"
            />
          }
        />
      </main>
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="glass-card rounded-2xl p-12 flex justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}
