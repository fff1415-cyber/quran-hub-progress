import { ManagerEvaluationSettingsPanel } from "@/components/role-workspace/ManagerEvaluationSettingsPanel";
import { ManagerSubTabs } from "@/components/role-workspace/ManagerSubTabs";
import { GradeItemsSection } from "@/components/admin/ManagerDataSections";
import { ManagerWeeklyTestsSettingsPanel } from "@/components/ManagerWeeklyTestsSettingsPanel";
import { ManagerStaffAttendanceSettingsPanel } from "@/components/ManagerStaffAttendanceSettingsPanel";
import { ClipboardCheck, ClipboardList, Clock, Settings } from "lucide-react";

type Props = {
  section: string;
  onSectionChange: (id: string) => void;
};

export function ManagerGradesEvaluationPanel({ section, onSectionChange }: Props) {
  const tabs = [
    {
      id: "sard",
      label: "درجات السرد",
      icon: ClipboardList,
      content: <ManagerEvaluationSettingsPanel />,
    },
    {
      id: "items",
      label: "بنود الدرجات",
      icon: Settings,
      content: <GradeItemsSection />,
    },
    {
      id: "weekly",
      label: "الاختبارات الأسبوعية",
      icon: ClipboardCheck,
      content: <ManagerWeeklyTestsSettingsPanel />,
    },
    {
      id: "staff-settings",
      label: "حضور العاملين",
      icon: Clock,
      content: <ManagerStaffAttendanceSettingsPanel />,
    },
  ];

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground px-1">قواعد الدرجات والتقييم — تُضبط مرة وتُطبَّق على المجمع.</p>
      <ManagerSubTabs tabs={tabs} value={section} onValueChange={onSectionChange} />
    </div>
  );
}
