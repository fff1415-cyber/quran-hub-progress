import { ManagerStaffAttendanceMonitorPanel } from "@/components/ManagerStaffAttendanceMonitorPanel";
import { ManagerStaffAttendanceReportPanel } from "@/components/ManagerStaffAttendanceReportPanel";
import { ManagerSubTabs } from "@/components/role-workspace/ManagerSubTabs";
import { FileSpreadsheet, UserCheck } from "lucide-react";

type Props = {
  section: string;
  onSectionChange: (id: string) => void;
};

export function ManagerStaffPanel({ section, onSectionChange }: Props) {
  const tabs = [
    {
      id: "monitor",
      label: "متابعة اليوم",
      icon: UserCheck,
      content: <ManagerStaffAttendanceMonitorPanel />,
    },
    {
      id: "report",
      label: "تقرير الفترة",
      icon: FileSpreadsheet,
      content: <ManagerStaffAttendanceReportPanel />,
    },
  ];

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground px-1">متابعة حضور العاملين اليومي وتقارير الفترات السابقة.</p>
      <ManagerSubTabs tabs={tabs} value={section} onValueChange={onSectionChange} />
    </div>
  );
}
