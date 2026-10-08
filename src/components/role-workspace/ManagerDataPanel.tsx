import {
  CodesManagementSection,
  HalaqatManagementSection,
} from "@/components/admin/ManagerDataSections";
import { StudentImportPanel, StudentsManagementPanel } from "@/components/admin/StudentsAdminPanel";
import { ManagerSubTabs } from "@/components/role-workspace/ManagerSubTabs";
import { ManagerStudentEntriesPanel } from "@/components/role-workspace/ManagerStudentEntriesPanel";
import { BookOpen, FileSpreadsheet, Key, Users, ChartNoAxesColumn } from "lucide-react";

type Props = {
  section: string;
  onSectionChange: (id: string) => void;
};

export function ManagerDataPanel({ section, onSectionChange }: Props) {
  const tabs = [
    { id: "import", label: "استيراد", icon: FileSpreadsheet, content: <StudentImportPanel /> },
    { id: "halaqat", label: "الحلقات", icon: BookOpen, content: <HalaqatManagementSection /> },
    { id: "students", label: "الطلاب", icon: Users, content: <StudentsManagementPanel /> },
    { id: "codes", label: "الرموز والمعلمين", icon: Key, content: <CodesManagementSection /> },
    { id: "student-entries", label: "نشاط الدخول", icon: ChartNoAxesColumn, content: <ManagerStudentEntriesPanel /> },
  ];

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground px-1">استيراد وإدارة طلاب وحلقات ورموز الدخول.</p>
      <ManagerSubTabs tabs={tabs} value={section} onValueChange={onSectionChange} />
    </div>
  );
}
